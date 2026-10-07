import { describe, it, expect, vi } from "vitest";

// Trashing a profile sweeps its stored objects; keep the edge mocked.
vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import {
  budgets,
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  workspaceMembers,
  type SpaceRole,
} from "@/db/schema";
import { POST as postBudget } from "@/app/api/v1/budgets/route";
import { suggestedBudgetTitle, utcMonthKey } from "@/lib/budgets";
import { settleDeferred } from "@/lib/defer";
import { sendEmail } from "@/lib/email";
import { ApiError } from "@/lib/errors";
import { checkBudgetAlerts } from "@/services/budget-alerts";
import { createBudget, listBudgets, updateBudget } from "@/services/budgets";
import { deleteProfile } from "@/services/profiles";
import { deleteSpace, moveProfileToSpace } from "@/services/spaces";
import { deleteTransaction } from "@/services/transactions";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  categoryId,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  registerUser,
  workspaceIdOf,
} from "./helpers/seed";
import { apiReq, jsonBody } from "./api/helpers";

/**
 * Space budgets (every live profile in a space, as the space is now) and every
 * budget's title and note.
 */

const db = () => getTestDb();
const MONTH = utcMonthKey();
const DAY1 = `${MONTH}-01`;

async function expectApiError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  if (code) expect((err as ApiError).code).toBe(code);
  return err as ApiError;
}

/**
 * Space "Home" (s1) holds Personal and Work; "Family" (s2) holds Kids.
 *  - `ed`  — editor of Home (every profile in it);
 *  - `hid` — editor of Home, but an override hides Work;
 *  - `ro`  — editor of Home, but only Read on Work;
 *  - `fam` — editor of Family only;
 *  - `vw`  — viewer of Home.
 */
async function build() {
  await bootstrapUser("adm");
  const W = await workspaceIdOf("adm");
  const s1 = await defaultSpaceIdOf(W);
  await db().update(spaces).set({ name: "Home" }).where(eq(spaces.id, s1));
  const personal = await firstProfileId("adm");
  const [s2] = await db().insert(spaces).values({ workspaceId: W, name: "Family", position: 1 }).returning();
  const add = async (name: string, spaceId: string, sortOrder: number) => {
    const [row] = await db()
      .insert(profiles)
      .values({ userId: uid("adm"), workspaceId: W, spaceId, name, sortOrder })
      .returning({ id: profiles.id });
    return row!.id;
  };
  const work = await add("Work", s1, 1);
  const kids = await add("Kids", s2!.id, 2);

  const people: [string, "editor" | "viewer", [string, SpaceRole][]][] = [
    ["ed", "editor", [[s1, "editor"]]],
    ["hid", "editor", [[s1, "editor"]]],
    ["ro", "editor", [[s1, "editor"]]],
    ["fam", "editor", [[s2!.id, "editor"]]],
    ["vw", "viewer", [[s1, "viewer"]]],
  ];
  for (const [alias, role, inSpaces] of people) {
    await registerUser(alias);
    await db().insert(workspaceMembers).values({ workspaceId: W, userId: uid(alias), role });
    for (const [spaceId, spaceRole] of inSpaces) {
      await db().insert(spaceMembers).values({ spaceId, userId: uid(alias), role: spaceRole });
    }
  }
  await db().insert(profileOverrides).values([
    { profileId: work, userId: uid("hid"), access: "none" },
    { profileId: work, userId: uid("ro"), access: "read" },
  ]);
  vi.mocked(sendEmail).mockClear(); // the welcome email
  return { W, s1, s2: s2!.id, personal, work, kids, groceries: await categoryId("adm", "Groceries", "expense") };
}

describe("space budgets — progress", () => {
  it("counts every live profile in the space, as the space is now", async () => {
    const f = await build();
    const { id } = await createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s1, amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 3000, occurredOn: DAY1, profileId: f.personal });
    const trashed = await insertTxn("adm", { type: "expense", amountMinor: 9999, occurredOn: DAY1, profileId: f.work });
    await insertTxn("adm", { type: "expense", amountMinor: 2000, occurredOn: DAY1, profileId: f.work });
    await insertTxn("adm", { type: "expense", amountMinor: 4000, occurredOn: DAY1, profileId: f.kids });
    await insertTxn("adm", { type: "income", amountMinor: 50000, occurredOn: DAY1, profileId: f.personal });
    await deleteTransaction(uid("adm"), f.W, trashed);
    const spent = async () => (await listBudgets(uid("adm"), f.W, MONTH)).find((b) => b.id === id)!.spentMinor;
    expect(await spent()).toBe(5000);

    // Kids moves into Home: its month comes with it.
    await moveProfileToSpace(uid("adm"), f.kids, { spaceId: f.s1 });
    expect(await spent()).toBe(9000);
    // Work goes to the trash: it no longer counts.
    await deleteProfile(uid("adm"), f.work, { transactions: "delete" });
    expect(await spent()).toBe(7000);
  });

  it("alerts like any other budget — the admins and a creator who manages the space", async () => {
    const f = await build();
    await createBudget(uid("ed"), f.W, { scope: "space", spaceId: f.s1, amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 8500, occurredOn: DAY1, profileId: f.work });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 1,
      emailed: 2,
    });
    await settleDeferred();
    const mail = vi.mocked(sendEmail).mock.calls.map(([m]) => m);
    expect(mail.map((m) => m.to).sort()).toEqual(["adm@example.com", "ed@example.com"]);
    expect(mail[0]!.subject).toBe(`85% of the ${monthLong()} budget used: Home space`);
    expect(mail[0]!.text).toContain("(Space · Home)");
  });
});

function monthLong(): string {
  const [y, m] = MONTH.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

describe("space budgets — who sees and who manages", () => {
  it("shows only to people who read every live profile in the space; admins always", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s1, amount: 100 });
    await createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s2, amount: 100 });
    const titles = async (alias: string) => (await listBudgets(uid(alias), f.W, MONTH)).map((b) => b.title);
    expect(await titles("adm")).toEqual(["Family space", "Home space"]);
    expect(await titles("ed")).toEqual(["Home space"]);
    expect(await titles("vw")).toEqual(["Home space"]);
    expect(await titles("ro")).toEqual(["Home space"]);
    // Missing one profile in the space (Work is hidden from `hid`): no budget.
    expect(await titles("hid")).toEqual([]);
    expect(await titles("fam")).toEqual(["Family space"]);
  });

  it("managing needs edit access to every live profile in the space", async () => {
    const f = await build();
    const ok = await createBudget(uid("ed"), f.W, { scope: "space", spaceId: f.s1, amount: 100 });
    expect((await listBudgets(uid("ed"), f.W, MONTH))[0]).toMatchObject({ id: ok.id, canManage: true });
    await db().delete(budgets).where(eq(budgets.id, ok.id));

    // Sees it but only reads Work: forbidden.
    await expectApiError(createBudget(uid("ro"), f.W, { scope: "space", spaceId: f.s1, amount: 1 }), 403, "forbidden");
    await expectApiError(createBudget(uid("vw"), f.W, { scope: "space", spaceId: f.s1, amount: 1 }), 403);
    // Can't see the space at all: it reads as invalid, like a stranger's.
    await expectApiError(createBudget(uid("fam"), f.W, { scope: "space", spaceId: f.s1, amount: 1 }), 422);
    await expectApiError(createBudget(uid("hid"), f.W, { scope: "space", spaceId: f.s1, amount: 1 }), 422);
    // Someone else's space.
    await bootstrapUser("str");
    const theirs = await defaultSpaceIdOf(await workspaceIdOf("str"));
    await expectApiError(createBudget(uid("adm"), f.W, { scope: "space", spaceId: theirs, amount: 1 }), 422);

    const { id } = await createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s1, amount: 100 });
    await expectApiError(updateBudget(uid("ro"), f.W, id, { amount: 5 }), 403);
    expect(await updateBudget(uid("hid"), f.W, id, { amount: 5 })).toBe(false);
    // One per space.
    const dup = await expectApiError(createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s1, amount: 1 }), 409);
    expect(dup.message).toMatch(/space already has a budget/);
  });

  it("is deleted with its space", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s2, amount: 100 });
    await deleteSpace(uid("adm"), f.s2, { moveProfilesTo: f.s1 });
    expect(await db().select().from(budgets).where(eq(budgets.workspaceId, f.W))).toEqual([]);
  });
});

describe("titles and notes", () => {
  it("a new budget gets the suggested title unless it brings its own; a blank note is no note", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await createBudget(uid("adm"), f.W, { scope: "space", spaceId: f.s1, amount: 100, description: "  " });
    await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.kids, amount: 100 });
    await createBudget(uid("adm"), f.W, {
      scope: "category",
      categoryId: f.groceries,
      amount: 100,
      title: "  Food  ",
      description: " Cook at home ",
    });
    const list = await listBudgets(uid("adm"), f.W, MONTH);
    expect(list.map((b) => [b.title, b.description, b.scopeText])).toEqual([
      ["All spending this month", null, "Whole workspace"],
      ["Home space", null, "Space · Home"],
      ["Kids this month", null, "Profile · Kids"],
      ["Food", "Cook at home", "Category · Groceries"],
    ]);
  });

  it("validates the title and the note, on create and on change", async () => {
    const f = await build();
    const tooLong = await expectApiError(
      createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1, title: "x".repeat(61) }),
      422,
    );
    expect(tooLong.message).toBe("Title is too long (max 60 characters)");
    const blank = await expectApiError(createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1, title: " " }), 422);
    expect(blank.message).toBe("Give the budget a title");
    await expectApiError(
      createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1, description: "x".repeat(141) }),
      422,
    );

    const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1, description: "Rent first" });
    expect(await updateBudget(uid("adm"), f.W, id, { title: "Monthly cap" })).toBe(true);
    await expectApiError(updateBudget(uid("adm"), f.W, id, { title: "" }), 422);
    const [row] = await db().select().from(budgets).where(eq(budgets.id, id));
    expect(row).toMatchObject({ title: "Monthly cap", description: "Rent first" });
    // null or blank clears the note; leaving it out keeps it.
    await updateBudget(uid("adm"), f.W, id, { amount: 2 });
    expect((await db().select().from(budgets).where(eq(budgets.id, id)))[0]!.description).toBe("Rent first");
    await updateBudget(uid("adm"), f.W, id, { description: null });
    expect((await db().select().from(budgets).where(eq(budgets.id, id)))[0]!.description).toBeNull();
    await updateBudget(uid("adm"), f.W, id, { description: "Again" });
    await updateBudget(uid("adm"), f.W, id, { description: "" });
    expect((await db().select().from(budgets).where(eq(budgets.id, id)))[0]!.description).toBeNull();
  });

  it("the API takes a space, a title and a note, and answers with them", async () => {
    const f = await build();
    signInAs("adm");
    const res = await postBudget(
      apiReq("/api/v1/budgets", {
        method: "POST",
        body: jsonBody({ scope: "space", spaceId: f.s2, amount: 50, title: "Kids' stuff", description: "School too" }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({
      scope: "space",
      spaceId: f.s2,
      profileId: null,
      categoryId: null,
      title: "Kids' stuff",
      description: "School too",
      label: "Family",
      amountMinor: 5000,
    });
  });
});

describe("the budget_spaces migration's hand-written title back-fill", () => {
  /** The SQL after the marker, from whichever migration file carries it (renumbering-proof). */
  function backfillSql(): string {
    const dir = join(process.cwd(), "src/db/migrations");
    const marker = "-- ── Hand-written: back-fill budget titles";
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
      const text = readFileSync(join(dir, file), "utf8");
      const at = text.indexOf(marker);
      if (at >= 0) return text.slice(at);
    }
    throw new Error("No migration carries the title back-fill");
  }

  it("gives untitled budgets the suggested title and leaves titled ones alone", async () => {
    const f = await build();
    // Budgets as they were before titles: the column's empty default.
    const rows = await db()
      .insert(budgets)
      .values([
        { workspaceId: f.W, scope: "workspace", amountMinor: 1, createdBy: uid("adm") },
        { workspaceId: f.W, scope: "profile", profileId: f.kids, amountMinor: 1, createdBy: uid("adm") },
        { workspaceId: f.W, scope: "category", categoryId: f.groceries, amountMinor: 1, createdBy: uid("adm") },
        { workspaceId: f.W, scope: "profile", profileId: f.work, amountMinor: 1, createdBy: uid("adm"), title: "Kept" },
      ])
      .returning({ id: budgets.id });
    expect((await db().select().from(budgets)).filter((b) => b.title === "")).toHaveLength(3);

    await db().execute(sql.raw(backfillSql()));
    const byId = new Map((await db().select().from(budgets)).map((b) => [b.id, b.title]));
    expect(rows.map((r) => byId.get(r.id))).toEqual([
      suggestedBudgetTitle({ scope: "workspace" }),
      suggestedBudgetTitle({ scope: "profile", profileName: "Kids" }),
      suggestedBudgetTitle({ scope: "category", categoryName: "Groceries" }),
      "Kept",
    ]);
    // Running it again changes nothing.
    await db().execute(sql.raw(backfillSql()));
    expect(new Map((await db().select().from(budgets)).map((b) => [b.id, b.title]))).toEqual(byId);
  });
});
