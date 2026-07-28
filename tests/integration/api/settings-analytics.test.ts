import { describe, it, expect } from "vitest";
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/v1/settings/route";
import { GET as summary } from "@/app/api/v1/analytics/summary/route";
import { GET as byCategory } from "@/app/api/v1/analytics/categories/route";
import { GET as monthly } from "@/app/api/v1/analytics/monthly/route";
import { signInAs } from "../helpers/session";
import { bootstrapUser, categoryId, insertTxn } from "../helpers/seed";
import { apiReq, jsonBody } from "./helpers";

describe("/api/v1/settings", () => {
  it("returns user settings and patches a subset (theme, inputMode)", async () => {
    signInAs("a");
    const got = await getSettings(apiReq("/api/v1/settings"));
    const settings = (await got.json()).data;
    expect(settings.theme).toBe("system");
    expect(settings.inputMode).toBe("amount_title");
    // Currency/locale are per-workspace now — not in user settings.
    expect(settings.currency).toBeUndefined();

    const patched = await patchSettings(
      apiReq("/api/v1/settings", { method: "PATCH", body: jsonBody({ theme: "dark" }) }),
    );
    const { data } = await patched.json();
    expect(data.theme).toBe("dark");
  });

  it("422s an empty patch or a bad theme (currency is no longer a settings field)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await patchSettings(apiReq("/api/v1/settings", { method: "PATCH", body: jsonBody({}) }))).status).toBe(422);
    expect(
      (await patchSettings(apiReq("/api/v1/settings", { method: "PATCH", body: jsonBody({ theme: "neon" }) }))).status,
    ).toBe(422);
    // currency is stripped as unknown → empty patch → 422.
    expect(
      (await patchSettings(apiReq("/api/v1/settings", { method: "PATCH", body: jsonBody({ currency: "EUR" }) }))).status,
    ).toBe(422);
  });
});

describe("/api/v1/analytics", () => {
  it("summarises income, expense and balance in minor units", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await insertTxn("a", { type: "income", amountMinor: 5000, occurredOn: "2026-06-01" });
    await insertTxn("a", { type: "expense", amountMinor: 2000, occurredOn: "2026-06-02" });

    const res = await summary(apiReq("/api/v1/analytics/summary"));
    const body = await res.json();
    expect(body.data).toEqual({ income: 5000, expense: 2000, balance: 3000 });
    expect(body.meta.currency.code).toBe("USD");
  });

  it("breaks down by category and requires a valid type", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const groceries = await categoryId("a", "Groceries", "expense");
    await insertTxn("a", { type: "expense", amountMinor: 2000, occurredOn: "2026-06-02", categoryId: groceries });

    const ok = await byCategory(apiReq("/api/v1/analytics/categories?type=expense"));
    expect(ok.status).toBe(200);
    const { data } = await ok.json();
    expect(data[0].total).toBe(2000);

    const bad = await byCategory(apiReq("/api/v1/analytics/categories"));
    expect(bad.status).toBe(422);
  });

  it("returns a monthly trend and requires `from`", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await insertTxn("a", { type: "income", amountMinor: 5000, occurredOn: "2026-06-01" });
    await insertTxn("a", { type: "expense", amountMinor: 2000, occurredOn: "2026-06-15" });

    const res = await monthly(apiReq("/api/v1/analytics/monthly?from=2026-01-01"));
    const { data } = await res.json();
    expect(data).toContainEqual({ month: "2026-06", income: 5000, expense: 2000 });

    const bad = await monthly(apiReq("/api/v1/analytics/monthly"));
    expect(bad.status).toBe(422);
  });
});
