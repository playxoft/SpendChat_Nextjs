"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentWorkspace, getUserSettings, requireUser } from "@/lib/auth";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { parseOrThrow } from "@/lib/api-response";
import { runAction, type ActionResult } from "@/lib/action-result";
import { recordSpan, time } from "@/lib/timing";
import * as txns from "@/services/transactions";
import {
  FEED_PAGE_SIZE,
  getCategories,
  listFeedPage,
  listTransactions,
  TRANSACTIONS_PAGE_SIZE,
  type TransactionRow,
} from "@/lib/queries";
import { updateTransactionSchema, type TransactionInput } from "@/lib/validation";
import type { BulkDraft } from "@/lib/bulk-parser";
import { MAX_INPUT_CHARS, parseTransactionsText, type AiParsedDraft } from "@/lib/ai-parse";
import { MAX_AUDIO_BYTES } from "@/lib/ai-limits";
import { isSupportedAudioType, transcribeVoiceNote } from "@/lib/ai-transcribe";
import { assertAiRequestAllowed } from "@/lib/ai-quota";
import { getTimeZone } from "@/lib/timezone.server";
import { todayISO } from "@/lib/dates";

/** Filters + offset for a load-more request. Access is still enforced server
 * side by `listTransactions` (scoped to the caller's accessible profiles), so a
 * tampered profile/category id simply returns nothing. */
const loadMoreSchema = z.object({
  filters: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    type: z.enum(["income", "expense"]).optional(),
    categoryId: z.string().optional(),
    profileId: z.string().optional(),
    search: z.string().optional(),
    sort: z.enum(["date", "category", "title", "description", "amount"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  }),
  offset: z.number().int().min(0).max(1_000_000),
});

/** Cursor + profile for loading the next older page of the tracker feed. Access
 * is still enforced server side by `listFeedPage` (scoped to the caller's
 * accessible profiles), so a tampered profile id simply returns nothing. */
const loadOlderFeedSchema = z.object({
  profileId: z.string().optional(),
  before: z.object({
    occurredOn: z.string(),
    createdAt: z.coerce.date(),
    id: z.string(),
  }),
  limit: z.number().int().min(1).max(100).optional(),
});

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/app/transactions");
  revalidatePath("/app/analytics");
}

export async function addTransaction(input: TransactionInput): Promise<ActionResult<{ id: string }>> {
  // Auth + workspace resolution runs before `runAction` opens its timing scope,
  // and it's a fresh request (the React `cache()` is cold), so these hit the DB /
  // Firebase and can be a real slice of the send. Measure them here, then replay
  // the durations into the scope below so they land in the same breakdown line.
  const authStart = Date.now();
  const user = await requireUser();
  const authMs = Date.now() - authStart;
  const wsStart = Date.now();
  const workspace = await getCurrentWorkspace(user.id);
  const workspaceMs = Date.now() - wsStart;
  return runAction(
    "addTransaction",
    async () => {
      recordSpan("requireUser", authMs);
      recordSpan("getCurrentWorkspace", workspaceMs);
      // The optimistic UI keys off the created id to retire its ghost bubble once
      // the revalidated feed shows the real row — so we only need the id, not the
      // full joined row. Currency/locale come from the workspace we already hold.
      const created = await txns.createTransactionId(user.id, workspace.id, input, {
        currency: workspace.currency,
        locale: workspace.locale,
      });
      // `revalidatePath` only marks the routes stale (cheap); the actual RSC
      // re-render + feed queries happen after this returns — see `tracker.page.*`.
      await time("revalidate", async () => revalidateApp());
      return { id: created.id };
    },
    { userId: user.id, workspaceId: workspace.id, profileId: input.profileId ?? null, authMs, workspaceMs },
  );
}

export async function updateTransaction(
  input: z.input<typeof updateTransactionSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateTransaction",
    async () => {
      // Null = no such transaction in the current workspace (or no access) —
      // surface it rather than reporting a save that didn't happen.
      const updated = await txns.updateTransaction(user.id, workspace.id, input.id, input);
      if (!updated) throw notFound("Transaction not found");
      revalidateApp();
      return {};
    },
    { userId: user.id, transactionId: input.id, profileId: input.profileId ?? null },
  );
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteTransaction",
    async () => {
      await txns.deleteTransaction(user.id, workspace.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, transactionId: id },
  );
}

/**
 * The next page of transactions for the infinite-scroll list. A read (not a
 * mutation), but a server action so the client can fetch more without an API
 * route — it re-derives the user/workspace from the session and never trusts
 * the client for access.
 */
export async function loadMoreTransactions(
  input: z.input<typeof loadMoreSchema>,
): Promise<ActionResult<{ rows: TransactionRow[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "loadMoreTransactions",
    async () => {
      const { filters, offset } = parseOrThrow(loadMoreSchema, input);
      const rows = await listTransactions(user.id, workspace.id, {
        ...filters,
        limit: TRANSACTIONS_PAGE_SIZE,
        offset,
      });
      return { rows };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/**
 * The next older page of the tracker chat feed (keyset paginated). A read, but a
 * server action so the feed can page back through history without an API route —
 * it re-derives the user/workspace from the session and never trusts the client
 * for access.
 */
export async function loadOlderFeed(
  input: z.input<typeof loadOlderFeedSchema>,
): Promise<ActionResult<{ rows: TransactionRow[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "loadOlderFeed",
    async () => {
      const { profileId, before, limit } = parseOrThrow(loadOlderFeedSchema, input);
      const newestFirst = await listFeedPage(user.id, workspace.id, {
        profileId,
        before,
        limit: limit ?? FEED_PAGE_SIZE,
      });
      // Oldest-first for the chat feed; the client prepends these above.
      return { rows: newestFirst.reverse() };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function addBulkTransactions(drafts: BulkDraft[]): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addBulkTransactions",
    async () => {
      const { count } = await txns.createBulkFromDrafts(user.id, workspace.id, drafts);
      revalidateApp();
      return { count };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/**
 * Parse a free-text note into transaction drafts with AI, for the composer's
 * "AI" mode. Nothing is written to the transaction tables here; the user reviews
 * the returned drafts and commits them via `addBulkTransactions`. `today` is
 * resolved server-side (from the request timezone) so drafts default to the
 * right date, and categories come from the workspace so the model can only pick
 * names that actually exist.
 *
 * Unlike a plain read, this one *costs money* on every call, so it's gated twice
 * before anything reaches a provider: the caller needs the editor role (the UI
 * hides AI mode from viewers, but a server action is callable by any signed-in
 * user regardless of what rendered), and then a per-user hourly quota.
 */
export async function parseTransactionsWithAI(
  text: string,
): Promise<ActionResult<{ drafts: AiParsedDraft[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "parseTransactionsWithAI",
    async () => {
      const note = typeof text === "string" ? text.trim() : "";
      if (!note) throw badRequest("Type a note for the AI to turn into transactions");
      // Cheap local checks first, then permission, then quota — a denied caller
      // must never burn another caller's budget.
      if (note.length > MAX_INPUT_CHARS) {
        throw badRequest(`That's a lot of text — keep it under ${MAX_INPUT_CHARS} characters`);
      }
      if (!(await canWriteInWorkspace(user.id, workspace.id))) {
        throw forbidden("You don't have permission to add transactions in this workspace");
      }
      await assertAiRequestAllowed(user.id, workspace.id, "transaction_parse");

      const [categories, today] = await Promise.all([
        getCategories(workspace.id),
        getTimeZone().then(todayISO),
      ]);
      const drafts = await parseTransactionsText({
        text: note,
        categories: categories.map((c) => ({ name: c.name, kind: c.kind })),
        currency: workspace.currency,
        locale: workspace.locale,
        today,
      });
      return { drafts };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/**
 * Turn a recorded voice note into the text of a note, for the composer's mic.
 * Returns only a transcript — the user reads it, fixes anything misheard, and
 * presses send, which runs the same `parseTransactionsWithAI` path a typed note
 * does. Nothing here writes to the transaction tables.
 *
 * Gated exactly like the parse action, and for the same reason: it costs money
 * per call and a server action is invocable by any signed-in user regardless of
 * what the UI rendered. Cheap local checks first (format, size), then the editor
 * role, then the shared hourly quota — a denied caller must never burn another
 * caller's budget.
 *
 * **The recording arrives as `FormData`, not as a base64 argument.** Three
 * reasons, and the first is the one that bites:
 *   1. Next logs every server action's arguments in development
 *      (`ƒ action({…}) in 8114ms`) by stringifying them with no cap on string
 *      length — a base64 argument dumps the entire recording into the terminal
 *      on every use. A `FormData` has no enumerable own properties, so it
 *      stringifies to `{}` and the audio never reaches a log.
 *   2. base64 inflates the payload by a third for no benefit; multipart carries
 *      the bytes as-is.
 *   3. The size check below is then exact, rather than inferred from an encoded
 *      length.
 */
export async function transcribeVoiceNoteAction(
  formData: FormData,
): Promise<ActionResult<{ text: string }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "transcribeVoiceNote",
    async () => {
      const audio = formData?.get("audio");
      if (!(audio instanceof Blob) || audio.size === 0) {
        throw badRequest("No recording was captured — try again.");
      }
      // Next has already buffered the body to hand us this FormData, so this
      // doesn't spare the read — it spares the `arrayBuffer()` copy, the quota
      // slot and the provider call, which are the expensive parts. The framework
      // ceiling (`serverActions.bodySizeLimit`, 5mb) is the one that bounds the
      // read, and it's deliberately above this so the friendly error wins.
      if (audio.size > MAX_AUDIO_BYTES) {
        throw badRequest("That recording is too long — try a shorter one.");
      }
      // The Blob's own type is what MediaRecorder produced; the form field is a
      // fallback for browsers that drop it when constructing the multipart part.
      const mimeType = audio.type || String(formData.get("mimeType") ?? "");
      if (!mimeType) throw badRequest("No recording was captured — try again.");
      // Container check belongs here, with the other cheap checks — not deeper
      // in `transcribeVoiceNote`, which runs past the quota gate and would let
      // an unsupported file burn a slot on its way to a guaranteed 400.
      if (!isSupportedAudioType(mimeType)) {
        throw badRequest("That audio format isn't supported — try recording again.");
      }

      if (!(await canWriteInWorkspace(user.id, workspace.id))) {
        throw forbidden("You don't have permission to add transactions in this workspace");
      }
      await assertAiRequestAllowed(user.id, workspace.id, "voice_transcribe");

      const [categories, settings] = await Promise.all([
        getCategories(workspace.id),
        getUserSettings(user.id),
      ]);
      const text = await transcribeVoiceNote({
        audio: { bytes: new Uint8Array(await audio.arrayBuffer()), mimeType },
        languages: settings.voiceLanguages,
        currency: workspace.currency,
        categoryNames: categories.map((c) => c.name),
      });
      return { text };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
