import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { POST as parseRoute } from "@/app/api/v1/ai/parse/route";
import { POST as transcribeRoute } from "@/app/api/v1/ai/transcribe/route";
import { parseTransactionsWithAI, transcribeVoiceNoteAction } from "@/actions/transactions";
import { aiUsageLog } from "@/db/schema";
import { AI_REQUESTS_PER_HOUR } from "@/lib/ai-quota";
import { getAiAllowance } from "@/lib/entitlements";
import { PLAN_LIMITS } from "@/lib/plans";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { getTestDb } from "./helpers/test-db";
import { apiReq, jsonBody } from "./api/helpers";

/**
 * The monthly AI allowance (personal phase 5): AI actions per workspace per
 * UTC calendar month, charged in `ai_usage_log.units` under the same lock as the
 * hourly cap. A typed note is one action; a voice clip is one per started
 * minute and covers the parse of its transcript; voice itself is Pro-only.
 *
 * Unlike `api/ai.test.ts` (which proves the gates stop a request *before* the
 * provider), these let the call through to a stubbed Gemini — the charge is
 * only observable on a call that succeeds, because a failure on our side gives
 * the action back. Abuse-catalogue rules are named by id (`C1:`, `C2:`).
 */

const AUDIO = new TextEncoder().encode("fake-opus-bytes-long-enough-to-look-like-a-recording");

/** A Gemini stub: a transcript for audio requests, one draft for text ones. */
function stubGemini({ fail = false }: { fail?: boolean } = {}) {
  const spy = vi.fn(async (_url: string, init?: { body?: unknown }) => {
    if (fail) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    }
    const isAudio = typeof init?.body === "string" && init.body.includes("inlineData");
    const text = isAudio
      ? "200 fruits"
      : JSON.stringify({
          transactions: [
            { type: "expense", amount: 200, title: "fruits", tagNames: [], occurredOn: "2026-10-01" },
          ],
        });
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: isAudio
          ? {
              promptTokenCount: 2200,
              candidatesTokenCount: 30,
              promptTokensDetails: [
                { modality: "TEXT", tokenCount: 280 },
                { modality: "AUDIO", tokenCount: 1920 },
              ],
            }
          : { promptTokenCount: 1180, candidatesTokenCount: 210 },
      }),
      text: async () => "",
    };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function configureModels() {
  const entry = JSON.stringify({ current: { model_id: "gemini-test", api_key: "k" } });
  vi.stubEnv("AI_PARSE_MODEL", entry);
  vi.stubEnv("AI_PARSE_MODEL_CURRENT", "current");
  vi.stubEnv("AI_TRANSCRIBE_MODEL", entry);
  vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", "current");
}

function parse(body: Record<string, unknown>) {
  return parseRoute(apiReq("/api/v1/ai/parse", { method: "POST", body: jsonBody(body) }));
}

function transcribe(durationMs?: number | string) {
  const form = new FormData();
  form.append("audio", new Blob([AUDIO as unknown as BlobPart], { type: "audio/webm" }), "voice-note.webm");
  if (durationMs !== undefined) form.append("durationMs", String(durationMs));
  return transcribeRoute(
    new Request("http://localhost/api/v1/ai/transcribe", {
      method: "POST",
      body: form,
      headers: { authorization: "Bearer test-token" },
    }) as NextRequest,
  );
}

/** The user's ledger rows, oldest first. */
async function ledger(alias: string) {
  return getTestDb()
    .select({
      kind: aiUsageLog.kind,
      units: aiUsageLog.units,
      ownerId: aiUsageLog.ownerId,
      plan: aiUsageLog.plan,
      inputTokens: aiUsageLog.inputTokens,
      outputTokens: aiUsageLog.outputTokens,
      audioMs: aiUsageLog.audioMs,
    })
    .from(aiUsageLog)
    .where(eq(aiUsageLog.userId, uid(alias)))
    .orderBy(asc(aiUsageLog.createdAt), asc(aiUsageLog.id));
}

/** Pre-spend `units` actions this month in one ledger row (one row = one hourly slot). */
async function spend(
  alias: string,
  units: number,
  row: { workspaceId: string; plan: "free" | "plus" | "pro"; ownerId?: string },
) {
  await getTestDb()
    .insert(aiUsageLog)
    .values({
      userId: uid(alias),
      workspaceId: row.workspaceId,
      kind: "transaction_parse",
      units,
      ownerId: row.ownerId ?? uid(alias),
      plan: row.plan,
    });
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string; details?: Record<string, unknown> } })
    .error;
}

describe("monthly AI allowance", () => {
  beforeEach(() => configureModels());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("charges a typed note one action, stamped with the owner and plan, with the provider's token usage", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");

    const res = await parse({ text: "200 fruits" });
    expect(res.status).toBe(200);
    expect(await ledger("a")).toEqual([
      {
        kind: "transaction_parse",
        units: 1,
        ownerId: uid("a"),
        plan: "free",
        inputTokens: 1180,
        outputTokens: 210,
        audioMs: null,
      },
    ]);
  });

  it("refuses with plan_limit once the allowance is spent — nothing logged, provider never reached", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await spend("a", PLAN_LIMITS.free.aiActionsPerMonth, { workspaceId: W, plan: "free" });

    const res = await parse({ text: "200 fruits" });
    expect(res.status).toBe(403);
    const error = await errorOf(res);
    expect(error.code).toBe("plan_limit");
    expect(error.details).toMatchObject({ limit: "aiActions", plan: "free", max: 50, used: 50, upgradeTo: "plus" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await ledger("a")).toHaveLength(1);
  });

  it("refuses the server action the same way", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await spend("a", 50, { workspaceId: await workspaceIdOf("a"), plan: "free" });

    const res = await parseTransactionsWithAI("200 fruits");
    expect(res).toMatchObject({ ok: false, code: "plan_limit", details: { limit: "aiActions" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await ledger("a")).toHaveLength(1);
  });

  it("gives the action back when the AI fails on our side — the hourly slot stays spent", async () => {
    stubGemini({ fail: true });
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    expect((await parse({ text: "200 fruits" })).status).toBe(502);
    // Still a provider call, so still a row for the hourly cap — but no longer an action.
    expect(await ledger("a")).toMatchObject([{ kind: "transaction_parse_failed", units: 0 }]);
    expect((await getAiAllowance(W)).used).toBe(0);
  });

  it("keeps the action when the model answered — an empty result isn't our failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{"transactions":[]}' }] } }] }),
        text: async () => "",
      })),
    );
    signInAs("a");
    await bootstrapUser("a");

    expect((await parse({ text: "hello" })).status).toBe(400);
    expect(await ledger("a")).toMatchObject([{ kind: "transaction_parse", units: 1 }]);
  });

  it("C1: usage logged under Free still counts after the workspace moves to Plus", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await spend("a", 50, { workspaceId: W, plan: "free" });

    await setWorkspacePlan(W, "plus");
    // Plus has room: the 50 Free actions carried over, they didn't vanish…
    expect((await parse({ text: "200 fruits" })).status).toBe(200);
    expect((await getAiAllowance(W)).used).toBe(51);

    // …and they weren't reset either: they still fill Plus's 300.
    await spend("a", 249, { workspaceId: W, plan: "plus" });
    const res = await parse({ text: "200 fruits" });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).details).toMatchObject({ limit: "aiActions", plan: "plus", used: 300, max: 300 });
  });

  it("C2: a deleted free workspace's usage counts against the owner's free allowance; another owner's doesn't", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    const gone = "00000000-0000-7000-8000-00000000dead";

    // Another owner's Free usage — even logged by this user — isn't a's.
    await spend("a", 50, { workspaceId: gone, plan: "free", ownerId: uid("b") });
    expect((await parse({ text: "200 fruits" })).status).toBe(200);

    // a's own Free usage from a workspace that no longer exists is.
    await spend("a", 49, { workspaceId: gone, plan: "free" });
    expect((await getAiAllowance(W)).used).toBe(50);
    const res = await parse({ text: "200 fruits" });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("plan_limit");
  });

  it("checks the hourly cap first — still 429 at 30 calls, even with the allowance spent too", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    // 29 earlier calls this hour (0 actions each), then the 30th goes through…
    for (let i = 0; i < AI_REQUESTS_PER_HOUR - 1; i++) {
      await spend("a", 0, { workspaceId: W, plan: "free" });
    }
    expect((await parse({ text: "200 fruits" })).status).toBe(200);
    // …and the 31st doesn't.
    expect((await parse({ text: "200 fruits" })).status).toBe(429);

    // With the allowance also gone, the answer is still "slow down", not "upgrade".
    await spend("a", 50, { workspaceId: W, plan: "free" });
    expect((await parse({ text: "200 fruits" })).status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("voice", () => {
  beforeEach(() => configureModels());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is refused on Free and Plus with plan_limit voice — before any charge", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    const free = await transcribe(30_000);
    expect(free.status).toBe(403);
    expect((await errorOf(free)).details).toMatchObject({ limit: "voice", plan: "free", upgradeTo: "pro" });

    await setWorkspacePlan(W, "plus");
    const plus = await transcribe(30_000);
    expect(plus.status).toBe(403);
    expect((await errorOf(plus)).details).toMatchObject({ limit: "voice", plan: "plus", upgradeTo: "pro" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await ledger("a")).toHaveLength(0);
  });

  it("is refused by the server action on Free too", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");

    const form = new FormData();
    form.append("audio", new Blob([AUDIO as unknown as BlobPart], { type: "audio/webm" }));
    form.append("durationMs", "5000");
    const res = await transcribeVoiceNoteAction(form);
    expect(res).toMatchObject({ ok: false, code: "plan_limit", details: { limit: "voice" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("works on Pro — through the API and the server action — recording the measured audio", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");

    const res = await transcribe(30_000);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { text: string } }).data.text).toBe("200 fruits");

    const form = new FormData();
    form.append("audio", new Blob([AUDIO as unknown as BlobPart], { type: "audio/webm" }));
    form.append("durationMs", "5000");
    expect(await transcribeVoiceNoteAction(form)).toEqual({ ok: true, text: "200 fruits" });

    expect(await ledger("a")).toEqual([
      expect.objectContaining({ kind: "voice_transcribe", units: 1, plan: "pro", audioMs: 60_000 }),
      expect.objectContaining({ kind: "voice_transcribe", units: 1, plan: "pro", audioMs: 60_000 }),
    ]);
  });

  it("keeps working for a grandfathered Free workspace during its grace period", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "free", { grandfathered: true });
    expect((await transcribe(10_000)).status).toBe(200);
  });

  it("charges one action per started minute — 60 s is 1, 61 s is 2, an undeclared clip the full 2", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");

    expect((await transcribe(60_000)).status).toBe(200);
    expect((await transcribe(61_000)).status).toBe(200);
    expect((await transcribe()).status).toBe(200);
    // Past the cap costs what the cap costs.
    expect((await transcribe(10 * 60_000)).status).toBe(200);
    expect((await ledger("a")).map((r) => r.units)).toEqual([1, 2, 2, 2]);
  });

  it("400s a malformed clip length before any charge", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");

    expect((await transcribe("ninety")).status).toBe(400);
    expect((await transcribe(-1)).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await ledger("a")).toHaveLength(0);
  });

  it("parses a transcript free right after its paid clip — once; the next voice parse is charged", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");

    expect((await transcribe(20_000)).status).toBe(200);
    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(200);
    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(200);

    expect((await ledger("a")).map((r) => [r.kind, r.units])).toEqual([
      ["voice_transcribe", 1],
      ["transaction_parse_voice", 0],
      ["transaction_parse", 1],
    ]);
  });

  it("charges a source:voice parse with no transcription behind it like a typed note", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");

    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(200);
    expect((await parseTransactionsWithAI("200 fruits", { source: "voice" })).ok).toBe(true);
    expect((await ledger("a")).map((r) => [r.kind, r.units])).toEqual([
      ["transaction_parse", 1],
      ["transaction_parse", 1],
    ]);
  });

  it("doesn't let one user's paid clip make a teammate's parse free", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "pro");
    expect((await transcribe(20_000)).status).toBe(200);

    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "all", role: "editor" },
    });

    // b's "voice" note is a typed note as far as the ledger is concerned: the
    // clip that could pay for a parse is a's, and the pairing is per user.
    signInAs("b");
    const res = await parseRoute(
      apiReq("/api/v1/ai/parse", {
        method: "POST",
        body: jsonBody({ text: "200 fruits", source: "voice" }),
        headers: { "x-workspace-id": W },
      }),
    );
    expect(res.status).toBe(200);
    expect((await ledger("b")).map((r) => [r.kind, r.units])).toEqual([["transaction_parse", 1]]);
    // …and a still has its own free parse.
    signInAs("a");
    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(200);
    expect((await ledger("a")).map((r) => r.units)).toEqual([1, 0]);
  });

  it("still parses a paid clip's transcript when that clip used the last action", async () => {
    stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "pro");
    await spend("a", PLAN_LIMITS.pro.aiActionsPerMonth - 1, { workspaceId: W, plan: "pro" });

    expect((await transcribe(20_000)).status).toBe(200);
    expect((await getAiAllowance(W)).remaining).toBe(0);
    // The clip paid for its parse, so the parse isn't refused at the limit…
    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(200);
    // …but a typed note is.
    expect((await parse({ text: "200 fruits" })).status).toBe(403);
  });

  it("refuses a clip that needs more actions than are left, and says a shorter one would fit", async () => {
    const fetchSpy = stubGemini();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "pro");
    await spend("a", PLAN_LIMITS.pro.aiActionsPerMonth - 1, { workspaceId: W, plan: "pro" });

    const res = await transcribe(90_000);
    expect(res.status).toBe(403);
    const error = await errorOf(res);
    expect(error.code).toBe("plan_limit");
    expect(error.message).toMatch(/needs 2 AI actions.*1 left/);
    expect(error.details).toMatchObject({ limit: "aiActions", used: 999, max: 1000 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gives a failed clip back, and a failed voice parse keeps the clip's free parse for the retry", async () => {
    stubGemini({ fail: true });
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "pro");

    // A clip that fails is refunded, and so can't pay for a parse later.
    expect((await transcribe(20_000)).status).toBe(502);

    stubGemini();
    expect((await transcribe(20_000)).status).toBe(200);
    stubGemini({ fail: true });
    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(502);
    stubGemini();
    expect((await parse({ text: "200 fruits", source: "voice" })).status).toBe(200);

    expect((await ledger("a")).map((r) => [r.kind, r.units])).toEqual([
      ["voice_transcribe_failed", 0],
      ["voice_transcribe", 1],
      ["transaction_parse_voice_failed", 0],
      ["transaction_parse_voice", 0],
    ]);
    expect((await getAiAllowance(W)).used).toBe(1);
  });
});
