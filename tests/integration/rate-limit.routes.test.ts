import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// The per-person rate limiter's only edge: the Durable Object binding, replaced
// with the real counter over memory (see helpers/memory-rate-limiter.ts).
const limiter = vi.hoisted(() => ({
  current: null as import("./helpers/memory-rate-limiter").MemoryRateLimiter | null,
}));
vi.mock("@/lib/rate-limit/binding", () => ({
  getRateLimiterStub: (id: string) => limiter.current?.stubFor(id) ?? null,
}));

import { GET as exportCsv } from "@/app/api/transactions/export/route";
import { POST as uploadFiles } from "@/app/api/files/upload/route";
import { POST as attachFiles } from "@/app/api/transactions/[id]/attachments/route";
import { DELETE as removeAvatar, POST as uploadAvatar } from "@/app/api/account/avatar/route";
import { resetRateLimitState } from "@/lib/rate-limit";
import { createMemoryRateLimiter, type MemoryRateLimiter } from "./helpers/memory-rate-limiter";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, insertTxn, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";

/**
 * Abuse rule C8 on the cookie-authenticated routes outside both seams: the CSV
 * export is a read; the vault upload, transaction attachments and the avatar
 * are creates (a batch of files is one request). The file-serving GETs are
 * deliberately not limited — a vault grid fetches one per thumbnail.
 */

const T0 = Date.UTC(2026, 9, 6, 10, 0, 5);

/** A same-origin POST with no body: the limit is checked before the body is read. */
const post = (path: string, method = "POST") =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "sec-fetch-site": "same-origin" },
  }) as NextRequest;

let mem: MemoryRateLimiter;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  mem = createMemoryRateLimiter();
  limiter.current = mem;
  // Uploads answer 503 before anything else when R2 isn't configured.
  vi.stubEnv("R2_ACCOUNT_ID", "acc");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("R2_BUCKET", "bucket");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://files.example.com");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  limiter.current = null;
  resetRateLimitState();
});

async function expectRefused(res: Response, bucket: string) {
  expect(res.status).toBe(429);
  const retryAfter = Number(res.headers.get("Retry-After"));
  expect(retryAfter).toBeGreaterThan(0);
  expect(await res.json()).toEqual({
    error: expect.stringMatching(/ Try again in /),
    code: "rate_limited",
    details: { bucket, window: "1m", retryAfterSeconds: retryAfter },
  });
}

describe("web routes outside the seams — per-person rate limits (C8)", () => {
  it("C8: the CSV export is a read and is limited", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await exportCsv(new Request("http://localhost/api/transactions/export"))).status).toBe(200);
    mem.fill(uid("a"), "read", 120);
    await expectRefused(await exportCsv(new Request("http://localhost/api/transactions/export")), "read");
  });

  it("C8: vault uploads and transaction attachments are creates, refused before the body is read", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const txn = await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-10-06" });
    mem.fill(uid("a"), "create", 20);

    await expectRefused(await uploadFiles(post("/api/files/upload")), "create");
    resetRateLimitState();
    await expectRefused(
      await attachFiles(post(`/api/transactions/${txn}/attachments`), {
        params: Promise.resolve({ id: txn }),
      }),
      "create",
    );
  });

  it("C8: uploads follow the current workspace's plan", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");
    mem.fill(uid("a"), "create", 25);
    // Allowed by Pro's 40 — so it goes on to read the (missing) body: a 400, not a 429.
    expect((await uploadFiles(post("/api/files/upload"))).status).not.toBe(429);
  });

  it("C8: the avatar is a create on the account", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "create", 20);
    await expectRefused(await uploadAvatar(post("/api/account/avatar")), "create");
    await expectRefused(await removeAvatar(post("/api/account/avatar", "DELETE")), "create");
  });
});
