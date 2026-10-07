import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { getTrend } from "@/lib/trend.server";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";
import { seedProfile } from "./helpers/vault-seed";
import { getTestDb } from "./helpers/test-db";

/**
 * The analytics trend (`getTrend`): the page's range in day, week, month or
 * year columns, through the feed's access scoping and trash rule.
 */

const A = "trd";
const TODAY = "2026-10-07";
let U: string;
let W: string;
let personal: string;
let work: string;

const base = { today: TODAY, firstDay: 1 as const, kept: false };

beforeEach(async () => {
  signInAs(A);
  await bootstrapUser(A);
  U = uid(A);
  W = await workspaceIdOf(A);
  personal = await firstProfileId(A);
  work = await seedProfile(A, "Work");
  await insertTxn(A, { type: "income", amountMinor: 500000, occurredOn: "2026-10-01", profileId: personal });
  await insertTxn(A, { type: "expense", amountMinor: 2000, occurredOn: "2026-10-05", profileId: personal });
  await insertTxn(A, { type: "expense", amountMinor: 7000, occurredOn: "2026-10-05", profileId: work });
  await insertTxn(A, { type: "expense", amountMinor: 4000, occurredOn: "2026-08-10", profileId: personal });
  const ghost = await insertTxn(A, { type: "expense", amountMinor: 999999, occurredOn: "2026-10-03", profileId: personal });
  await getTestDb().update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, ghost));
});

describe("getTrend", () => {
  it("shows this month by day, without the trash", async () => {
    const t = await getTrend(U, W, { ...base, from: "2026-10-01", to: "2026-10-31" });
    expect(t.bucket).toBe("day");
    expect(t.points).toHaveLength(31);
    expect(t.points.find((p) => p.key === "2026-10-05")).toMatchObject({ income: 0, expense: 9000 });
    expect(t.points.find((p) => p.key === "2026-10-03")).toMatchObject({ expense: 0 });
    expect(t.income).toBe(500000);
    expect(t.expense).toBe(9000);
    expect(t.kept).toBeUndefined();
  });

  it("narrows to one profile, and adds what was kept for Plus and Pro", async () => {
    const t = await getTrend(U, W, { ...base, from: "2026-10-01", to: "2026-10-31", profileId: work, kept: true });
    expect(t.expense).toBe(7000);
    expect(t.kept).toEqual({ net: -7000, savingsRate: null });
  });

  it("shows three months by week", async () => {
    const t = await getTrend(U, W, { ...base, from: "2026-08-01", to: TODAY });
    expect(t.bucket).toBe("week");
    expect(t.expense).toBe(13000);
    expect(t.points.find((p) => p.from <= "2026-08-10" && p.to >= "2026-08-10")?.expense).toBe(4000);
  });

  it("shows twelve months by month, the first and last only as far as the range goes", async () => {
    const t = await getTrend(U, W, { ...base, from: "2025-11-01", to: TODAY });
    expect(t.bucket).toBe("month");
    expect(t.points).toHaveLength(12);
    expect(t.points.find((p) => p.key === "2026-08")).toMatchObject({ expense: 4000 });
    expect(t.points.at(-1)).toMatchObject({ key: "2026-10", from: "2026-10-01", to: TODAY, income: 500000, expense: 9000 });
  });

  it("starts all time at the first month with an entry, by month", async () => {
    await insertTxn(A, { type: "expense", amountMinor: 100, occurredOn: "2026-02-14", profileId: personal });
    const t = await getTrend(U, W, base);
    expect(t.span).toEqual({ from: "2026-02-01", to: TODAY });
    expect(t.bucket).toBe("month");
    expect(t.points.map((p) => p.key)).toEqual([
      "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(t.expense).toBe(13100);
  });

  it("shows all time by day while it fits in a month, and an empty month with no entries", async () => {
    const t = await getTrend(U, W, { ...base, profileId: work });
    expect(t.span).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(t.bucket).toBe("day");
    expect(t.expense).toBe(7000);
    await bootstrapUser("out");
    const none = await getTrend(uid("out"), W, base);
    expect(none.span).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(none.income + none.expense).toBe(0);
  });
});
