import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { transactions } from "@/db/schema";
import {
  createTxnTag,
  updateTxnTag,
  deleteTxnTag,
  listTxnTags,
  countTransactionsForTxnTag,
} from "@/services/tags";
import { createTransactionId, setTransactionTags } from "@/services/transactions";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, workspaceIdOf } from "./helpers/seed";

/**
 * The tag service, and in particular `deleteTxnTag` — a delete plus a sweep of
 * `transactions.tag_ids`, which carries no foreign key, so nothing in the
 * database detaches a deleted tag for us. It is the one piece of this feature
 * that can leave data wrong, and it had no coverage.
 */

const tagIdsOf = async (txnId: string): Promise<string[]> => {
  const [row] = await getTestDb()
    .select({ tagIds: transactions.tagIds })
    .from(transactions)
    .where(eq(transactions.id, txnId));
  return row!.tagIds;
};

async function seedUser(alias: string) {
  signInAs(alias);
  await bootstrapUser(alias);
  return {
    userId: uid(alias),
    workspaceId: await workspaceIdOf(alias),
    profileId: await firstProfileId(alias),
  };
}

const txn = (profileId: string, tagIds: string[] = []) => ({
  type: "expense" as const,
  amount: 10,
  occurredOn: "2026-09-22",
  profileId,
  tagIds,
});

describe("tag CRUD", () => {
  it("creates, lists by name, renames and recolors", async () => {
    const { userId, workspaceId } = await seedUser("a");

    const travel = await createTxnTag(userId, workspaceId, { name: "Travel", color: "#EF4444" });
    await createTxnTag(userId, workspaceId, { name: "Apples", color: "#22c55e" });

    // Color is normalized on write, so the chip's alpha suffixes are built
    // from a known shape.
    expect(travel.color).toBe("#ef4444");
    expect((await listTxnTags(workspaceId)).map((t) => t.name)).toEqual(["Apples", "Travel"]);

    const renamed = await updateTxnTag(userId, workspaceId, travel.id, { name: "Trips" });
    expect(renamed?.name).toBe("Trips");
    const recolored = await updateTxnTag(userId, workspaceId, travel.id, { color: "#3B82F6" });
    expect(recolored?.color).toBe("#3b82f6");
  });

  it("rejects a duplicate name case-insensitively, and only on the real conflict", async () => {
    const { userId, workspaceId } = await seedUser("a");
    await createTxnTag(userId, workspaceId, { name: "Travel", color: "#ef4444" });

    await expect(
      createTxnTag(userId, workspaceId, { name: "travel", color: "#22c55e" }),
    ).rejects.toThrow(/already exists/i);

    // A rename onto an existing name conflicts the same way; renaming a tag to
    // the name it already has must not.
    const apples = await createTxnTag(userId, workspaceId, { name: "Apples", color: "#22c55e" });
    await expect(
      updateTxnTag(userId, workspaceId, apples.id, { name: "TRAVEL" }),
    ).rejects.toThrow(/already exists/i);
    expect((await updateTxnTag(userId, workspaceId, apples.id, { name: "Apples" }))?.name).toBe(
      "Apples",
    );
  });

  it("keeps each workspace's tags to itself", async () => {
    const a = await seedUser("a");
    const b = await seedUser("b");
    const theirs = await createTxnTag(b.userId, b.workspaceId, {
      name: "Theirs",
      color: "#ef4444",
    });

    // Same name in two workspaces is fine — the unique index is per workspace.
    signInAs("a");
    await createTxnTag(a.userId, a.workspaceId, { name: "Theirs", color: "#22c55e" });
    expect((await listTxnTags(a.workspaceId)).map((t) => t.name)).toEqual(["Theirs"]);

    // And a tag id from another workspace is not addressable here.
    expect(await updateTxnTag(a.userId, a.workspaceId, theirs.id, { name: "Stolen" })).toBeNull();
    expect(await deleteTxnTag(a.userId, a.workspaceId, theirs.id)).toBe(false);
  });
});

describe("tags on a transaction", () => {
  it("stores only ids from the caller's workspace", async () => {
    const b = await seedUser("b");
    const foreign = await createTxnTag(b.userId, b.workspaceId, {
      name: "Foreign",
      color: "#ef4444",
    });

    const a = await seedUser("a");
    const mine = await createTxnTag(a.userId, a.workspaceId, { name: "Mine", color: "#22c55e" });

    // The foreign id is dropped, not rejected — `tag_ids` has no FK, so the
    // thing that must never happen is storing it.
    const { id } = await createTransactionId(
      a.userId,
      a.workspaceId,
      txn(a.profileId, [foreign.id, mine.id]),
    );
    expect(await tagIdsOf(id)).toEqual([mine.id]);
  });

  it("setTransactionTags replaces the list and can clear it", async () => {
    const { userId, workspaceId, profileId } = await seedUser("a");
    const one = await createTxnTag(userId, workspaceId, { name: "One", color: "#ef4444" });
    const two = await createTxnTag(userId, workspaceId, { name: "Two", color: "#22c55e" });

    const { id } = await createTransactionId(userId, workspaceId, txn(profileId, [one.id]));
    await setTransactionTags(userId, workspaceId, id, { id, tagIds: [two.id, one.id] });
    expect(await tagIdsOf(id)).toEqual([two.id, one.id]);

    await setTransactionTags(userId, workspaceId, id, { id, tagIds: [] });
    expect(await tagIdsOf(id)).toEqual([]);
  });
});

describe("deleteTxnTag", () => {
  it("detaches the tag from every transaction that carried it, across profiles", async () => {
    const { userId, workspaceId, profileId } = await seedUser("a");
    const doomed = await createTxnTag(userId, workspaceId, { name: "Doomed", color: "#ef4444" });
    const keep = await createTxnTag(userId, workspaceId, { name: "Keep", color: "#22c55e" });

    const both = await createTransactionId(
      userId,
      workspaceId,
      txn(profileId, [doomed.id, keep.id]),
    );
    const onlyDoomed = await createTransactionId(userId, workspaceId, txn(profileId, [doomed.id]));
    const untouched = await createTransactionId(userId, workspaceId, txn(profileId, [keep.id]));

    expect(await countTransactionsForTxnTag(workspaceId, doomed.id)).toBe(2);
    expect(await deleteTxnTag(userId, workspaceId, doomed.id)).toBe(true);

    // The sweep removes the id and leaves every other tag in place — it is an
    // `array_remove`, not a reset of the column.
    expect(await tagIdsOf(both.id)).toEqual([keep.id]);
    expect(await tagIdsOf(onlyDoomed.id)).toEqual([]);
    expect(await tagIdsOf(untouched.id)).toEqual([keep.id]);
    expect((await listTxnTags(workspaceId)).map((t) => t.name)).toEqual(["Keep"]);
    expect(await countTransactionsForTxnTag(workspaceId, doomed.id)).toBe(0);
  });

  it("leaves another workspace's transactions alone", async () => {
    const b = await seedUser("b");
    const theirTag = await createTxnTag(b.userId, b.workspaceId, {
      name: "Shared name",
      color: "#ef4444",
    });
    const theirTxn = await createTransactionId(
      b.userId,
      b.workspaceId,
      txn(b.profileId, [theirTag.id]),
    );

    const a = await seedUser("a");
    const myTag = await createTxnTag(a.userId, a.workspaceId, {
      name: "Shared name",
      color: "#22c55e",
    });
    const myTxn = await createTransactionId(a.userId, a.workspaceId, txn(a.profileId, [myTag.id]));

    expect(await deleteTxnTag(a.userId, a.workspaceId, myTag.id)).toBe(true);
    expect(await tagIdsOf(myTxn.id)).toEqual([]);
    // Same name, different workspace, untouched.
    expect(await tagIdsOf(theirTxn.id)).toEqual([theirTag.id]);
  });

  it("returns false for an unknown tag and rejects a non-uuid", async () => {
    const { userId, workspaceId } = await seedUser("a");
    expect(
      await deleteTxnTag(userId, workspaceId, "0199a000-0000-7000-8000-000000000999"),
    ).toBe(false);
    await expect(deleteTxnTag(userId, workspaceId, "nope")).rejects.toThrow(/invalid tag/i);
  });
});
