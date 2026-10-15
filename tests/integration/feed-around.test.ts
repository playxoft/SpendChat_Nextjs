import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import {
  FEED_PAGE_SIZE,
  getProfiles,
  listFeedAround,
  listFeedDays,
  listFeedPage,
  type FeedCursor,
  type TransactionRow,
} from "@/lib/queries";
import { addProfile } from "@/actions/profiles";
import { loadFeedAround, loadFeedDays, loadNewerFeed } from "@/actions/transactions";
import { deleteTransaction } from "@/services/transactions";
import { transactions } from "@/db/schema";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, firstProfileId, workspaceIdOf } from "./helpers/seed";
import { getTestDb } from "./helpers/test-db";

/**
 * "Go to a date" on the tracker: the window read around a day
 * (`listFeedAround`), the forward page that walks back to the present
 * (`listFeedPage` with `after`), and the picker's dots (`listFeedDays`).
 *
 * Personal and Work share the month. 3 June has a Personal and a Work row
 * written at the same instant (a tie on `created_at` that only `id` breaks)
 * and a later Personal row; 7 June has only a trashed row; 10 June has two
 * Personal rows from one bulk write (another tie).
 */

const U = uid("fa");
let W: string;
let personal: string;
let work: string;

async function txn(
  profileId: string,
  occurredOn: string,
  createdAt: string,
  title: string,
): Promise<string> {
  const [row] = await getTestDb()
    .insert(transactions)
    .values({
      userId: U,
      type: "expense",
      amountMinor: 100,
      occurredOn,
      profileId,
      title,
      createdAt: new Date(createdAt),
    })
    .returning({ id: transactions.id });
  return row!.id;
}

const titles = (rows: { title: string | null }[]) => rows.map((r) => r.title);
const cursorOf = (r: TransactionRow): FeedCursor => ({
  occurredOn: r.occurredOn,
  createdAt: r.createdAt,
  id: r.id,
});

/** The whole feed, oldest first — what scrolling all the way through shows. */
async function wholeFeed(profileIds?: string[]): Promise<TransactionRow[]> {
  return (await listFeedPage(U, W, { profileIds, limit: 1000 })).reverse();
}

beforeEach(async () => {
  signInAs("fa");
  await bootstrapUser("fa");
  W = await workspaceIdOf("fa");
  personal = await firstProfileId("fa");
  await addProfile({ name: "Work" });
  work = (await getProfiles(U, W)).find((p) => p.name === "Work")!.id;

  await txn(personal, "2026-06-01", "2026-06-01T10:00:00Z", "p1");
  await txn(personal, "2026-06-03", "2026-06-03T09:00:00Z", "p3 tie");
  await txn(work, "2026-06-03", "2026-06-03T09:00:00Z", "w3 tie");
  await txn(personal, "2026-06-03", "2026-06-03T11:00:00Z", "p3 later");
  await txn(work, "2026-06-05", "2026-06-05T10:00:00Z", "w5");
  const binned = await txn(personal, "2026-06-07", "2026-06-07T10:00:00Z", "binned");
  await txn(personal, "2026-06-10", "2026-06-10T08:00:00Z", "p10 tie");
  await txn(personal, "2026-06-10", "2026-06-10T08:00:00Z", "p10 tie too");
  await txn(work, "2026-07-02", "2026-07-02T10:00:00Z", "w7");
  expect(await deleteTransaction(U, W, binned)).toBe(true);
});

describe("listFeedAround", () => {
  it("lands on the day asked for, with the start of that day first after what came before", async () => {
    const all = await wholeFeed();
    const win = await listFeedAround(U, W, { date: "2026-06-03", limit: 2 });
    expect(win.landed).toEqual({ day: "2026-06-03", side: "on" });
    // Before the day: everything there is (one row). From the day: its first two —
    // the tie at 09:00, in id order — and more after.
    expect(win.rows.map((r) => r.id)).toEqual(all.slice(0, 3).map((r) => r.id));
    expect(titles(win.rows).slice(1).sort()).toEqual(["p3 tie", "w3 tie"]);
    expect(win.hasOlder).toBe(false);
    expect(win.hasNewer).toBe(true);
  });

  it("orders a day like the feed: time, then id for rows written at the same instant", async () => {
    const win = await listFeedAround(U, W, { date: "2026-06-03", limit: 40 });
    const day = win.rows.filter((r) => r.occurredOn === "2026-06-03");
    expect(day.map((r) => r.title)).toHaveLength(3);
    expect(day[2]!.title).toBe("p3 later");
    expect(day[0]!.id < day[1]!.id).toBe(true);
  });

  it("a day with nothing on it (only a trashed row) lands on the nearest earlier day", async () => {
    const win = await listFeedAround(U, W, { date: "2026-06-07", limit: 40 });
    expect(win.landed).toEqual({ day: "2026-06-05", side: "before" });
    expect(titles(win.rows)).not.toContain("binned");
    expect(win.rows.map((r) => r.id)).toEqual((await wholeFeed()).map((r) => r.id));
    expect(win.hasOlder).toBe(false);
    expect(win.hasNewer).toBe(false);
  });

  it("past the newest day, lands on the newest", async () => {
    const win = await listFeedAround(U, W, { date: "2027-01-01", limit: 2 });
    expect(win.landed).toEqual({ day: "2026-07-02", side: "before" });
    // The two rows nearest before it (the 10 June tie), then the day itself.
    expect(titles(win.rows).slice(0, 2).sort()).toEqual(["p10 tie", "p10 tie too"]);
    expect(win.rows.at(-1)!.title).toBe("w7");
    expect(win.rows).toHaveLength(3);
    expect(win.hasOlder).toBe(true);
    expect(win.hasNewer).toBe(false);
  });

  it("before the first day, goes forward to the first day — nothing earlier exists", async () => {
    const win = await listFeedAround(U, W, { date: "2026-01-01", limit: 40 });
    expect(win.landed).toEqual({ day: "2026-06-01", side: "after" });
    expect(win.rows[0]!.title).toBe("p1");
  });

  it("follows the profile selection", async () => {
    const win = await listFeedAround(U, W, { profileIds: [work], date: "2026-06-04", limit: 40 });
    expect(win.landed).toEqual({ day: "2026-06-03", side: "before" });
    expect(titles(win.rows)).toEqual(["w3 tie", "w5", "w7"]);
    // Work has nothing on or before 1 June: forward to its first day.
    expect((await listFeedAround(U, W, { profileIds: [work], date: "2026-06-01", limit: 40 })).landed).toEqual({
      day: "2026-06-03",
      side: "after",
    });
  });

  it("lands nowhere with nothing in view", async () => {
    expect(await listFeedAround(U, W, { profileIds: [], date: "2026-06-03", limit: 40 })).toEqual({
      landed: null,
      rows: [],
      hasOlder: false,
      hasNewer: false,
    });
  });

  it("opens a busy day at its start, and pages on in both directions without a repeat or a gap", async () => {
    // A bulk import: 45 rows on one day, all at the same instant.
    await getTestDb().execute(sql`
      insert into transactions (user_id, type, amount_minor, occurred_on, profile_id, title, created_at)
      select ${U}::uuid, 'expense', 500 + i, date '2026-06-20',
             (array[${personal}::uuid, ${work}::uuid])[1 + (i % 2)], 'bulk ' || i,
             timestamptz '2026-06-20 12:00:00.123+00'
      from generate_series(1, 45) i`);
    const all = await wholeFeed();
    const limit = 4;
    const win = await listFeedAround(U, W, { date: "2026-06-20", limit });
    expect(win.landed).toEqual({ day: "2026-06-20", side: "on" });
    const firstOfDay = all.findIndex((r) => r.occurredOn === "2026-06-20");
    expect(win.rows.map((r) => r.id)).toEqual(all.slice(firstOfDay - limit, firstOfDay + limit).map((r) => r.id));

    // Walk back to the start of history, and forward to the present.
    const walked = [...win.rows];
    let older = win.hasOlder;
    while (older) {
      const page = (await listFeedPage(U, W, { limit, before: cursorOf(walked[0]!) })).reverse();
      walked.unshift(...page);
      older = page.length === limit;
    }
    let newer = win.hasNewer;
    while (newer) {
      const page = (await listFeedPage(U, W, { limit, after: cursorOf(walked.at(-1)!) })).reverse();
      walked.push(...page);
      newer = page.length === limit;
    }
    expect(walked.map((r) => r.id)).toEqual(all.map((r) => r.id));
    expect(new Set(walked.map((r) => r.id)).size).toBe(all.length);
  });
});

describe("listFeedPage with `after`", () => {
  it("returns the rows just newer than the cursor, newest first like every page", async () => {
    const all = await wholeFeed();
    const page = await listFeedPage(U, W, { limit: 2, after: cursorOf(all[0]!) });
    expect(page.map((r) => r.id)).toEqual([all[2]!.id, all[1]!.id]);
  });

  it("splits a tie on created_at by id, so nothing tied with the cursor is skipped", async () => {
    const all = await wholeFeed();
    const tie = all.filter((r) => r.title?.startsWith("p10"));
    const page = await listFeedPage(U, W, { limit: 1, after: cursorOf(tie[0]!) });
    expect(page.map((r) => r.id)).toEqual([tie[1]!.id]);
  });

  it("follows the profile selection, and is empty at the newest row", async () => {
    const all = await wholeFeed();
    const page = await listFeedPage(U, W, { profileIds: [work], limit: 10, after: cursorOf(all[0]!) });
    expect(titles(page)).toEqual(["w7", "w5", "w3 tie"]);
    expect(await listFeedPage(U, W, { limit: 10, after: cursorOf(all.at(-1)!) })).toEqual([]);
  });
});

describe("listFeedDays", () => {
  it("lists the month's days with live transactions, once each, in order", async () => {
    expect(await listFeedDays(U, W, { month: "2026-06" })).toEqual([
      "2026-06-01",
      "2026-06-03",
      "2026-06-05",
      "2026-06-10",
    ]);
    expect(await listFeedDays(U, W, { month: "2026-07" })).toEqual(["2026-07-02"]);
    expect(await listFeedDays(U, W, { month: "2026-08" })).toEqual([]);
  });

  it("follows the profile selection", async () => {
    expect(await listFeedDays(U, W, { profileIds: [work], month: "2026-06" })).toEqual([
      "2026-06-03",
      "2026-06-05",
    ]);
    expect(await listFeedDays(U, W, { profileIds: [], month: "2026-06" })).toEqual([]);
  });

  it("stays inside the month at both ends", async () => {
    await txn(personal, "2026-05-31", "2026-05-31T23:00:00Z", "may");
    await txn(personal, "2026-06-30", "2026-06-30T23:00:00Z", "june end");
    await txn(personal, "2026-07-01", "2026-07-01T00:30:00Z", "july start");
    const june = await listFeedDays(U, W, { month: "2026-06" });
    expect(june[0]).toBe("2026-06-01");
    expect(june.at(-1)).toBe("2026-06-30");
    expect(await listFeedDays(U, W, { month: "2026-05" })).toEqual(["2026-05-31"]);
  });
});

describe("the date-jump actions", () => {
  it("loadFeedAround opens the feed at a day", async () => {
    const res = await loadFeedAround({ date: "2026-06-08" });
    expect(res.ok && res.landed).toEqual({ day: "2026-06-05", side: "before" });
    expect(res.ok && res.rows.length).toBe(8);
  });

  it("loadFeedAround refuses a day that doesn't exist", async () => {
    const res = await loadFeedAround({ date: "2026-02-31" });
    expect(res.ok).toBe(false);
  });

  it("loadNewerFeed pages forward oldest-first and says when it reaches the present", async () => {
    await getTestDb().execute(sql`
      insert into transactions (user_id, type, amount_minor, occurred_on, profile_id, title, created_at)
      select ${U}::uuid, 'expense', 500 + i, date '2026-08-01', ${personal}::uuid, 'aug ' || i,
             timestamptz '2026-08-01 12:00:00+00'
      from generate_series(1, ${FEED_PAGE_SIZE + 5}) i`);
    const all = await wholeFeed();
    const w7 = all.findIndex((r) => r.title === "w7");
    const first = await loadNewerFeed({ after: cursorOf(all[w7]!) });
    expect(first.ok && first.hasMore).toBe(true);
    expect(first.ok && first.rows.map((r) => r.id)).toEqual(
      all.slice(w7 + 1, w7 + 1 + FEED_PAGE_SIZE).map((r) => r.id),
    );
    const last = first.ok ? first.rows.at(-1)! : null;
    const second = await loadNewerFeed({ after: cursorOf(last!) });
    expect(second.ok && second.hasMore).toBe(false);
    expect(second.ok && second.rows.map((r) => r.id)).toEqual(all.slice(w7 + 1 + FEED_PAGE_SIZE).map((r) => r.id));
  });

  it("loadNewerFeed refuses a malformed cursor", async () => {
    const res = await loadNewerFeed({ after: { occurredOn: "2026-06-01", createdAt: new Date(), id: "nope" } });
    expect(res.ok).toBe(false);
  });

  it("loadFeedDays answers for a month, and refuses one that isn't", async () => {
    expect(await loadFeedDays({ month: "2026-07" })).toEqual({ ok: true, days: ["2026-07-02"] });
    expect((await loadFeedDays({ month: "2026-13" })).ok).toBe(false);
  });
});
