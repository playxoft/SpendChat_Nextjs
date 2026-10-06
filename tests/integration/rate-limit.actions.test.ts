import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The per-person rate limiter's only edge: the Durable Object binding, replaced
// with the real counter over memory (see helpers/memory-rate-limiter.ts).
const limiter = vi.hoisted(() => ({
  current: null as import("./helpers/memory-rate-limiter").MemoryRateLimiter | null,
}));
vi.mock("@/lib/rate-limit/binding", () => ({
  getRateLimiterStub: (id: string) => limiter.current?.stubFor(id) ?? null,
}));

import {
  addBulkTransactions,
  addTransaction,
  loadMoreTransactions,
} from "@/actions/transactions";
import { setCollapsedSpaces, updateAccountName } from "@/actions/settings";
import type { BulkDraft } from "@/lib/bulk-parser";
import { resetRateLimitState } from "@/lib/rate-limit";
import { createMemoryRateLimiter, type MemoryRateLimiter } from "./helpers/memory-rate-limiter";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, countTxns, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";

/**
 * Abuse rule C8 at the server-action seam (`runAction`): per-person rate limits
 * by plan, with a 429-shaped result the UI shows as-is. The numbers are
 * `RATE_LIMITS` — Free: 20 creates / 120 reads / 3 AI a minute; Pro: 40 / 240 / 6.
 */

/** A moment early in a minute, so a test's requests all land in one slot. */
const T0 = Date.UTC(2026, 9, 6, 10, 0, 5);

const entry = { type: "expense" as const, amount: 5, occurredOn: "2026-10-06", title: "Tea" };

const draft = (i: number): BulkDraft => ({
  type: "expense",
  amount: 10 + i,
  note: `row ${i}`,
  categoryName: null,
  occurredOn: "2026-10-06",
});

let mem: MemoryRateLimiter;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  mem = createMemoryRateLimiter();
  limiter.current = mem;
});

afterEach(() => {
  vi.useRealTimers();
  limiter.current = null;
  resetRateLimitState();
});

describe("server actions — per-person rate limits (C8)", () => {
  it("C8: the 21st entry a Free person adds in a minute is refused, with retryAfterSeconds — and nothing is written", async () => {
    signInAs("a");
    await bootstrapUser("a");

    for (let i = 0; i < 20; i++) expect((await addTransaction(entry)).ok).toBe(true);
    const res = await addTransaction(entry);

    expect(res).toMatchObject({
      ok: false,
      code: "rate_limited",
      details: { bucket: "create", window: "1m" },
    });
    if (!res.ok) {
      expect(res.error).toMatch(/^That's a lot of changes in a short time\. Try again in \d+ seconds\.$/);
      expect((res.details as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(await countTxns("a")).toBe(20);
  });

  it("C8: a bulk add of 30 drafts counts as one request", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "create", 19);

    const bulk = await addBulkTransactions(Array.from({ length: 30 }, (_, i) => draft(i)));
    expect(bulk).toEqual({ ok: true, count: 30 });
    // That was the 20th request of the minute; the 21st is refused.
    expect((await addTransaction(entry)).ok).toBe(false);
    expect(await countTxns("a")).toBe(30);
  });

  it("C8: the window frees up after Retry-After, and refused attempts didn't count", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "create", 20);

    const first = await addTransaction(entry);
    const second = await addTransaction(entry); // refused from the isolate's cache
    expect(first.ok || second.ok).toBe(false);
    const wait = (first as { details: { retryAfterSeconds: number } }).details.retryAfterSeconds;
    expect((second as { details: { retryAfterSeconds: number } }).details.retryAfterSeconds).toBe(
      wait,
    );
    expect(mem.calls.hit).toBe(1); // the cached refusal never reached the Durable Object
    // The refused hit is taken back once the response is out.
    await vi.waitFor(() => expect(mem.calls.undo).toBe(1));

    vi.setSystemTime(T0 + (wait - 1) * 1000);
    expect((await addTransaction(entry)).ok).toBe(false);

    vi.setSystemTime(T0 + wait * 1000);
    expect((await addTransaction(entry)).ok).toBe(true);
    expect(await countTxns("a")).toBe(1);
  });

  it("C8: reads and preferences keep working while creates are blocked", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "create", 20);
    expect((await addTransaction(entry)).ok).toBe(false);

    // Infinite scroll is a read; a sidebar fold is a preference — the read bucket.
    expect((await loadMoreTransactions({ filters: {}, offset: 0 })).ok).toBe(true);
    expect((await setCollapsedSpaces([])).ok).toBe(true);
  });

  it("C8: Pro gets Pro's numbers — the workspace the action names decides", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    mem.fill(uid("a"), "create", 25);

    // 26 in a minute: over Free's 20…
    expect((await addTransaction(entry)).ok).toBe(false);
    resetRateLimitState(); // forget the isolate's block; the counts stay
    await setWorkspacePlan(W, "pro");
    // …within Pro's 40.
    expect((await addTransaction(entry)).ok).toBe(true);
  });

  it("C8: account-level actions are judged by the person's best plan", async () => {
    await bootstrapUser("a");
    await bootstrapUser("b");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");
    mem.fill(uid("a"), "create", 25);
    mem.fill(uid("b"), "create", 25);

    // Renaming yourself has no workspace in context: a (on Pro) passes, b (Free) waits.
    signInAs("a");
    expect((await updateAccountName("Ada")).ok).toBe(true);
    signInAs("b");
    expect(await updateAccountName("Bea")).toMatchObject({ ok: false, code: "rate_limited" });
  });

  it("fails open when there is no Durable Object binding", async () => {
    limiter.current = null;
    signInAs("a");
    await bootstrapUser("a");
    for (let i = 0; i < 25; i++) expect((await addTransaction(entry)).ok).toBe(true);
  });
});
