import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { profiles, transactions } from "@/db/schema";
import {
  addProfile,
  updateProfile,
  deleteProfile,
  moveProfileTransactions,
  reorderProfiles,
  listProfiles,
} from "@/actions/profiles";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, insertTxn } from "./helpers/seed";

const profileByName = (userId: string, name: string) =>
  getTestDb()
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, uid(userId)), eq(profiles.name, name)))
    .limit(1)
    .then((r) => r[0]);

describe("addProfile", () => {
  it("appends with an incrementing sortOrder and returns the new id", async () => {
    signInAs("a");
    await bootstrapUser("a"); // Personal @ sortOrder 0

    const r1 = await addProfile({ name: "Work", icon: "💼", color: "" });
    const r2 = await addProfile({ name: "Home" });
    expect(r1.ok && r1.id).toBeTruthy();
    expect(r2.ok).toBe(true);

    expect((await profileByName("a", "Work")).sortOrder).toBe(1);
    expect((await profileByName("a", "Home")).sortOrder).toBe(2);
    expect((await profileByName("a", "Work")).color).toBeNull(); // "" → null
  });

  it("rejects invalid input and duplicate names", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await addProfile({ name: "" })).ok).toBe(false);
    await addProfile({ name: "Work" });
    expect(await addProfile({ name: "Work" })).toEqual({
      ok: false,
      error: "A profile with that name already exists",
    });
  });
});

describe("updateProfile", () => {
  it("updates supplied fields only", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await firstProfileId("a");
    expect((await updateProfile({ id, name: "Me", icon: "🙂", color: "" })).ok).toBe(true);
    let row = await profileByName("a", "Me");
    expect(row.icon).toBe("🙂");
    expect(row.color).toBeNull();

    // a blank icon is also cleared to null
    await updateProfile({ id, icon: "" });
    row = await profileByName("a", "Me");
    expect(row.icon).toBeNull();
  });

  it("rejects an invalid id and a colliding rename", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    expect((await updateProfile({ id: "bad" })).ok).toBe(false);
    expect(await updateProfile({ id: work.id, name: "Personal" })).toEqual({
      ok: false,
      error: "A profile with that name already exists",
    });
  });
});

describe("deleteProfile", () => {
  it("rejects an invalid id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(await deleteProfile("nope")).toEqual({ ok: false, error: "Invalid profile" });
  });

  it("refuses to delete the only profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await firstProfileId("a");
    expect(await deleteProfile(id)).toEqual({
      ok: false,
      error: "You need at least one profile",
    });
  });

  it("refuses to delete a profile that still has transactions", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    expect(await deleteProfile(work.id)).toEqual({
      ok: false,
      error: "Move this profile's transactions to another profile first",
    });
  });

  it("deletes an empty, non-last profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    expect((await deleteProfile(work.id)).ok).toBe(true);
    expect(await profileByName("a", "Work")).toBeUndefined();
  });
});

describe("moveProfileTransactions", () => {
  it("moves every transaction between two owned profiles", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: personal,
    });

    expect((await moveProfileTransactions(personal, work.id)).ok).toBe(true);
    const moved = await getTestDb()
      .select()
      .from(transactions)
      .where(eq(transactions.profileId, work.id));
    expect(moved).toHaveLength(1);
  });

  it("rejects bad ids and a no-op move", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    expect((await moveProfileTransactions("x", "y")).ok).toBe(false);
    expect(await moveProfileTransactions(personal, personal)).toEqual({
      ok: false,
      error: "Invalid profiles",
    });
  });

  it("rejects moving to an unowned profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const personal = await firstProfileId("a");
    const foreign = await firstProfileId("b");
    expect(await moveProfileTransactions(personal, foreign)).toEqual({
      ok: false,
      error: "Invalid profiles",
    });
  });
});

describe("reorderProfiles", () => {
  it("persists the given order as sortOrder", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    await addProfile({ name: "Home" });
    const work = await profileByName("a", "Work");
    const home = await profileByName("a", "Home");

    expect((await reorderProfiles([home.id, work.id, personal])).ok).toBe(true);
    const ordered = await listProfiles();
    expect(ordered.map((p) => p.name)).toEqual(["Home", "Work", "Personal"]);
  });

  it("rejects an invalid payload", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await reorderProfiles([])).ok).toBe(false);
  });
});

describe("listProfiles", () => {
  it("bootstraps and returns the user's profiles", async () => {
    signInAs("fresh");
    const list = await listProfiles();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Personal");
  });
});
