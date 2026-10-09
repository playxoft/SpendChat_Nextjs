import "server-only";
import { and, asc, desc, eq, gt, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiTopups, aiUsageLog } from "@/db/schema";
import { ApiError, planLimit, rateLimited, type PlanLimitDetails } from "@/lib/errors";
import {
  aiActionsUsedThisMonth,
  aiAllowanceError,
  getWorkspaceEntitlements,
  liveTopUps,
  type WorkspaceEntitlements,
} from "@/lib/entitlements";
import { VOICE, voiceActionsFor } from "@/lib/plans";
import { describeError, logger } from "@/lib/logger";
import type { AiUsage } from "@/lib/ai-provider";

/**
 * Advisory-lock namespace for the per-user charge lock (`email-quota.ts` is 2,
 * invites 3). It once guarded an hourly cap on AI calls; that pacing is now the
 * per-person `ai` rate limit (`lib/rate-limit`, abuse rule C8), and the lock
 * stays for the reason in `chargeUnderLocks`.
 */
const LOCK_NAMESPACE = 1;

/** Advisory-lock namespace for the monthly allowance — see `chargeUnderLocks`. */
const ALLOWANCE_LOCK_NAMESPACE = 4;

/**
 * How long after a paid transcription its transcript may be parsed for free.
 * Long enough to read and fix a two-minute transcript; short enough that a
 * paid clip can't be banked for later typed notes.
 */
export const VOICE_PARSE_WINDOW_MS = 15 * 60 * 1000;

/**
 * What each `ai_usage_log.kind` means. The pairing that makes "voice =
 * transcribe + parse" cost one action per started minute reads these, so they
 * are part of the ledger's contract, not just labels.
 */
export const AI_KIND = {
  /** A typed note's parse: 1 action. */
  parse: "transaction_parse",
  /** The parse of a just-transcribed note: 0 actions (the clip paid for it). */
  voiceParse: "transaction_parse_voice",
  /** A voice clip: one action per started minute. */
  transcribe: "voice_transcribe",
  /** One question to Ask, answered from the workspace's data: 1 action. */
  chat: "ai_chat",
} as const;
export type AiKind = (typeof AI_KIND)[keyof typeof AI_KIND];

/**
 * Appended to `kind` when a charged call fails on our side (see `withAiCharge`):
 * the row stays — it was still a provider call, and the audit trail keeps it —
 * but it no longer counts as an action, as a paid transcription, or as a used
 * voice parse.
 */
const FAILED_SUFFIX = "_failed";

/** Losing the per-user charge lock: this person's previous AI call is still being charged. */
const BUSY_MESSAGE = "Another AI request of yours is still running — try again in a moment.";

/** A charged AI call: its ledger row, and what it cost. */
export type AiCharge = {
  id: string;
  kind: AiKind;
  units: number;
  /** Who and where — settling a refunded transcription re-checks the voice pairing. */
  userId: string;
  workspaceId: string;
  /**
   * AI actions the workspace has left this month once this charge is counted,
   * read under the charge's own locks — so the "38 of 50 left" line can move
   * after a use without a second query. Null for a charge of 0 units (a voice
   * clip's parse), which doesn't count the allowance at all.
   */
  remaining: number | null;
  /** The monthly allowance the remainder is out of. */
  limit: number;
  /** How many of `units` a top-up paid for (C4) — given back if the call is refunded. */
  topupUnits: number;
  /** Top-up actions the workspace has left after this charge; null for a 0-unit charge. */
  topUpRemaining: number | null;
};

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Check and record one AI call, in one transaction, before it reaches a paid
 * provider (and after any permission checks — denied calls must not burn
 * quota). The budget checked here is **the workspace's monthly AI allowance**
 * (`aiActionsPerMonth`, 403 `plan_limit`), counted in AI actions (`units`) over
 * `aiUsageScope` — so plan changes never reset it (C1, C3), and a Free
 * workspace also counts its owner's other Free usage this month, deleted
 * workspaces included (C2).
 *
 * How *fast* one person may call AI is not decided here: that's the per-person
 * `ai` rate limit (1 / 5 / 60-minute windows by plan, abuse rule C8), applied
 * at the request seams before this runs (`lib/rate-limit`). It replaced the
 * hourly cap this function used to count.
 *
 * Throwing anywhere rolls the transaction back: a refused call inserts nothing
 * and releases both locks, so it spent nothing.
 *
 * **Why counting needs locks at all.** Counting and then inserting is not a cap:
 * fire fifty requests at once and all fifty read the same under-limit count, so
 * the limit holds only against a caller polite enough to go one at a time —
 * which is not the caller it exists to stop. Folding both into a single
 * `INSERT ... SELECT ... WHERE (sum) < limit` looks like it fixes that and
 * does not: under READ COMMITTED the subquery reads a statement snapshot that
 * excludes other sessions' uncommitted rows, and `INSERT` takes only
 * `RowExclusiveLock`, which doesn't conflict with itself. Two concurrent
 * statements both see 49 of 50 used, both insert, and the workspace is at 51.
 *
 * **Why the per-user lock, and why it's the try form.** It's taken first, and
 * it is what keeps the *blocking* allowance lock below safe: with it, at most
 * one transaction per person can ever be waiting there. Without it, a burst
 * from one account would queue on the allowance lock — the rate limiter counts
 * requests per window, not how many are in flight, so a minute's budget can
 * arrive all at once (and in `next dev` there is no limiter at all) — each
 * waiter holding a real Neon connection: a quota check
 * that amplifies into connection exhaustion for every other user of the
 * database. `pg_try_advisory_xact_lock` returns immediately instead, and losing
 * the race *is* the answer: a second call arriving while this person's previous
 * one is still being charged is refused (429, retry in a second) rather than
 * queued. The lock is released when the transaction ends, rollback included, so
 * a failure can't strand it.
 *
 * The key is namespaced (`LOCK_NAMESPACE`, two-argument form) so this doesn't
 * collide with `email-quota.ts`, which locks on the same user id. The two
 * counters share nothing, and without the namespace a user's invite emails and
 * their AI requests would block each other for no reason.
 *
 * **Why the allowance lock blocks.** The per-user lock can't protect the monthly
 * allowance: it's shared by everyone in the workspace, so two members' calls
 * hold different user locks and would both read the same under-limit sum. A
 * second lock on the allowance's own scope serializes them, and here the
 * blocking form is the right one: by the time a caller asks for it, it already
 * holds its own per-user try-lock, so at most one transaction *per member* can
 * be waiting — ≤10 on the largest plan — and each holds the lock only for a
 * count and an insert. Refusing instead would bounce a member's legitimate
 * request because a teammate happened to press send at the same moment.
 * Deadlock-free: every path takes the user lock first and never waits for it,
 * so a transaction holding the allowance lock never waits on anything.
 *
 * The allowance lock is keyed on the scope it guards: the workspace for a paid
 * plan, but the **owner** for a Free one, because a Free allowance belongs to
 * the person across all their Free workspaces (C2) — two of them charging at
 * once must serialize too. Owner and workspace ids are distinct uuids, so one
 * namespace serves both.
 *
 * The log table is both the audit trail and the counter: the allowance sums
 * `units` (actions).
 */
async function chargeUnderLocks(
  userId: string,
  workspaceId: string,
  decide: (tx: Tx, now: Date) => Promise<{ kind: AiKind; units: number }>,
): Promise<AiCharge> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const now = new Date();
  const db = getDb();
  return db.transaction(async (tx) => {
    // Taken before anything is counted. `hashtext` maps the uuid onto the int4
    // key the lock takes; a collision with another user costs one refused
    // request, never a wrong answer, because the sum below is filtered by scope.
    const [lock] = (
      await tx.execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${userId})) as got`,
      )
    ).rows;
    if (!lock?.got) throw rateLimited(BUSY_MESSAGE, { bucket: "ai", retryAfterSeconds: 1 });

    // A hash collision here only serializes two unrelated scopes for the
    // length of a count — never a wrong answer, since the sum below is filtered.
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ALLOWANCE_LOCK_NAMESPACE}, hashtext(${allowanceLockKey(ent)}))`,
    );

    const { kind, units } = await decide(tx, now);

    // A call that charges nothing (a voice clip's parse) can't overdraw the
    // allowance, so it isn't refused by it — even at the limit, the clip that
    // was already paid for gets its parse.
    const limit = ent.limits.aiActionsPerMonth;
    let remaining: number | null = null;
    let topupUnits = 0;
    let topUpRemaining: number | null = null;
    if (units > 0) {
      const used = await aiActionsUsedThisMonth(ent, now, tx);
      const monthlyLeft = Math.max(0, limit - used);
      const fromMonthly = Math.min(units, monthlyLeft);
      // Top-ups pay only for what the monthly allowance can't (C4), oldest-
      // expiring first, under this same lock — so two members can't both
      // spend the last top-up action.
      const spend = await spendTopUps(tx, workspaceId, units - fromMonthly, now);
      if (!spend) throw allowanceError(ent, used, units, await topUpBalanceIn(tx, workspaceId, now));
      topupUnits = units - fromMonthly;
      remaining = monthlyLeft - fromMonthly;
      topUpRemaining = spend.left;
    }

    const [inserted] = await tx
      .insert(aiUsageLog)
      .values({ userId, workspaceId, kind, units, topupUnits, ownerId: ent.ownerId, plan: ent.plan })
      .returning({ id: aiUsageLog.id });
    return { id: inserted!.id, kind, units, userId, workspaceId, remaining, limit, topupUnits, topUpRemaining };
  });
}

/** Top-up actions the workspace has left, read inside the charge's transaction. */
async function topUpBalanceIn(tx: Tx, workspaceId: string, now: Date): Promise<number> {
  const [row] = await tx
    .select({ n: sql<string>`coalesce(sum(${aiTopups.remaining}), 0)::text` })
    .from(aiTopups)
    .where(liveTopUps(workspaceId, now));
  return Number(row?.n ?? 0);
}

/**
 * Take `need` actions from the workspace's live top-ups, oldest-expiring
 * first; null (taking nothing) when they don't hold that many. Returns what's
 * left across them. Runs under the allowance lock (`chargeUnderLocks`), and
 * locks the rows it reads, so a concurrent refund's give-back can't be lost.
 */
async function spendTopUps(
  tx: Tx,
  workspaceId: string,
  need: number,
  now: Date,
): Promise<{ left: number } | null> {
  const rows = await tx
    .select({ id: aiTopups.id, remaining: aiTopups.remaining })
    .from(aiTopups)
    .where(liveTopUps(workspaceId, now))
    .orderBy(asc(aiTopups.expiresAt), asc(aiTopups.id))
    .for("update");
  const total = rows.reduce((n, r) => n + r.remaining, 0);
  if (need <= 0) return { left: total };
  if (total < need) return null;
  let rest = need;
  for (const row of rows) {
    if (rest === 0) break;
    const take = Math.min(row.remaining, rest);
    await tx
      .update(aiTopups)
      .set({ remaining: row.remaining - take })
      .where(eq(aiTopups.id, row.id));
    rest -= take;
  }
  return { left: total - need };
}

/**
 * Give a refunded call's top-up actions back: to the live top-ups with room,
 * **latest-expiring first** — the total is exact, and where the action came
 * from a top-up that has since run dry, it goes back where it lasts longest.
 * Never past a top-up's size. Actions from a top-up that has since expired or
 * been revoked are not returned — there's nothing to return them to.
 */
async function returnTopUpUnits(
  db: Pick<ReturnType<typeof getDb>, "select" | "update"> | Tx,
  workspaceId: string,
  units: number,
  now: Date = new Date(),
): Promise<void> {
  if (units <= 0) return;
  const rows = await db
    .select({ id: aiTopups.id, remaining: aiTopups.remaining, actions: aiTopups.actions })
    .from(aiTopups)
    .where(
      and(
        eq(aiTopups.workspaceId, workspaceId),
        gt(aiTopups.expiresAt, now),
        isNull(aiTopups.revokedAt),
        lt(aiTopups.remaining, aiTopups.actions),
      ),
    )
    .orderBy(desc(aiTopups.expiresAt), desc(aiTopups.id));
  let rest = units;
  for (const row of rows) {
    if (rest === 0) break;
    const give = Math.min(row.actions - row.remaining, rest);
    await db
      .update(aiTopups)
      .set({ remaining: sql`least(${aiTopups.actions}, ${aiTopups.remaining} + ${give})` })
      .where(eq(aiTopups.id, row.id));
    rest -= give;
  }
}

/** The allowance's lock key: the scope its sum covers (see `chargeUnderLocks`). */
function allowanceLockKey(ent: WorkspaceEntitlements): string {
  return ent.plan === "free" ? ent.ownerId : ent.workspaceId;
}

/**
 * The allowance is spent. When *some* is left but not enough — a two-minute
 * clip with one action remaining — say so, because "you've used all your
 * actions" would be false and a shorter clip would go through.
 */
function allowanceError(ent: WorkspaceEntitlements, used: number, units: number, topUps = 0): ApiError {
  const base = aiAllowanceError(ent, used);
  const remaining = Math.max(0, ent.limits.aiActionsPerMonth - used) + topUps;
  if (remaining <= 0) return base;
  return planLimit(
    `That clip needs ${units} AI actions (one per started minute), and this workspace has ${remaining} left this month — a clip under a minute needs just one.`,
    base.details as PlanLimitDetails,
  );
}

/**
 * Charge the parse of a note: one action for a typed note. A note that came
 * from a voice clip (`source: "voice"`) costs nothing — the clip's
 * transcription already paid one action per started minute for both steps —
 * but only if this user really has an unclaimed paid transcription in this
 * workspace within `VOICE_PARSE_WINDOW_MS`. The client only *claims* the note
 * was dictated; the ledger decides. Each paid transcription covers exactly one
 * voice parse, counted under the same locks as the charge, so a client that
 * labels every note "voice" gets one free parse per clip it actually paid for
 * and is charged for the rest like any typed note.
 */
export async function chargeAiParse(
  userId: string,
  workspaceId: string,
  opts: { source?: "typed" | "voice" } = {},
): Promise<AiCharge> {
  return chargeUnderLocks(userId, workspaceId, async (tx, now) => {
    if (opts.source !== "voice") return { kind: AI_KIND.parse, units: 1 };
    const since = new Date(now.getTime() - VOICE_PARSE_WINDOW_MS);
    const [row] = await tx
      .select({
        paid: sql<number>`(count(*) filter (where ${aiUsageLog.kind} = ${AI_KIND.transcribe} and ${aiUsageLog.units} > 0))::int`,
        claimed: sql<number>`(count(*) filter (where ${aiUsageLog.kind} = ${AI_KIND.voiceParse}))::int`,
      })
      .from(aiUsageLog)
      .where(
        and(
          eq(aiUsageLog.userId, userId),
          eq(aiUsageLog.workspaceId, workspaceId),
          gte(aiUsageLog.createdAt, since),
        ),
      );
    return Number(row?.paid ?? 0) > Number(row?.claimed ?? 0)
      ? { kind: AI_KIND.voiceParse, units: 0 }
      : { kind: AI_KIND.parse, units: 1 };
  });
}

/**
 * Charge a voice clip's transcription: one action per started minute of the
 * clip (`voiceActionsFor`), which also covers the parse of its transcript.
 *
 * `durationMs` is what the client declared, clamped to `VOICE.maxClipMs` — the
 * server can't measure a clip before sending it to the provider. A client that
 * declares nothing is charged for the longest clip it could have sent: both of
 * ours (the composer and the Flutter app) declare it, so only a stale or
 * hand-rolled client pays the maximum, and it can never pay less than it used.
 * A client that under-declares is bounded by `MAX_AUDIO_BYTES`, and the row's
 * provider-measured `audio_ms` (Gemini) makes it visible after the fact.
 *
 * Voice is a plan feature: the caller checks `assertVoiceAllowed` first.
 */
export async function chargeVoiceTranscribe(
  userId: string,
  workspaceId: string,
  opts: { durationMs: number | null },
): Promise<AiCharge> {
  const units = voiceActionsFor(opts.durationMs ?? VOICE.maxClipMs);
  return chargeUnderLocks(userId, workspaceId, async () => ({ kind: AI_KIND.transcribe, units }));
}

/**
 * Charge one question to Ask: one action, like a typed note. The caller has
 * already checked the question, the asker's edit access and the model; the
 * only gate here is the allowance.
 */
export async function chargeAiChat(userId: string, workspaceId: string): Promise<AiCharge> {
  return chargeUnderLocks(userId, workspaceId, async () => ({ kind: AI_KIND.chat, units: 1 }));
}

/**
 * Did the call fail on our side (provider down, garbage reply, AI not
 * configured, an unexpected error)? Those give the action back. A 4xx — the
 * model answered "there's nothing here" — keeps it: the model did the work.
 */
function failedOnOurSide(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status >= 500;
}

/**
 * Run the provider call a charge paid for, then settle its ledger row: record
 * the usage the provider reported (`input_tokens` / `output_tokens` /
 * `audio_ms`), and give the action back if the call failed on our side.
 *
 * `run` receives the `onUsage` callback to hand to `parseTransactionsText` /
 * `transcribeVoiceNote`. Settling is best-effort: a failure to write it is
 * logged and swallowed, never turned into a failed request — the user's drafts
 * or transcript matter more than our bookkeeping.
 */
export async function withAiCharge<T>(
  charge: AiCharge,
  run: (onUsage: (usage: AiUsage) => void) => Promise<T>,
): Promise<T> {
  let usage: AiUsage | null = null;
  const onUsage = (u: AiUsage) => {
    usage = u;
  };
  let result: T;
  try {
    result = await run(onUsage);
  } catch (err) {
    await settleAiCharge(charge, usage, failedOnOurSide(err));
    throw err;
  }
  await settleAiCharge(charge, usage, false);
  return result;
}

/**
 * Slack for the provider's measurement. The recorder stops itself at exactly
 * `VOICE.maxClipMs`, and the encoded audio routinely measures a few tens of
 * milliseconds longer — that must not tip a two-minute clip into a third
 * action. Two seconds also covers a clip that ends a moment after a minute
 * boundary the client honestly declared under.
 */
const MEASURE_TOLERANCE_MS = 2_000;

/** AI actions a clip of `audioMs` really cost — like `voiceActionsFor`, but not capped. */
export function measuredVoiceActions(audioMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, audioMs - MEASURE_TOLERANCE_MS) / VOICE.msPerAction));
}

async function settleAiCharge(
  charge: AiCharge,
  usage: AiUsage | null,
  refund: boolean,
): Promise<void> {
  if (!usage && !refund) return;
  try {
    if (refund && charge.kind === AI_KIND.transcribe) {
      await refundTranscription(charge, usage);
    } else {
      // The clip length a client declares is only a claim. When the provider
      // measured the audio (Gemini reports it), a longer clip is charged for
      // what it really was — a 1 ms declaration can't buy an hour of audio.
      const measured =
        !refund && charge.kind === AI_KIND.transcribe && usage?.audioMs != null
          ? measuredVoiceActions(usage.audioMs)
          : null;
      const recharge = measured != null && measured > charge.units ? measured : null;
      await getDb()
        .update(aiUsageLog)
        .set({
          ...(usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                audioMs: usage.audioMs,
              }
            : {}),
          ...(refund ? { units: 0, topupUnits: 0, kind: `${charge.kind}${FAILED_SUFFIX}` } : {}),
          ...(recharge != null ? { units: recharge } : {}),
        })
        .where(eq(aiUsageLog.id, charge.id));
      if (refund) await returnTopUpUnits(getDb(), charge.workspaceId, charge.topupUnits);
      if (recharge != null) {
        logger.info(
          `Charged ${recharge} AI action(s) for a clip declared as ${charge.units} — the measured audio was longer`,
          { event: "ai.charge.remeasured", declared: charge.units, units: recharge, chargeId: charge.id },
        );
      }
    }
    if (refund && charge.units > 0) {
      logger.info(`Gave back ${charge.units} AI action(s) after a ${charge.kind} call failed`, {
        event: "ai.charge.refunded",
        kind: charge.kind,
        units: charge.units,
        chargeId: charge.id,
      });
    }
  } catch (err) {
    logger.warn(`Couldn't settle the ledger row for a ${charge.kind} call: ${describeError(err)}`, {
      event: "ai.charge.settle_failed",
      kind: charge.kind,
      chargeId: charge.id,
      refund,
    });
  }
}

/**
 * Give a failed transcription's actions back — and with them the free parse it
 * paid for. A paid transcription row exists from the moment it's charged, so a
 * voice parse can claim it while the clip is still at the provider; if the clip
 * then fails, the pairing would be left with a free parse nothing paid for (junk
 * audio + an instant `source: "voice"` parse = free AI). So after the refund,
 * if this user's free voice parses in the window now outnumber their paid
 * clips, the newest one is turned back into an ordinary 1-action parse.
 *
 * Runs under the same allowance lock the claim takes (`chargeUnderLocks`), so a
 * claim and this re-check can't interleave: whichever runs second sees the
 * other's committed row.
 */
async function refundTranscription(charge: AiCharge, usage: AiUsage | null): Promise<void> {
  const ent = await getWorkspaceEntitlements(charge.workspaceId);
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ALLOWANCE_LOCK_NAMESPACE}, hashtext(${allowanceLockKey(ent)}))`,
    );
    await tx
      .update(aiUsageLog)
      .set({
        ...(usage
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, audioMs: usage.audioMs }
          : {}),
        units: 0,
        topupUnits: 0,
        kind: `${charge.kind}${FAILED_SUFFIX}`,
      })
      .where(eq(aiUsageLog.id, charge.id));
    await returnTopUpUnits(tx, charge.workspaceId, charge.topupUnits);

    // Only a voice parse made *after* this clip could have leaned on it (a
    // parse claims an earlier clip). Judge the newest such parse in its own
    // claim window — the one the claim was decided in — so an older, properly
    // paired clip/parse that straddles a window edge can't make it look unpaid.
    const [clip] = await tx
      .select({ createdAt: aiUsageLog.createdAt })
      .from(aiUsageLog)
      .where(eq(aiUsageLog.id, charge.id))
      .limit(1);
    if (!clip) return;
    const mine = and(
      eq(aiUsageLog.userId, charge.userId),
      eq(aiUsageLog.workspaceId, charge.workspaceId),
    );
    const [newest] = await tx
      .select({ id: aiUsageLog.id, createdAt: aiUsageLog.createdAt })
      .from(aiUsageLog)
      .where(and(mine, eq(aiUsageLog.kind, AI_KIND.voiceParse), gt(aiUsageLog.createdAt, clip.createdAt)))
      .orderBy(desc(aiUsageLog.createdAt), desc(aiUsageLog.id))
      .limit(1);
    if (!newest) return;
    const [row] = await tx
      .select({
        paid: sql<number>`(count(*) filter (where ${aiUsageLog.kind} = ${AI_KIND.transcribe} and ${aiUsageLog.units} > 0))::int`,
        claimed: sql<number>`(count(*) filter (where ${aiUsageLog.kind} = ${AI_KIND.voiceParse}))::int`,
      })
      .from(aiUsageLog)
      .where(
        and(
          mine,
          gte(aiUsageLog.createdAt, new Date(newest.createdAt.getTime() - VOICE_PARSE_WINDOW_MS)),
          lte(aiUsageLog.createdAt, newest.createdAt),
        ),
      );
    if (Number(row?.claimed ?? 0) <= Number(row?.paid ?? 0)) return;

    await tx
      .update(aiUsageLog)
      .set({ units: 1, kind: AI_KIND.parse })
      .where(eq(aiUsageLog.id, newest.id));
    logger.info("Charged a voice parse whose transcription failed afterwards", {
      event: "ai.charge.voice_parse_recharged",
      chargeId: newest.id,
      transcriptionId: charge.id,
    });
  });
}
