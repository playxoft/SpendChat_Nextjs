import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageLog } from "@/db/schema";
import { ApiError, planLimit, tooManyRequests, type PlanLimitDetails } from "@/lib/errors";
import {
  aiActionsUsedThisMonth,
  aiAllowanceError,
  getWorkspaceEntitlements,
  type WorkspaceEntitlements,
} from "@/lib/entitlements";
import { VOICE, voiceActionsFor } from "@/lib/plans";
import { describeError, logger } from "@/lib/logger";
import type { AiUsage } from "@/lib/ai-provider";

/**
 * Max AI model requests one user may trigger per hour.
 *
 * This counts *provider calls* (log rows), not AI actions, and the two aren't
 * 1:1. A typed note costs one (parse). A dictated one costs **two** — transcribe,
 * then parse the transcript — so voice-driven entry tops out around 15/hour
 * rather than 30. That's deliberate: transcription is the more expensive call,
 * and the budget is a spend ceiling, not a feature quota. Raise this only
 * alongside a look at the provider bill. (Personal phase 6 replaces it with the
 * plan-based `RATE_LIMITS`; until then it runs alongside the monthly allowance.)
 */
export const AI_REQUESTS_PER_HOUR = 30;

/** Advisory-lock namespace for the per-user hourly cap (`email-quota.ts` is 2, invites 3). */
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
} as const;
export type AiKind = (typeof AI_KIND)[keyof typeof AI_KIND];

/**
 * Appended to `kind` when a charged call fails on our side (see `withAiCharge`):
 * the row stays — it was still a provider call, so it still counts against the
 * hourly cap — but it no longer counts as an action, as a paid transcription,
 * or as a used voice parse.
 */
const FAILED_SUFFIX = "_failed";

const DEFAULT_LIMIT_MESSAGE = "That's a lot of AI requests in the last hour — try again later";

/** A charged AI call: its ledger row, and what it cost. */
export type AiCharge = { id: string; kind: AiKind; units: number };

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Check and record one AI call, in one transaction, before it reaches a paid
 * provider (and after any permission checks — denied calls must not burn
 * quota). Two budgets, checked in this order:
 *
 *  1. **The per-user hourly cap** (`AI_REQUESTS_PER_HOUR`, 429). Server actions
 *     are invocable by any authenticated user regardless of what the UI
 *     renders, so without it one account could loop the composer's AI parse
 *     and spend the operator's whole API budget.
 *  2. **The workspace's monthly AI allowance** (`aiActionsPerMonth`, 403
 *     `plan_limit`), counted in AI actions (`units`) over `aiUsageScope` — so
 *     plan changes never reset it (C1, C3), and a Free workspace also counts
 *     its owner's other Free usage this month, deleted workspaces included (C2).
 *
 * Throwing anywhere rolls the transaction back: a refused call inserts nothing
 * and releases both locks, so it spent nothing.
 *
 * **Why the per-user advisory lock.** Counting and then inserting is not a cap:
 * fire fifty requests at once and all fifty read the same under-limit count, so
 * the limit holds only against a caller polite enough to go one at a time —
 * which is not the caller it exists to stop. Folding both into a single
 * `INSERT ... SELECT ... WHERE (count) < limit` looks like it fixes that and
 * does not: under READ COMMITTED the subquery reads a statement snapshot that
 * excludes other sessions' uncommitted rows, and `INSERT` takes only
 * `RowExclusiveLock`, which doesn't conflict with itself. Two concurrent
 * statements both count 29, both insert, and the user is at 31.
 *
 * A per-user advisory lock is what actually serializes them, and it is the
 * **try** form on purpose. `pg_advisory_xact_lock` blocks with no timeout, which
 * turns the exact burst this exists to stop into a queue: 500 simultaneous calls
 * would each open a transaction and hold a real Neon connection while waiting
 * for a budget that only 30 of them can have — a rate limiter that amplifies
 * into connection exhaustion for every other user of the database.
 * `pg_try_advisory_xact_lock` returns immediately instead, and losing the race
 * *is* the answer: a second request arriving while this user's own check is
 * still running is, definitionally, the concurrency the cap exists to refuse.
 * The lock is released when the transaction ends, rollback included, so a
 * failure can't strand it.
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
 * The log table is both the audit trail and both counters: the hourly cap
 * counts rows (provider calls), the allowance sums `units` (actions).
 */
async function chargeUnderLocks(
  userId: string,
  workspaceId: string,
  decide: (tx: Tx, now: Date) => Promise<{ kind: AiKind; units: number }>,
  limitMessage = DEFAULT_LIMIT_MESSAGE,
): Promise<AiCharge> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const now = new Date();
  const db = getDb();
  return db.transaction(async (tx) => {
    // Taken before anything is counted. `hashtext` maps the uuid onto the int4
    // key the lock takes; a collision with another user costs one refused
    // request, never a wrong answer, because the count below is still filtered
    // by `userId`.
    const [lock] = (
      await tx.execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${userId})) as got`,
      )
    ).rows;
    if (!lock?.got) throw tooManyRequests(limitMessage);

    // Hourly first: a caller hammering the endpoint should be told to slow
    // down, not to upgrade.
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const [row] = await tx
      .select({ used: count() })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, oneHourAgo)));
    if ((row?.used ?? 0) >= AI_REQUESTS_PER_HOUR) {
      // Throwing rolls the transaction back, which releases the lock and
      // guarantees the rejected caller spent nothing.
      throw tooManyRequests(limitMessage);
    }

    // A hash collision here only serializes two unrelated scopes for the
    // length of a count — never a wrong answer, since the sum below is filtered.
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ALLOWANCE_LOCK_NAMESPACE}, hashtext(${allowanceLockKey(ent)}))`,
    );

    const { kind, units } = await decide(tx, now);

    // A call that charges nothing (a voice clip's parse) can't overdraw the
    // allowance, so it isn't refused by it — even at the limit, the clip that
    // was already paid for gets its parse.
    if (units > 0) {
      const used = await aiActionsUsedThisMonth(ent, now, tx);
      // Top-ups (personal phase 9) plug in here: they're spent only once the
      // monthly allowance is gone (C4), so the check becomes
      // `used + units > limit + topUpRemaining`, under this same lock, and the
      // row records which pool paid.
      if (used + units > ent.limits.aiActionsPerMonth) throw allowanceError(ent, used, units);
    }

    const [inserted] = await tx
      .insert(aiUsageLog)
      .values({ userId, workspaceId, kind, units, ownerId: ent.ownerId, plan: ent.plan })
      .returning({ id: aiUsageLog.id });
    return { id: inserted!.id, kind, units };
  });
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
function allowanceError(ent: WorkspaceEntitlements, used: number, units: number): ApiError {
  const base = aiAllowanceError(ent, used);
  const remaining = ent.limits.aiActionsPerMonth - used;
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

async function settleAiCharge(
  charge: AiCharge,
  usage: AiUsage | null,
  refund: boolean,
): Promise<void> {
  if (!usage && !refund) return;
  try {
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
        ...(refund ? { units: 0, kind: `${charge.kind}${FAILED_SUFFIX}` } : {}),
      })
      .where(eq(aiUsageLog.id, charge.id));
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
