import { describe, it, expect, afterEach, vi } from "vitest";

// The per-person rate limiter fails open without a Durable Object binding;
// the C8 test below installs an in-memory one.
const limiter = vi.hoisted(() => ({
  current: null as import("../helpers/memory-rate-limiter").MemoryRateLimiter | null,
}));
vi.mock("@/lib/rate-limit/binding", () => ({
  getRateLimiterStub: (id: string) => limiter.current?.stubFor(id) ?? null,
}));
import { count, eq } from "drizzle-orm";
import { POST as parse } from "@/app/api/v1/ai/parse/route";
import { POST as transcribe } from "@/app/api/v1/ai/transcribe/route";
import { aiUsageLog } from "@/db/schema";
import { resetRateLimitState } from "@/lib/rate-limit";
import { MAX_AUDIO_BYTES } from "@/lib/ai-limits";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "../helpers/session";
import { bootstrapUser, setWorkspacePlan, workspaceIdOf } from "../helpers/seed";
import { getTestDb } from "../helpers/test-db";
import { createMemoryRateLimiter } from "../helpers/memory-rate-limiter";
import { apiReq, jsonBody } from "./helpers";
import type { NextRequest } from "next/server";

/**
 * The two AI endpoints cost real money per call, so what's asserted here is the
 * *gate order*, not the model output: the per-person AI rate limit → cheap local
 * checks → editor role → (voice: the Pro plan gate) → monthly allowance →
 * provider. A denied caller must never reach `fetch`, and must never consume an
 * allowance slot that belongs to someone who was allowed. The allowance itself —
 * what each call charges, and a burst at its last action — is covered in
 * `ai-allowance.test.ts`.
 *
 * Voice is Pro-only, and bootstrap creates Free workspaces, so every test that
 * means to get a transcription past the plan gate puts the workspace on Pro.
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

/** Ledger rows (charged provider calls) for a user. */
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

  it("403s voice on a Free workspace with plan_limit, before the quota", async () => {
    const fetchSpy = noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");

    const res = await transcribe(audioReq(SPEECH));
    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error.code).toBe("plan_limit");
    expect(error.details).toMatchObject({ limit: "voice", plan: "free", upgradeTo: "pro" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await quotaUsed("a")).toBe(0);
  });

  it("503s an editor when no model is configured — after the gates, not before", async () => {
    const fetchSpy = noProviderCalls();
    vi.stubEnv("AI_TRANSCRIBE_MODEL", "");
    vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", "");
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");

    const res = await transcribe(audioReq(SPEECH));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("ai_unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
    // The hourly slot is still spent: the caller was allowed, and the gates ran
    // in order. Only the operator's missing config stopped it — so the monthly
    // AI action it was charged is given back (the row stays, at 0 units).
    expect(await quotaUsed("a")).toBe(1);
    const [row] = await getTestDb()
      .select({ units: aiUsageLog.units, kind: aiUsageLog.kind })
      .from(aiUsageLog)
      .where(eq(aiUsageLog.userId, uid("a")));
    expect(row).toEqual({ units: 0, kind: "voice_transcribe_failed" });
  });

  it("C8: 429s with Retry-After once the person's AI rate limit is used, without reaching the provider", async () => {
    const fetchSpy = noProviderCalls();
    limiter.current = createMemoryRateLimiter();
    try {
      signInAs("a");
      await bootstrapUser("a");
      const W = await workspaceIdOf("a");
      await setWorkspacePlan(W, "pro");
      // Pro allows 6 AI requests a minute — shared by both endpoints.
      limiter.current.fill(uid("a"), "ai", 6);

      const res = await transcribe(audioReq(SPEECH));
      expect(res.status).toBe(429);
      const retryAfter = Number(res.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(await res.json()).toEqual({
        error: {
          code: "rate_limited",
          message: expect.stringMatching(/^That's a lot of AI requests in a short time\. Try again in /),
          details: { bucket: "ai", window: "1m", retryAfterSeconds: retryAfter },
        },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await quotaUsed("a")).toBe(0);
    } finally {
      limiter.current = null;
      resetRateLimitState();
    }
  });

  it("C8: a second AI call while the first is still being charged gets 429 with Retry-After: 1", async () => {
    const fetchSpy = noProviderCalls();
    signInAs("a");
    await bootstrapUser("a");

    // PGlite is a single connection, so the per-user try-lock can't really be
    // lost here; hand the charge a transaction whose try-lock comes back taken
    // — exactly what a concurrent call holding it would see.
    const db = getTestDb();
    const transaction = vi
      .spyOn(db, "transaction")
      .mockImplementationOnce((async (run: (tx: unknown) => Promise<unknown>) =>
        run({ execute: async () => ({ rows: [{ got: false }] }) })) as unknown as typeof db.transaction);

    const res = await parse(
      apiReq("/api/v1/ai/parse", { method: "POST", body: jsonBody({ text: "200 fruits" }) }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1");
    expect(await res.json()).toEqual({
      error: {
        code: "rate_limited",
        message: "Another AI request of yours is still running — try again in a moment.",
        details: { bucket: "ai", retryAfterSeconds: 1 },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await quotaUsed("a")).toBe(0);
    transaction.mockRestore();
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
