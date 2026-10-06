import { describe, it, expect } from "vitest";
import { GET as listBudgets, POST as createBudget } from "@/app/api/v1/budgets/route";
import { PATCH as patchBudget, DELETE as deleteBudget } from "@/app/api/v1/budgets/[id]/route";
import { GET as getUsage } from "@/app/api/v1/usage/route";
import { utcMonthKey } from "@/lib/budgets";
import { setSession, signInAs } from "../helpers/session";
import { bootstrapUser, categoryId, firstProfileId, insertTxn, setWorkspacePlan, workspaceIdOf } from "../helpers/seed";
import { apiReq, ctx, jsonBody } from "./helpers";

const MISSING = "00000000-0000-0000-0000-000000000000";
const MONTH = utcMonthKey();

async function post(body: unknown, query = "") {
  const res = await createBudget(apiReq(`/api/v1/budgets${query}`, { method: "POST", body: jsonBody(body) }));
  return { status: res.status, body: await res.json() };
}

async function list(query = "") {
  const res = await listBudgets(apiReq(`/api/v1/budgets${query}`));
  return { status: res.status, body: await res.json() };
}

describe("/api/v1/budgets", () => {
  it("401s without a token", async () => {
    setSession(null);
    expect((await listBudgets(apiReq("/api/v1/budgets", { auth: false }))).status).toBe(401);
  });

  it("creates, lists with this month's progress, changes and deletes", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const profileId = await firstProfileId("a");
    await insertTxn("a", { type: "expense", amountMinor: 4500, occurredOn: `${MONTH}-01`, profileId });

    expect((await list()).body).toEqual({ data: [], meta: { month: MONTH, currency: expect.any(Object) } });

    const created = await post({ scope: "profile", profileId, amount: 50 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      scope: "profile",
      profileId,
      categoryId: null,
      label: "Personal",
      period: "monthly",
      amountMinor: 5000,
      emailAlerts: true,
      month: MONTH,
      spentMinor: 4500,
      percent: 90,
      status: "warn",
      canManage: true,
      canDelete: true,
    });
    expect(created.body.data.createdAt).toMatch(/Z$/);
    expect(created.body.meta.currency.code).toBe("USD");
    const id = created.body.data.id as string;

    // Another month: same budget, that month's spending.
    const old = await list("?month=2020-01");
    expect(old.body.meta.month).toBe("2020-01");
    expect(old.body.data[0]).toMatchObject({ id, month: "2020-01", spentMinor: 0, status: "ok" });
    // Malformed, or a year SQL can't read as a four-digit date: 422, never a 500.
    for (const bad of ["2020-13", "0000-01", "0099-12", "1969-12", "3000-01", "20201-01"]) {
      const res = await list(`?month=${bad}`);
      expect(res.status, bad).toBe(422);
      expect(res.body.error.code).toBe("validation_error");
    }
    expect((await list("?month=1970-01")).status).toBe(200);
    expect((await list("?month=2999-12")).status).toBe(200);

    const patched = await patchBudget(
      apiReq(`/api/v1/budgets/${id}`, { method: "PATCH", body: jsonBody({ amount: 40, emailAlerts: false }) }),
      ctx({ id }),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data).toMatchObject({ amountMinor: 4000, emailAlerts: false, status: "over", percent: 112 });

    const gone = await deleteBudget(apiReq(`/api/v1/budgets/${id}`, { method: "DELETE" }), ctx({ id }));
    expect(await gone.json()).toEqual({ data: { id, deleted: true } });
    expect((await deleteBudget(apiReq(`/api/v1/budgets/${id}`, { method: "DELETE" }), ctx({ id }))).status).toBe(404);
    expect(
      (await patchBudget(apiReq(`/api/v1/budgets/${MISSING}`, { method: "PATCH", body: jsonBody({ amount: 1 }) }), ctx({ id: MISSING }))).status,
    ).toBe(404);
  });

  it("answers 409 for a scope that has one, 422 for bad input, 403 plan_limit past the cap", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    expect((await post({ scope: "workspace", amount: 100 })).status).toBe(201);
    const dup = await post({ scope: "workspace", amount: 100 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("conflict");
    expect((await post({ scope: "category", categoryId: await categoryId("a", "Salary", "income"), amount: 1 })).status).toBe(422);
    expect((await post({ scope: "space", amount: 1 })).status).toBe(422);
    // Rounds to nothing in minor units: a 422, not a 500 from the check constraint.
    const tiny = await post({ scope: "profile", profileId: await firstProfileId("a"), amount: 0.001 });
    expect(tiny.status).toBe(422);
    expect(tiny.body.error.message).toBe("The amount must be at least 0.01 USD");

    for (const name of ["Groceries", "Transport", "Housing", "Health"]) {
      expect((await post({ scope: "category", categoryId: await categoryId("a", name, "expense"), amount: 1 })).status).toBe(201);
    }
    const capped = await post({ scope: "category", categoryId: await categoryId("a", "Shopping", "expense"), amount: 1 });
    expect(capped.status).toBe(403);
    expect(capped.body.error).toMatchObject({
      code: "plan_limit",
      details: { limit: "budgets", plan: "free", max: 5, used: 5, upgradeTo: "plus" },
    });

    await setWorkspacePlan(W, "pro");
    const usage = (await (await getUsage(apiReq("/api/v1/usage"))).json()).data;
    expect(usage.budgets).toEqual({ used: 5, limit: 200, unlimited: true });
  });
});
