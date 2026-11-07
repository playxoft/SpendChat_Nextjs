import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { userSettings, users, workspaces } from "@/db/schema";
import { confirmCurrency } from "@/actions/settings";
import { sendEmail } from "@/lib/email";
import { normalizeUiPrefs } from "@/lib/validation";
import { siteConfig } from "@/lib/site";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { ensureBootstrap } from "@/lib/auth";
import { bootstrapUser, registerUser, workspaceIdOf } from "./helpers/seed";

const db = () => getTestDb();
const sent = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]);

async function stateOf(alias: string) {
  const [ws] = await db()
    .select({ currency: workspaces.currency, locale: workspaces.locale })
    .from(workspaces)
    .where(eq(workspaces.id, await workspaceIdOf(alias)));
  const [settings] = await db()
    .select({ uiPrefs: userSettings.uiPrefs })
    .from(userSettings)
    .where(eq(userSettings.userId, uid(alias)));
  const [user] = await db().select({ welcomedAt: users.welcomedAt }).from(users).where(eq(users.id, uid(alias)));
  return {
    ...ws!,
    pending: normalizeUiPrefs(settings?.uiPrefs).onboarding.currencyPending,
    welcomedAt: user?.welcomedAt ?? null,
  };
}

describe("confirmCurrency (the new account's currency step)", () => {
  it("is owed by a new account, and no welcome email goes out until it's done", async () => {
    signInAs("c1");
    await bootstrapUser("c1");
    const before = await stateOf("c1");
    expect(before.pending).toBe(true);
    expect(before.welcomedAt).toBeNull();
    expect(sent()).toHaveLength(0);
  });

  it("isn't owed by an account the mobile app made, which gets its welcome email at once", async () => {
    await registerUser("c9");
    await ensureBootstrap(uid("c9"), { fromApi: true });
    await ensureBootstrap(uid("c9"), { fromApi: true });
    const state = await stateOf("c9");
    expect(state.pending).toBe(false);
    expect(state.welcomedAt).toBeInstanceOf(Date);
    expect(sent()).toHaveLength(1);
  });

  it("sets the workspace's currency and number format, clears the step, and sends the welcome email in that currency", async () => {
    signInAs("c2");
    await bootstrapUser("c2"); // tests bootstrap as en-US / USD
    const res = await confirmCurrency({ country: "IN", currency: "INR" });
    expect(res.ok).toBe(true);
    const after = await stateOf("c2");
    expect(after).toMatchObject({ currency: "INR", locale: "en-IN", pending: false });
    expect(after.welcomedAt).toBeInstanceOf(Date);

    expect(sent()).toHaveLength(1);
    const mail = sent()[0]!;
    expect(mail.to).toBe("c2@example.com");
    expect(mail.subject).toBe(`Welcome to ${siteConfig.name}, c2`);
    expect(mail.replyTo).toBe(siteConfig.supportEmail);
    expect(mail.html).toContain("₹");
    expect(mail.html).not.toContain("$");
  });

  it("sends the welcome email once, however many times the step is confirmed", async () => {
    signInAs("c3");
    await bootstrapUser("c3");
    await confirmCurrency({ country: "IN", currency: "INR" });
    const again = await confirmCurrency({ country: "GB", currency: "GBP" });
    expect(again.ok).toBe(true);
    expect((await stateOf("c3")).currency).toBe("GBP");
    expect(sent()).toHaveLength(1);
  });

  it("takes a currency other than the country's own", async () => {
    signInAs("c4");
    await bootstrapUser("c4");
    expect((await confirmCurrency({ country: "IN", currency: "USD" })).ok).toBe(true);
    expect(await stateOf("c4")).toMatchObject({ currency: "USD", locale: "en-IN" });
  });

  it("refuses a country or currency that isn't on the list, and changes nothing", async () => {
    signInAs("c5");
    await bootstrapUser("c5");
    expect((await confirmCurrency({ country: "ZZ", currency: "INR" })).ok).toBe(false);
    expect((await confirmCurrency({ country: "in", currency: "INR" })).ok).toBe(false);
    expect((await confirmCurrency({ country: "IN", currency: "BTC" })).ok).toBe(false);
    expect(await stateOf("c5")).toMatchObject({ currency: "USD", pending: true });
    expect(sent()).toHaveLength(0);
  });

  it("changes the workspace the person owns, never one they were invited to", async () => {
    signInAs("owner");
    await bootstrapUser("owner");
    const shared = await workspaceIdOf("owner");
    await bootstrapUser("guest");
    await ws.addMember(uid("owner"), shared, {
      email: "guest@example.com",
      access: { mode: "all", role: "admin" },
    });

    signInAs("guest");
    expect((await confirmCurrency({ country: "JP", currency: "JPY" })).ok).toBe(true);
    expect((await stateOf("guest")).currency).toBe("JPY");
    expect((await stateOf("owner")).currency).toBe("USD");
  });
});
