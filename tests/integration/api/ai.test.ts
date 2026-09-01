import { describe, it, expect, afterEach, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import { POST as parse } from "@/app/api/v1/ai/parse/route";
import { POST as transcribe } from "@/app/api/v1/ai/transcribe/route";
import { aiUsageLog } from "@/db/schema";
import { AI_REQUESTS_PER_HOUR } from "@/lib/ai-quota";
import { MAX_AUDIO_BYTES } from "@/lib/ai-limits";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "../helpers/session";
import { bootstrapUser, workspaceIdOf } from "../helpers/seed";
import { getTestDb } from "../helpers/test-db";
import { apiReq, jsonBody } from "./helpers";
import type { NextRequest } from "next/server";

/**
 * The two AI endpoints cost real money per call, so what's asserted here is the
 * *gate order*, not the model output: cheap local checks → editor role → hourly
 * quota → provider. A denied caller must never reach `fetch`, and must never
 * consume a quota slot that belongs to someone who was allowed.
 *
 * `fetch` is stubbed with a throwing spy throughout — every test that expects a
 * rejection also asserts it was never called, which is the part that actually
 * protects the bill.
 */

/** A recording-shaped multipart request for /ai/transcribe. */
function audioReq(
  bytes: Uint8Array,
  { type = "audio/webm", field = "audio", workspaceId }: {
    type?: string;
    field?: string;
    workspaceId?: string;
  } = {},
): NextRequest {
  const form = new FormData();
  form.append(field, new Blob([bytes as unknown as BlobPart], { type }), "voice-note.webm");
  const headers = new Headers({ authorization: "Bearer test-token" });
  if (workspaceId) headers.set("x-workspace-id", workspaceId);
  return new Request("http://localhost/api/v1/ai/transcribe", {
    method: "POST",
    body: form,
    headers,
  }) as NextRequest;
}

const SPEECH = new TextEncoder().encode("fake-opus-bytes-long-enough-to-look-like-a-recording");

/** Rows in the shared hourly AI budget for a user. */
async function quotaUsed(alias: string): Promise<number> {
  const [row] = await getTestDb()
    .select({ n: count() })
    .from(aiUsageLog)
    .where(eq(aiUsageLog.userId, uid(alias)));
  return row?.n ?? 0;
}

/** A `fetch` that fails the test if any provider is actually called. */
function noProviderCalls() {
  const spy = vi.fn(async () => {
    throw new Error("a gated request reached the provider");
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("/api/v1/ai — gating before the provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("400s an unusable recording before spending a quota slot", async () => {
    const fetchSpy = noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");

    // Empty, oversized, and a container we don't accept — all local checks.
    const empty = await transcribe(audioReq(new Uint8Array(0)));
    expect(empty.status).toBe(400);

    const huge = await transcribe(audioReq(new Uint8Array(MAX_AUDIO_BYTES + 1)));
    expect(huge.status).toBe(400);

    const wrongType = await transcribe(audioReq(SPEECH, { type: "video/mp4" }));
    expect(wrongType.status).toBe(400);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await quotaUsed("a")).toBe(0);
  });

  it("400s a request with no audio part at all", async () => {
    noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");
    const res = await transcribe(audioReq(SPEECH, { field: "recording" }));
    expect(res.status).toBe(400);
  });

  it("403s a viewer, and doesn't bill their quota", async () => {
    const fetchSpy = noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "all", role: "viewer" },
    });

    signInAs("b");
    const voice = await transcribe(audioReq(SPEECH, { workspaceId: W }));
    expect(voice.status).toBe(403);

    const text = await parse(
      apiReq("/api/v1/ai/parse", {
        method: "POST",
        body: jsonBody({ text: "200 fruits" }),
        headers: { "x-workspace-id": W },
      }),
    );
    expect(text.status).toBe(403);

    expect(fetchSpy).not.toHaveBeenCalled();
    // The role check runs before the quota insert, so a viewer can't drain the
    // budget by hammering an endpoint they're not allowed to use.
    expect(await quotaUsed("b")).toBe(0);
  });

  it("503s an editor when no model is configured — after the gates, not before", async () => {
    const fetchSpy = noProviderCalls();
    vi.stubEnv("AI_TRANSCRIBE_MODEL", "");
    vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", "");
    signInAs("a");
    await bootstrapUser("a");

    const res = await transcribe(audioReq(SPEECH));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("ai_unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
    // The slot is still spent: the caller was allowed, and the gates ran in
    // order. Only the operator's missing config stopped it.
    expect(await quotaUsed("a")).toBe(1);
  });

  it("429s once the hourly budget is gone, without reaching the provider", async () => {
    const fetchSpy = noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    // Fill the budget directly — the pool is one per user, shared across kinds.
    await getTestDb()
      .insert(aiUsageLog)
      .values(
        Array.from({ length: AI_REQUESTS_PER_HOUR }, () => ({
          userId: uid("a"),
          workspaceId: W,
          kind: "transaction_parse",
        })),
      );

    const res = await transcribe(audioReq(SPEECH));
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await quotaUsed("a")).toBe(AI_REQUESTS_PER_HOUR);
  });

  it("never overspends the budget when a burst arrives at once", async () => {
    const fetchSpy = noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    // Leave exactly one slot, then ask for twelve.
    //
    // Read what this does and does not prove. The gate counts and inserts in
    // ONE statement specifically so a burst can't slip past — the old
    // read-then-insert pair let every request in a burst see the same
    // under-limit count and pass. But PGlite is a single in-process Postgres
    // connection and serializes every query, so this harness **cannot stage the
    // true race**; it passes against the broken implementation too, which was
    // checked rather than assumed. The atomicity guarantee lives in the SQL and
    // is verified by reading it.
    //
    // What this does guard is the arithmetic either way: exactly one caller is
    // admitted, and the ledger ends on the cap rather than past it. A rewrite
    // that double-inserted, or that let the rejected callers spend a slot,
    // fails here.
    await getTestDb()
      .insert(aiUsageLog)
      .values(
        Array.from({ length: AI_REQUESTS_PER_HOUR - 1 }, () => ({
          userId: uid("a"),
          workspaceId: W,
          kind: "transaction_parse",
        })),
      );

    const results = await Promise.all(
      Array.from({ length: 12 }, () => transcribe(audioReq(SPEECH))),
    );
    const statuses = results.map((r) => r.status);

    // The single winner is stopped by the missing provider config (503), not by
    // the quota — it was allowed through. Everyone else is refused.
    expect(statuses.filter((s) => s !== 429)).toHaveLength(1);
    expect(statuses.filter((s) => s === 429)).toHaveLength(11);
    expect(await quotaUsed("a")).toBe(AI_REQUESTS_PER_HOUR);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller", async () => {
    const fetchSpy = noProviderCalls();
    const req = new Request("http://localhost/api/v1/ai/transcribe", {
      method: "POST",
      body: new FormData(),
    }) as NextRequest;
    expect((await transcribe(req)).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
