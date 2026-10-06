import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { ProfileAccessLevel, SpaceRole, WorkspaceRole } from "@/db/schema";
import { maxRole, resolveProfileRole } from "@/lib/rbac";
import { defaultOrganizationName, readOnlyWorkspaceSql } from "@/lib/workspaces";
import { uid } from "./helpers/session";

/**
 * The 0034–0036 backfill, run against data that existed *before* it (and the
 * rest of the folder after it, 0037 dropping the short-lived `grandfathered`
 * flag included).
 *
 * Its promise is "nobody's role changes": every profile moves into one
 * "Main" space per workspace and every non-admin member joins it at their old
 * role. The shared test database can't check that — it migrates an empty
 * database — so this file boots its own PGlite, applies migrations up to 0033,
 * writes pre-pricing fixture rows with raw SQL, then runs the full folder and
 * compares. (The plan's own rules — like "one free workspace per person" —
 * apply on top from the day plans ship; there is no grace period.)
 */

const MIGRATIONS = path.resolve(process.cwd(), "src/db/migrations");
const LAST_PRE_PRICING_IDX = 33;

type Journal = { entries: { idx: number; tag: string }[] };

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let partialDir: string;

/** A copy of the migrations folder whose journal stops at `lastIdx`. */
function migrationsUpTo(lastIdx: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spendchat-migrations-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const entries = journal.entries.filter((e) => e.idx <= lastIdx);
  for (const e of entries) {
    fs.copyFileSync(path.join(MIGRATIONS, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  }
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return dir;
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query<T>(sql, params)).rows;
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await rows<T>(sql, params);
  return row!;
}

// ── Fixture ────────────────────────────────────────────────────────────────

/** A name long enough that "<name>'s organisation" has to be shortened. */
const LONG_NAME = "Maximiliana Wolfeschlegelsteinhausen";

const U = {
  alice: uid("alice"), // owner of two workspaces, named
  bob: uid("bob"), // owner, no name → email local part
  max: uid("max"), // owner, a name too long for the organisation column
  dora: uid("dora"), // owner with no users row at all → "My organisation"
  vic: uid("vic"), // viewer member of WA1 (+ an editor grant on one profile)
  ed: uid("ed"), // editor member of WA1, viewer member of WA2
  meg: uid("meg"), // admin member of WA1
  gus: uid("gus"), // no membership, a profile_access grant in WA1
  nob: uid("nob"), // nobody — no rows anywhere
};

const W: Record<string, string> = {};
const P: Record<string, string> = {};
const DELETED_WORKSPACE = "00000000-0000-4000-8000-0000000dead1";

/** Every (user, profile) role under the *old* rule: max(workspace role, grant). */
const oldRoles = new Map<string, WorkspaceRole | null>();
const key = (user: string, profile: string) => `${user}:${profile}`;

async function insertFixture(): Promise<void> {
  await client.query(
    `insert into users (id, firebase_uid, email, name) values
       ($1, 'fb-alice', 'alice@example.com', 'Alice'),
       ($2, 'fb-bob', 'bob@example.com', null),
       ($3, 'fb-max', 'max@example.com', $4),
       ($5, 'fb-vic', 'vic@example.com', 'Vic'),
       ($6, 'fb-ed', 'ed@example.com', 'Ed'),
       ($7, 'fb-meg', 'meg@example.com', 'Meg'),
       ($8, 'fb-gus', 'gus@example.com', 'Gus'),
       ($9, 'fb-nob', 'nob@example.com', 'Nob')`,
    [U.alice, U.bob, U.max, LONG_NAME, U.vic, U.ed, U.meg, U.gus, U.nob],
  );

  const ws = async (name: string, owner: string, createdAt: string) => {
    const { id } = await one<{ id: string }>(
      `insert into workspaces (name, owner_id, created_at) values ($1, $2, $3) returning id`,
      [name, owner, createdAt],
    );
    await client.query(
      `insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'admin')`,
      [id, owner],
    );
    return id;
  };
  W.a1 = await ws("Alice's Workspace", U.alice, "2025-01-01T00:00:00Z");
  W.a2 = await ws("Side project", U.alice, "2025-06-01T00:00:00Z");
  W.b = await ws("bob's Workspace", U.bob, "2025-02-01T00:00:00Z");
  W.m = await ws("Max's Workspace", U.max, "2025-03-01T00:00:00Z");
  W.d = await ws("My Workspace", U.dora, "2025-04-01T00:00:00Z");

  const profile = async (workspace: string, owner: string, name: string, sort: number) => {
    const { id } = await one<{ id: string }>(
      `insert into profiles (user_id, workspace_id, name, sort_order) values ($1, $2, $3, $4) returning id`,
      [owner, workspace, name, sort],
    );
    return id;
  };
  P.a1Personal = await profile(W.a1, U.alice, "Personal", 0);
  P.a1Business = await profile(W.a1, U.alice, "Business", 1);
  P.a2Personal = await profile(W.a2, U.alice, "Personal", 0);
  P.b = await profile(W.b, U.bob, "Personal", 0);
  P.m = await profile(W.m, U.max, "Personal", 0);
  P.d = await profile(W.d, U.dora, "Personal", 0);

  await client.query(
    `insert into workspace_members (workspace_id, user_id, role) values
       ($1, $2, 'viewer'), ($1, $3, 'editor'), ($1, $4, 'admin'), ($5, $3, 'viewer')`,
    [W.a1, U.vic, U.ed, U.meg, W.a2],
  );
  await client.query(
    `insert into profile_access (profile_id, user_id, role) values
       ($1, $2, 'editor'), ($3, $4, 'editor')`,
    // A member's grant raising them on one profile, and a non-member's grant.
    [P.a1Business, U.vic, P.a1Personal, U.gus],
  );

  await client.query(
    `insert into workspace_invites (workspace_id, email, role, profile_id, invited_by, token) values
       ($1, 'wide-viewer@example.com', 'viewer', null, $2, 'tok-wide-viewer'),
       ($1, 'wide-admin@example.com', 'admin', null, $2, 'tok-wide-admin'),
       ($1, 'one-profile@example.com', 'editor', $3, $2, 'tok-one-profile'),
       ($4, 'wide-editor@example.com', 'editor', null, $2, 'tok-wide-editor')`,
    [W.a1, U.alice, P.a1Business, W.a2],
  );

  await client.query(
    `insert into ai_usage_log (user_id, workspace_id, kind) values
       ($1, $2, 'transaction_parse'),
       ($1, $2, 'transaction_parse'),
       ($3, $4, 'voice_transcribe'),
       ($1, $5, 'transaction_parse')`,
    [U.alice, W.a1, U.ed, W.a2, DELETED_WORKSPACE],
  );
}

/** The role every (user, profile) pair has under the pre-0034 rule. */
async function snapshotOldRoles(): Promise<void> {
  const users = Object.values(U);
  const profiles = await rows<{ id: string; workspace_id: string }>(
    `select id, workspace_id from profiles`,
  );
  for (const user of users) {
    for (const p of profiles) {
      const { member, grant } = await one<{ member: WorkspaceRole | null; grant: WorkspaceRole | null }>(
        `select
           (select role::text from workspace_members where workspace_id = $1 and user_id = $2) as member,
           (select role::text from profile_access where profile_id = $3 and user_id = $2) as grant`,
        [p.workspace_id, user, p.id],
      );
      oldRoles.set(key(user, p.id), maxRole(member, grant));
    }
  }
}

beforeAll(async () => {
  client = new PGlite();
  await client.exec(
    `CREATE SCHEMA IF NOT EXISTS neon_auth;
     CREATE TABLE IF NOT EXISTS neon_auth."user" ("id" uuid PRIMARY KEY, "name" text, "email" text);`,
  );
  db = drizzle(client, { schema });
  partialDir = migrationsUpTo(LAST_PRE_PRICING_IDX);
  await migrate(db, { migrationsFolder: partialDir });

  // Sanity: the database really is pre-pricing.
  const tables = await rows<{ t: string }>(
    `select table_name as t from information_schema.tables
      where table_schema = 'public' and table_name in ('organizations', 'spaces')`,
  );
  expect(tables).toEqual([]);

  await insertFixture();
  await snapshotOldRoles();

  // Now the real thing: the whole folder, picking up at 0034.
  await migrate(db, { migrationsFolder: MIGRATIONS });
}, 60_000);

afterAll(async () => {
  await client?.close();
  if (partialDir) fs.rmSync(partialDir, { recursive: true, force: true });
});

// ── Assertions ─────────────────────────────────────────────────────────────

describe("0034 backfill — organisations", () => {
  it("creates exactly one personal organisation per workspace owner", async () => {
    const orgs = await rows<{ owner_id: string; kind: string }>(
      `select owner_id, kind::text as kind from organizations order by owner_id`,
    );
    expect(orgs.map((o) => o.owner_id).sort()).toEqual(
      [U.alice, U.bob, U.max, U.dora].sort(),
    );
    expect(orgs.every((o) => o.kind === "personal")).toBe(true);
    // Members, grantees and people with no workspace don't get one.
    for (const u of [U.vic, U.ed, U.meg, U.gus, U.nob]) {
      expect(orgs.some((o) => o.owner_id === u)).toBe(false);
    }
  });

  it("names it \"<name>'s organisation\", from the name or else the email's local part", async () => {
    const name = async (owner: string) =>
      (await one<{ name: string }>(`select name from organizations where owner_id = $1`, [owner]))
        .name;
    expect(await name(U.alice)).toBe("Alice's organisation");
    expect(await name(U.bob)).toBe("bob's organisation");
    // An owner with no users row at all.
    expect(await name(U.dora)).toBe("My organisation");
  });

  it("shortens a long name to fit the 40-character column, the same way the app does", async () => {
    const { name } = await one<{ name: string }>(
      `select name from organizations where owner_id = $1`,
      [U.max],
    );
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name.endsWith("'s organisation")).toBe(true);
    expect(LONG_NAME.startsWith(name.slice(0, -"'s organisation".length))).toBe(true);
    // Bootstrap names a new user's organisation with the same rule.
    expect(name).toBe(defaultOrganizationName(LONG_NAME));
  });
});

describe("0034 backfill — workspaces", () => {
  it("puts every workspace in its owner's organisation, on Free", async () => {
    const all = await rows<{
      id: string;
      owner_id: string;
      organization_id: string | null;
      plan: string;
      org_owner: string;
    }>(
      `select w.id, w.owner_id, w.organization_id, w.plan::text as plan,
              o.owner_id as org_owner
         from workspaces w join organizations o on o.id = w.organization_id`,
    );
    expect(all).toHaveLength(5);
    for (const w of all) {
      expect(w.organization_id).not.toBeNull();
      expect(w.org_owner).toBe(w.owner_id);
      expect(w.plan).toBe("free");
    }
    // Alice's two workspaces share her one organisation.
    const a = all.filter((w) => w.owner_id === U.alice);
    expect(new Set(a.map((w) => w.organization_id)).size).toBe(1);
  });

  it("leaves no `grandfathered` column behind (0037 drops it)", async () => {
    const cols = await rows<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'workspaces'`,
    );
    expect(cols.map((c) => c.column_name)).toContain("plan");
    expect(cols.map((c) => c.column_name)).not.toContain("grandfathered");
  });

  it("makes an owner's second free workspace view-only straight away — there's no grace period", async () => {
    const ro = async (workspaceId: string) =>
      (
        await db
          .select({ readOnly: readOnlyWorkspaceSql(workspaceId) })
          .from(schema.workspaces)
          .where(eq(schema.workspaces.id, workspaceId))
      )[0]!.readOnly;
    // Alice's oldest free workspace stays writable; the newer one is view-only.
    expect(await ro(W.a1)).toBe(false);
    expect(await ro(W.a2)).toBe(true);
    // Owners with a single free workspace are unaffected.
    expect(await ro(W.b)).toBe(false);
  });

  it("creates exactly one \"Main\" space per workspace, holding every one of its profiles", async () => {
    const spaces = await rows<{ id: string; workspace_id: string; name: string; position: number }>(
      `select id, workspace_id, name, position from spaces`,
    );
    expect(spaces).toHaveLength(5);
    expect(new Set(spaces.map((s) => s.workspace_id))).toEqual(new Set(Object.values(W)));
    for (const s of spaces) {
      expect(s.name).toBe("Main");
      expect(s.position).toBe(0);
    }
    const profiles = await rows<{ id: string; workspace_id: string; space_id: string }>(
      `select id, workspace_id, space_id from profiles`,
    );
    expect(profiles).toHaveLength(6);
    for (const p of profiles) {
      const main = spaces.find((s) => s.workspace_id === p.workspace_id)!;
      expect(p.space_id).toBe(main.id);
    }
  });
});

describe("0034 backfill — space members and invites", () => {
  const mainOf = async (workspaceId: string) =>
    (await one<{ id: string }>(`select id from spaces where workspace_id = $1`, [workspaceId])).id;

  it("adds every non-admin member to Main at their old role, and no admin", async () => {
    const members = await rows<{ space_id: string; user_id: string; role: string }>(
      `select space_id, user_id, role::text as role from space_members order by user_id, space_id`,
    );
    const a1 = await mainOf(W.a1);
    const a2 = await mainOf(W.a2);
    expect(members).toHaveLength(3);
    expect(members).toEqual(
      expect.arrayContaining([
        { space_id: a1, user_id: U.vic, role: "viewer" },
        { space_id: a1, user_id: U.ed, role: "editor" },
        { space_id: a2, user_id: U.ed, role: "viewer" },
      ]),
    );
    // Admins (owners and meg) see every space without a row.
    for (const admin of [U.alice, U.bob, U.max, U.dora, U.meg]) {
      expect(members.some((m) => m.user_id === admin)).toBe(false);
    }
    // A grant-only person isn't a member of anything.
    expect(members.some((m) => m.user_id === U.gus)).toBe(false);
  });

  it("points workspace-wide invites below admin at Main, and leaves admin / per-profile ones null", async () => {
    const invites = await rows<{ email: string; space_ids: string[] | null }>(
      `select email, space_ids from workspace_invites`,
    );
    const byEmail = Object.fromEntries(invites.map((i) => [i.email, i.space_ids]));
    expect(byEmail["wide-viewer@example.com"]).toEqual([await mainOf(W.a1)]);
    // Each invite gets *its own* workspace's Main.
    expect(byEmail["wide-editor@example.com"]).toEqual([await mainOf(W.a2)]);
    expect(byEmail["wide-admin@example.com"]).toBeNull();
    expect(byEmail["one-profile@example.com"]).toBeNull();
    // The join-link tokens are untouched.
    expect(
      (await rows<{ token: string }>(`select token from workspace_invites order by token`)).map(
        (r) => r.token,
      ),
    ).toEqual(["tok-one-profile", "tok-wide-admin", "tok-wide-editor", "tok-wide-viewer"]);
  });

  it("creates no per-profile overrides", async () => {
    expect(await rows(`select 1 from profile_overrides`)).toEqual([]);
  });
});

describe("0036 backfill — AI usage", () => {
  it("stamps each row with its workspace's owner and plan, and charges it 0 actions — the allowance starts full", async () => {
    const log = await rows<{
      workspace_id: string;
      owner_id: string | null;
      plan: string | null;
      units: number;
    }>(`select workspace_id, owner_id, plan::text as plan, units from ai_usage_log`);
    expect(log).toHaveLength(4);
    for (const row of log.filter((r) => r.workspace_id !== DELETED_WORKSPACE)) {
      expect(row.owner_id).toBe(U.alice);
      expect(row.plan).toBe("free");
      expect(row.units).toBe(0);
    }
  });

  it("leaves a deleted workspace's rows unstamped (nothing left to read the owner from)", async () => {
    const orphan = await one<{ owner_id: string | null; plan: string | null; units: number }>(
      `select owner_id, plan::text as plan, units from ai_usage_log where workspace_id = $1`,
      [DELETED_WORKSPACE],
    );
    expect(orphan).toEqual({ owner_id: null, plan: null, units: 0 });
  });
});

describe("the backfill changes nobody's access", () => {
  it("gives every (user, profile) pair the same role it had before (resolveProfileRole)", async () => {
    const profiles = await rows<{ id: string; workspace_id: string; space_id: string }>(
      `select id, workspace_id, space_id from profiles`,
    );
    let pairs = 0;
    for (const user of Object.values(U)) {
      for (const p of profiles) {
        const inputs = await one<{
          workspaceRole: WorkspaceRole | null;
          override: ProfileAccessLevel | null;
          spaceRole: SpaceRole | null;
          grantRole: WorkspaceRole | null;
        }>(
          `select
             (select role::text from workspace_members where workspace_id = $1 and user_id = $2) as "workspaceRole",
             (select access::text from profile_overrides where profile_id = $3 and user_id = $2) as "override",
             (select role::text from space_members where space_id = $4 and user_id = $2) as "spaceRole",
             (select role::text from profile_access where profile_id = $3 and user_id = $2) as "grantRole"`,
          [p.workspace_id, user, p.id, p.space_id],
        );
        const before = oldRoles.get(key(user, p.id));
        expect(before, `missing pre-migration role for ${user} on ${p.id}`).not.toBeUndefined();
        expect(resolveProfileRole(inputs), `role of ${user} on ${p.id}`).toBe(before);
        pairs++;
      }
    }
    expect(pairs).toBe(Object.keys(U).length * 6);
  });

  it("the fixture really exercises every kind of access", () => {
    const got = (u: string, p: string) => oldRoles.get(key(u, p));
    expect(got(U.alice, P.a1Personal)).toBe("admin"); // owner
    expect(got(U.meg, P.a1Business)).toBe("admin"); // admin member
    expect(got(U.ed, P.a1Personal)).toBe("editor"); // editor member
    expect(got(U.ed, P.a2Personal)).toBe("viewer"); // viewer member elsewhere
    expect(got(U.vic, P.a1Personal)).toBe("viewer"); // viewer member
    expect(got(U.vic, P.a1Business)).toBe("editor"); // viewer raised by a grant
    expect(got(U.gus, P.a1Personal)).toBe("editor"); // grant only
    expect(got(U.gus, P.a1Business)).toBeNull(); // …and only that profile
    expect(got(U.nob, P.a1Personal)).toBeNull(); // nobody
    expect(got(U.alice, P.b)).toBeNull(); // another owner's workspace
  });
});
