import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The per-person rate limiter's only edge: the Durable Object binding, replaced
// with the real counter over memory (see helpers/memory-rate-limiter.ts).
const limiter = vi.hoisted(() => ({
  current: null as import("../helpers/memory-rate-limiter").MemoryRateLimiter | null,
}));
vi.mock("@/lib/rate-limit/binding", () => ({
  getRateLimiterStub: (id: string) => limiter.current?.stubFor(id) ?? null,
}));

import { GET as listTransactions, POST as createTransaction } from "@/app/api/v1/transactions/route";
import { GET as listWorkspaces } from "@/app/api/v1/workspaces/route";
import { GET as version } from "@/app/api/v1/version/route";
import { resetRateLimitState } from "@/lib/rate-limit";
import * as ws from "@/services/workspaces";
import { createMemoryRateLimiter, type MemoryRateLimiter } from "../helpers/memory-rate-limiter";
import { signInAs, uid } from "../helpers/session";
import { bootstrapUser, setWorkspacePlan, workspaceIdOf } from "../helpers/seed";
import { apiReq, jsonBody } from "./helpers";

/**
 * Abuse rule C8 on the REST API: every authenticated request counts against a
 * bucket picked from its method and path, inside the auth step every route
 * calls; `handle()` answers a refusal with the error envelope + `Retry-After`.
 */

const T0 = Date.UTC(2026, 9, 6, 10, 0, 5);

const newEntry = () =>
  apiReq("/api/v1/transactions", {
    method: "POST",
    body: jsonBody({ type: "expense", amount: 5, occurredOn: "2026-10-06", title: "Tea" }),
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

describe("/api/v1 — per-person rate limits (C8)", () => {
  it("C8: the API answers 429 with Retry-After and the error envelope", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "read", 120); // Free: 120 reads a minute

    const res = await listTransactions(apiReq("/api/v1/transactions"));
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: {
        code: "rate_limited",
        message: expect.stringMatching(/^That's a lot of requests in a short time\. Try again in /),
        details: { bucket: "read", window: "1m", retryAfterSeconds: retryAfter },
      },
    });
  });

  it("C8: GET counts as a read, POST as a create", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "create", 20);

    expect((await createTransaction(newEntry())).status).toBe(429);
    expect((await listTransactions(apiReq("/api/v1/transactions"))).status).toBe(200);
  });

  it("C8: the plan comes from X-Workspace-Id", async () => {
    await bootstrapUser("a");
    await bootstrapUser("b");
    const own = await workspaceIdOf("a"); // Free
    const shared = await workspaceIdOf("b");
    await setWorkspacePlan(shared, "pro");
    await ws.addMember(uid("b"), shared, {
      email: "a@example.com",
      access: { mode: "all", role: "viewer" },
    });
    mem.fill(uid("a"), "read", 130); // over Free's 120, within Pro's 240

    signInAs("a");
    const inPro = await listTransactions(
      apiReq("/api/v1/transactions", { headers: { "x-workspace-id": shared } }),
    );
    expect(inPro.status).toBe(200);
    const inFree = await listTransactions(
      apiReq("/api/v1/transactions", { headers: { "x-workspace-id": own } }),
    );
    expect(inFree.status).toBe(429);
  });

  it("C8: routes with no workspace in context are counted, and judged by the best plan", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "read", 120);

    const before = mem.calls.hit;
    expect((await listWorkspaces(apiReq("/api/v1/workspaces"))).status).toBe(429);
    expect(mem.calls.hit).toBe(before + 1);

    resetRateLimitState();
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");
    expect((await listWorkspaces(apiReq("/api/v1/workspaces"))).status).toBe(200);
  });

  it("C8: GET /version is never limited and never reaches the Durable Object", async () => {
    signInAs("a");
    await bootstrapUser("a");
    mem.fill(uid("a"), "read", 500);
    const before = mem.calls.hit;
    expect((await version()).status).toBe(200);
    expect(mem.calls.hit).toBe(before);
  });
});
