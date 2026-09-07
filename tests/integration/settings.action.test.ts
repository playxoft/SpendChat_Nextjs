import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { emailSendLog, users, userSettings, workspaceMembers, workspaces } from "@/db/schema";
import {
  deleteAllTransactions,
  dismissInviteNudge,
  notifyPasswordChanged,
  recordHeardFrom,
  updateAccountName,
  updateComposerDensity,
} from "@/actions/settings";
import { updateWorkspaceCurrency } from "@/actions/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, insertTxn, countTxns, workspaceIdOf } from "./helpers/seed";

const workspaceRow = (id: string) =>
  getTestDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .then((r) => r[0]);

describe("updateWorkspaceCurrency", () => {
  it("persists a valid currency + locale on the workspace", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const ws = await workspaceIdOf("a");
    const res = await updateWorkspaceCurrency(ws, { currency: "EUR", locale: "en-GB" });
    expect(res.ok).toBe(true);
    expect(await workspaceRow(ws)).toMatchObject({ currency: "EUR", locale: "en-GB" });
  });

  it("rejects an unsupported currency", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const ws = await workspaceIdOf("a");
    expect((await updateWorkspaceCurrency(ws, { currency: "ZZZ", locale: "en-US" })).ok).toBe(
      false,
    );
  });

  it("forbids a non-admin (viewer) from changing it", async () => {
    // b is a viewer in a's workspace; the admin gate must reject them.
    await bootstrapUser("a");
    await bootstrapUser("b");
    const ws = await workspaceIdOf("a");
    const db = getTestDb();
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws, userId: uid("b"), role: "viewer" })
      .onConflictDoNothing();

    signInAs("b");
    expect((await updateWorkspaceCurrency(ws, { currency: "EUR", locale: "en-GB" })).ok).toBe(
      false,
    );
    expect(await workspaceRow(ws)).toMatchObject({ currency: "USD" }); // unchanged
  });
});

describe("deleteAllTransactions", () => {
  it("requires the exact DELETE confirmation", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });

    expect(await deleteAllTransactions("delete", [])).toEqual({
      ok: false,
      error: "Type DELETE to confirm",
    });
    expect(await countTxns("a")).toBe(1); // untouched
  });

  it("wipes every transaction in the current workspace when confirmed (empty = all profiles)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    await insertTxn("a", { type: "income", amountMinor: 200, occurredOn: "2026-06-02" });
    // b's row lives in b's own workspace, so a's wipe never touches it.
    await insertTxn("b", { type: "expense", amountMinor: 50, occurredOn: "2026-06-01" });

    expect((await deleteAllTransactions("DELETE", [])).ok).toBe(true);
    expect(await countTxns("a")).toBe(0);
    expect(await countTxns("b")).toBe(1); // a different workspace — untouched
  });
});

const userRow = (alias: string) =>
  getTestDb()
    .select()
    .from(users)
    .where(eq(users.id, uid(alias)))
    .then((r) => r[0]);

describe("updateAccountName", () => {
  it("persists a trimmed display name on the user row", async () => {
    signInAs("a");
    await bootstrapUser("a");

    const res = await updateAccountName("  Ada Lovelace  ");
    expect(res).toMatchObject({ ok: true, name: "Ada Lovelace" });
    expect((await userRow("a"))?.name).toBe("Ada Lovelace");
  });

  it("rejects a blank name", async () => {
    signInAs("a");
    await bootstrapUser("a");

    expect((await updateAccountName("   ")).ok).toBe(false);
    expect((await userRow("a"))?.name).toBe("a"); // unchanged (seeded alias)
  });

  it("rejects a name over 50 characters", async () => {
    signInAs("a");
    await bootstrapUser("a");

    expect((await updateAccountName("x".repeat(51))).ok).toBe(false);
    expect((await userRow("a"))?.name).toBe("a");
  });
});

describe("notifyPasswordChanged", () => {
  const sendLogCount = async (alias: string) =>
    (await getTestDb().select().from(emailSendLog).where(eq(emailSendLog.userId, uid(alias)))).length;

  it("records a password_changed send for the signed-in user", async () => {
    signInAs("a");
    await bootstrapUser("a");

    const res = await notifyPasswordChanged();
    expect(res.ok).toBe(true);
    const rows = await getTestDb()
      .select()
      .from(emailSendLog)
      .where(eq(emailSendLog.userId, uid("a")));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("password_changed");
  });

  it("stays best-effort past the hourly cap (no throw, no extra send)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    // Fill the shared per-user email budget.
    await getTestDb()
      .insert(emailSendLog)
      .values(Array.from({ length: 20 }, () => ({ userId: uid("a"), kind: "member_invite" })));

    const res = await notifyPasswordChanged();
    expect(res.ok).toBe(true); // the password already changed — never a failure
    expect(await sendLogCount("a")).toBe(20); // capped: no additional send recorded
  });
});

describe("onboarding cards", () => {
  const acquisitionOf = async (alias: string) =>
    (
      await getTestDb()
        .select({ acquisition: users.acquisition })
        .from(users)
        .where(eq(users.id, uid(alias)))
    )[0]?.acquisition;

  it("recordHeardFrom merges the answer beside the browser's first touch", async () => {
    signInAs("h");
    await bootstrapUser("h");
    await getTestDb()
      .update(users)
      .set({ acquisition: { source: "hn", landing: "/" } })
      .where(eq(users.id, uid("h")));

    expect((await recordHeardFrom("other", "  a newsletter ")).ok).toBe(true);
    const stored = await acquisitionOf("h");
    expect(stored).toMatchObject({
      source: "hn",
      landing: "/",
      heardFrom: "other",
      heardFromOther: "a newsletter",
    });
    expect(stored?.heardFromAt).toBeTruthy();
  });

  it("keeps free text only for 'other', and records a skip", async () => {
    signInAs("h2");
    await bootstrapUser("h2");
    expect((await recordHeardFrom("reddit", "ignored")).ok).toBe(true);
    expect(await acquisitionOf("h2")).toMatchObject({ heardFrom: "reddit", heardFromOther: null });
    expect((await recordHeardFrom("skipped")).ok).toBe(true);
    expect(await acquisitionOf("h2")).toMatchObject({ heardFrom: "skipped" });
  });

  it("rejects an answer outside the list or over the length cap", async () => {
    signInAs("h3");
    await bootstrapUser("h3");
    expect((await recordHeardFrom("tiktok")).ok).toBe(false);
    expect((await recordHeardFrom("other", "x".repeat(81))).ok).toBe(false);
    expect(await acquisitionOf("h3")).toBeNull();
  });

  it("dismissInviteNudge flips ui_prefs.onboarding and leaves the composer alone", async () => {
    signInAs("d");
    await bootstrapUser("d");
    expect((await updateComposerDensity("compact")).ok).toBe(true);
    expect((await dismissInviteNudge()).ok).toBe(true);
    const [row] = await getTestDb()
      .select({ uiPrefs: userSettings.uiPrefs })
      .from(userSettings)
      .where(eq(userSettings.userId, uid("d")));
    expect(row.uiPrefs).toEqual({
      composer: { density: "compact" },
      onboarding: { inviteNudgeDismissed: true },
    });
  });
});
