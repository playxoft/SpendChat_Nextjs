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
import { createProfile } from "@/services/profiles";
import { countTransactions, listTransactions } from "@/lib/queries";
import { signInAs, uid } from "./helpers/session";
import { captureSql, getTestDb } from "./helpers/test-db";
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

describe("the tag filter on the read path", () => {
  it("matches ANY of the selected tags, and composes with the other filters", async () => {
    const { userId, workspaceId, profileId } = await seedUser("a");
    const travel = await createTxnTag(userId, workspaceId, { name: "Travel", color: "#ef4444" });
    const work = await createTxnTag(userId, workspaceId, { name: "Work", color: "#22c55e" });
    const other = await createTxnTag(userId, workspaceId, { name: "Other", color: "#3b82f6" });

    const t = await createTransactionId(userId, workspaceId, {
      ...txn(profileId, [travel.id]),
      title: "flight",
    });
    const w = await createTransactionId(userId, workspaceId, {
      ...txn(profileId, [work.id]),
      title: "laptop",
    });
    const both = await createTransactionId(userId, workspaceId, {
      ...txn(profileId, [travel.id, work.id]),
      title: "hotel",
    });
    await createTransactionId(userId, workspaceId, { ...txn(profileId), title: "untagged" });

    const ids = async (f: Parameters<typeof listTransactions>[2]) =>
      (await listTransactions(userId, workspaceId, f)).map((r) => r.id).sort();

    // One tag.
    expect(await ids({ tagIds: [travel.id] })).toEqual([t.id, both.id].sort());
    // Two tags widen (OR), and a row carrying both appears once, not twice.
    expect(await ids({ tagIds: [travel.id, work.id] })).toEqual([t.id, w.id, both.id].sort());
    // A tag nobody used matches nothing.
    expect(await ids({ tagIds: [other.id] })).toEqual([]);
    // Absent and empty both mean "don't filter".
    expect(await ids({ tagIds: [] })).toHaveLength(4);
    // Composes with another predicate rather than replacing it.
    expect(await ids({ tagIds: [travel.id, work.id], search: "hotel" })).toEqual([both.id]);
  });

  /**
   * The page is assembled per profile and merged (`pageOf`'s merge-append),
   * which is the shape the `uuid[]` column was chosen to preserve — 35ms
   * against 2.7s on a large workspace, and it only holds while every filter is
   * a predicate on `transactions` alone.
   *
   * Asserting the rows is not enough, and this test used to do only that:
   * `pageOf`'s single-scan fallback uses `profile_id in (...)` and returns
   * exactly the same rows in the same order, so deleting the merge outright
   * left this — and the whole suite — green. `union all` in the emitted SQL is
   * the part only the merge produces, and a join table could not produce it
   * without putting a join inside every branch.
   */
  it("survives the multi-profile merge-append path", async () => {
    const { userId, workspaceId, profileId } = await seedUser("a");
    const second = await createProfile(userId, workspaceId, { name: "Company", icon: "🏢" });
    const tag = await createTxnTag(userId, workspaceId, { name: "Shared", color: "#ef4444" });

    const inFirst = await createTransactionId(userId, workspaceId, txn(profileId, [tag.id]));
    const inSecond = await createTransactionId(userId, workspaceId, txn(second.id, [tag.id]));
    await createTransactionId(userId, workspaceId, txn(profileId));
    await createTransactionId(userId, workspaceId, txn(second.id));

    // No `profileId` filter = every accessible profile = the merged path.
    const statements = await captureSql(() =>
      listTransactions(userId, workspaceId, { tagIds: [tag.id] }),
    );
    const listing = statements.find(
      (st) => st.text.includes("tag_ids") && st.text.includes("limit"),
    );
    expect(listing, "no tag-filtered listing statement captured").toBeTruthy();
    expect(listing!.text, `the merge is gone:\n${listing!.text}`).toContain("union all");
    // The filter is a predicate on `transactions`, not a join to a link table.
    expect(listing!.text).not.toMatch(/join\s+"?transaction_tags"?/i);

    const rows = await listTransactions(userId, workspaceId, { tagIds: [tag.id] });
    expect(rows.map((r) => r.id).sort()).toEqual([inFirst.id, inSecond.id].sort());
    // And the count query, which shares `buildConditions`, agrees with it.
    expect(await countTransactions(userId, workspaceId, { tagIds: [tag.id] })).toBe(2);
  });

  it("embeds each row's tags, name-ordered, and drops ids that no longer resolve", async () => {
    const { userId, workspaceId, profileId } = await seedUser("a");
    const zebra = await createTxnTag(userId, workspaceId, { name: "Zebra", color: "#ef4444" });
    const apple = await createTxnTag(userId, workspaceId, { name: "apple", color: "#22c55e" });
    const { id } = await createTransactionId(
      userId,
      workspaceId,
      txn(profileId, [zebra.id, apple.id]),
    );

    const [row] = await listTransactions(userId, workspaceId, {});
    // Ordered by name, not by the order they were applied. "apple" before
    // "Zebra" is the pair that discriminates: under PGlite's C collation a
    // plain `order by name` puts every capital first and returns the reverse.
    expect(row!.tags.map((t) => t.name)).toEqual(["apple", "Zebra"]);

    // A tag deleted out from under a row simply stops appearing — the column
    // carries no FK, so an unresolvable id must not produce an empty chip.
    await deleteTxnTag(userId, workspaceId, zebra.id);
    const [after] = await listTransactions(userId, workspaceId, {});
    expect(after!.id).toBe(id);
    expect(after!.tags.map((t) => t.name)).toEqual(["apple"]);

    // An untagged row carries an empty array, never null — the embed
    // coalesces, so no client has to guard it. Added last, because it is the
    // newest row and would otherwise displace the one above.
    const untagged = await createTransactionId(userId, workspaceId, txn(profileId));
    const fresh = await listTransactions(userId, workspaceId, {});
    expect(fresh.find((r) => r.id === untagged.id)!.tags).toEqual([]);
  });
});
