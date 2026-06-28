import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { userSettings } from "@/db/schema";
import {
  updateSettings,
  updateCurrency,
  deleteAllTransactions,
} from "@/actions/settings";
import { signInAs } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, insertTxn, countTxns } from "./helpers/seed";

const settingsRow = (userId: string) =>
  getTestDb()
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .then((r) => r[0]);

describe("updateSettings", () => {
  it("persists a valid currency/locale/theme", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await updateSettings({
      currency: "EUR",
      locale: "en-GB",
      theme: "dark",
    });
    expect(res.ok).toBe(true);
    const row = await settingsRow("a");
    expect(row).toMatchObject({ currency: "EUR", locale: "en-GB", theme: "dark" });
  });

  it("rejects invalid settings", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(
      (await updateSettings({ currency: "ZZZ", locale: "en", theme: "dark" })).ok,
    ).toBe(false);
  });
});

describe("updateCurrency", () => {
  it("updates just the currency", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await updateCurrency("INR")).ok).toBe(true);
    expect((await settingsRow("a")).currency).toBe("INR");
  });

  it("rejects an unsupported currency", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(await updateCurrency("ZZZ")).toEqual({
      ok: false,
      error: "Unsupported currency",
    });
  });
});

describe("deleteAllTransactions", () => {
  it("requires the exact DELETE confirmation", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });

    expect(await deleteAllTransactions("delete")).toEqual({
      ok: false,
      error: "Type DELETE to confirm",
    });
    expect(await countTxns("a")).toBe(1); // untouched
  });

  it("wipes all of the user's transactions when confirmed", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    await insertTxn("a", { type: "income", amountMinor: 200, occurredOn: "2026-06-02" });
    await insertTxn("b", { type: "expense", amountMinor: 50, occurredOn: "2026-06-01" });

    expect((await deleteAllTransactions("DELETE")).ok).toBe(true);
    expect(await countTxns("a")).toBe(0);
    expect(await countTxns("b")).toBe(1); // other users untouched
  });
});
