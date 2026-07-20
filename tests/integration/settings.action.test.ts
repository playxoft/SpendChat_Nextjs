import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { workspaceMembers, workspaces } from "@/db/schema";
import { deleteAllTransactions } from "@/actions/settings";
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
