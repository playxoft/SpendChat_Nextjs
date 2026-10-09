import { describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { profileOverrides, profiles, spaceMembers, spaces, workspaceMembers } from "@/db/schema";
import {
  countTransactions,
  getMonthlyTotals,
  getProfiles,
  getSummary,
  listFeedPage,
  listTransactions,
  listVaultFiles,
} from "@/lib/queries";
import { parseProfileScope, resolveProfileScope } from "@/lib/profile-scope";
import { getAdvancedAnalytics } from "@/lib/insights-queries";
import { getTrend } from "@/lib/trend.server";
import { loadMoreTransactions, loadOlderFeed } from "@/actions/transactions";
import { deleteTransaction } from "@/services/transactions";
import { GET as webExportRoute } from "@/app/api/transactions/export/route";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";
import { seedFile } from "./helpers/vault-seed";

/**
 * The sidebar's multi-select (`?profile=<id>,s.<spaceId>,…`) is a *view*: what
 * it names is expanded against the profiles the viewer can see, and every read
 * intersects it with `accessibleProfileIds` again. These prove the three ways
 * it could go wrong don't: a forged or foreign id widening a read, a space
 * leaking the profiles a member can't see, and the trash showing through.
 */

const db = () => getTestDb();
const DAY = "2026-10-05";
const FORGED = "00000000-0000-7000-8000-00000000dead";

/**
 * adm's workspace: "Home" holds Personal (100) and Work (200); "Family" holds
 * Kids (400); Old (800, live rows) sits in Home but is in the trash. Personal
 * also has a trashed 1600. `hid` edits Home with an override hiding Work.
 * `out` has a workspace of their own with Elsewhere (3200).
 */
async function build() {
  await bootstrapUser("adm");
  const W = await workspaceIdOf("adm");
  const home = await defaultSpaceIdOf(W);
  await db().update(spaces).set({ name: "Home" }).where(eq(spaces.id, home));
  const [family] = await db()
    .insert(spaces)
    .values({ workspaceId: W, name: "Family", position: 1 })
    .returning({ id: spaces.id });
  const add = async (name: string, spaceId: string, sortOrder: number) => {
    const [row] = await db()
      .insert(profiles)
      .values({ userId: uid("adm"), workspaceId: W, spaceId, name, sortOrder })
      .returning({ id: profiles.id });
    return row!.id;
  };
  const personal = await firstProfileId("adm");
  const work = await add("Work", home, 1);
  const kids = await add("Kids", family!.id, 2);
  const old = await add("Old", home, 3);

  const txn = (profileId: string, amountMinor: number, title: string) =>
    insertTxn("adm", { type: "expense", amountMinor, occurredOn: DAY, profileId, title });
  await txn(personal, 100, "personal row");
  await txn(work, 200, "work row");
  await txn(kids, 400, "kids row");
  await txn(old, 800, "old row");
  const binned = await txn(personal, 1600, "binned row");
  await deleteTransaction(uid("adm"), W, binned);
  // Old goes to the trash with its rows still live — only the profile hides them.
  await db().update(profiles).set({ deletedAt: sql`now()` }).where(eq(profiles.id, old));

  await registerUser("hid");
  await db().insert(workspaceMembers).values({ workspaceId: W, userId: uid("hid"), role: "editor" });
  await db().insert(spaceMembers).values({ spaceId: home, userId: uid("hid"), role: "editor" });
  await db().insert(profileOverrides).values({ profileId: work, userId: uid("hid"), access: "none" });

  await bootstrapUser("out");
  const elsewhere = await firstProfileId("out");
  await insertTxn("out", {
    type: "expense",
    amountMinor: 3200,
    occurredOn: DAY,
    profileId: elsewhere,
    title: "elsewhere row",
  });

  return { W, home, family: family!.id, personal, work, kids, old, elsewhere };
}

/** What the pages do: parse `?profile=`, expand against what the viewer sees. */
async function resolve(alias: string, W: string, raw: string) {
  return resolveProfileScope(parseProfileScope(raw), await getProfiles(uid(alias), W));
}

const titles = (rows: { title: string | null }[]) => rows.map((r) => r.title).sort();

describe("profile selection — forged and foreign ids", () => {
  it("drops an id from another workspace, and one that names nothing, when expanding", async () => {
    const f = await build();
    const scope = await resolve("adm", f.W, `${f.personal},${f.elsewhere},${FORGED},s.${FORGED}`);
    expect(scope.profileIds).toEqual([f.personal]);
  });

  it("never reads past the caller's profiles, whatever the list says", async () => {
    const f = await build();
    const forged = { profileIds: [f.personal, f.elsewhere, FORGED] };
    expect(titles(await listTransactions(uid("adm"), f.W, forged))).toEqual(["personal row"]);
    expect(titles(await listFeedPage(uid("adm"), f.W, { ...forged, limit: 40 }))).toEqual([
      "personal row",
    ]);
    expect(await countTransactions(uid("adm"), f.W, forged)).toBe(1);
    expect((await getSummary(uid("adm"), f.W, forged)).expense).toBe(100);
    expect(await getMonthlyTotals(uid("adm"), f.W, forged)).toEqual([
      { month: "2026-10", income: 0, expense: 100 },
    ]);
  });

  it("reads nothing — not everything — when nothing in the list is the caller's", async () => {
    const f = await build();
    const foreign = { profileIds: [f.elsewhere, FORGED] };
    expect(await listTransactions(uid("adm"), f.W, foreign)).toEqual([]);
    expect(await listFeedPage(uid("adm"), f.W, { ...foreign, limit: 40 })).toEqual([]);
    expect(await getSummary(uid("adm"), f.W, foreign)).toEqual({ income: 0, expense: 0, balance: 0 });
    expect(await listTransactions(uid("adm"), f.W, { profileIds: [] })).toEqual([]);
  });

  it("holds for the load-more actions, which take the list from the client", async () => {
    const f = await build();
    signInAs("adm");
    const more = await loadMoreTransactions({
      filters: { profileIds: [f.kids, f.elsewhere] },
      offset: 0,
    });
    expect(more.ok && titles(more.rows)).toEqual(["kids row"]);
    const older = await loadOlderFeed({
      profileIds: [f.elsewhere],
      before: { occurredOn: "2099-01-01", createdAt: new Date(), id: FORGED },
    });
    expect(older.ok && older.rows).toEqual([]);
  });

  it("holds for the CSV export link", async () => {
    const f = await build();
    signInAs("adm");
    const res = await webExportRoute(
      new Request(
        `http://localhost/api/transactions/export?profile=${f.kids},${f.elsewhere},s.${f.family}`,
      ),
    );
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("kids row");
    expect(csv).not.toContain("elsewhere row");
    expect(csv).not.toContain("personal row");
  });

  it("holds for the vault", async () => {
    const f = await build();
    await seedFile("adm", f.personal, { name: "mine.pdf" });
    await seedFile("out", f.elsewhere, { name: "theirs.pdf" });
    const files = await listVaultFiles(uid("adm"), f.W, [f.personal, f.elsewhere]);
    expect(files.map((x) => x.name)).toEqual(["mine.pdf"]);
    expect(await listVaultFiles(uid("adm"), f.W, [f.elsewhere])).toEqual([]);
  });
});

describe("profile selection — spaces", () => {
  it("expands a space to every live profile in it, for an admin", async () => {
    const f = await build();
    const scope = await resolve("adm", f.W, `s.${f.home}`);
    expect([...(scope.profileIds ?? [])].sort()).toEqual([f.personal, f.work].sort());
    expect(titles(await listTransactions(uid("adm"), f.W, { profileIds: scope.profileIds }))).toEqual([
      "personal row",
      "work row",
    ]);
  });

  it("expands a space to only the profiles a member can see in it", async () => {
    const f = await build();
    const scope = await resolve("hid", f.W, `s.${f.home},s.${f.family}`);
    // Work is hidden by an override, Family isn't one of hid's spaces.
    expect(scope.profileIds).toEqual([f.personal]);
    // And a client that names them anyway still reads only Personal.
    const rows = await listTransactions(uid("hid"), f.W, {
      profileIds: [f.personal, f.work, f.kids],
    });
    expect(titles(rows)).toEqual(["personal row"]);
  });

  it("combines spaces and profiles, as the trend and the insights read them", async () => {
    const f = await build();
    await setWorkspacePlan(f.W, "plus");
    const scope = await resolve("adm", f.W, `${f.kids},s.${f.home}`);
    expect(new Set(scope.profileIds)).toEqual(new Set([f.kids, f.personal, f.work]));
    const trend = await getTrend(uid("adm"), f.W, {
      from: "2026-10-01",
      to: "2026-10-31",
      profileIds: scope.profileIds,
      today: "2026-10-09",
      firstDay: 1,
      kept: false,
    });
    expect(trend.expense).toBe(700);
    // The insights' per-profile split covers the selection, minus the stranger.
    const insights = await getAdvancedAnalytics(uid("adm"), f.W, {
      today: "2026-10-09",
      from: "2026-10-01",
      to: "2026-10-31",
      profileIds: [f.kids, f.personal, f.elsewhere],
      currency: "INR",
      locale: "en-IN",
    });
    const split = insights.breakdown.profiles?.map((r) => [r.label, r.total]);
    expect(split?.sort()).toEqual([
      ["Kids", 400],
      ["Personal", 100],
    ]);
  });
});

describe("profile selection — the trash", () => {
  it("leaves a trashed profile out of its space, and out of a list that names it", async () => {
    const f = await build();
    const scope = await resolve("adm", f.W, `s.${f.home},${f.old}`);
    expect(scope.profileIds).not.toContain(f.old);
    const rows = await listTransactions(uid("adm"), f.W, { profileIds: [f.old, f.personal] });
    expect(titles(rows)).toEqual(["personal row"]);
    expect(await listTransactions(uid("adm"), f.W, { profileIds: [f.old] })).toEqual([]);
  });

  it("leaves trashed transactions out of a selected profile", async () => {
    const f = await build();
    const { expense } = await getSummary(uid("adm"), f.W, { profileIds: [f.personal] });
    expect(expense).toBe(100);
    const feed = await listFeedPage(uid("adm"), f.W, { profileIds: [f.personal, f.kids], limit: 40 });
    expect(titles(feed)).toEqual(["kids row", "personal row"]);
  });
});
