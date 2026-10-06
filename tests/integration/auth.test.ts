import { describe, it, expect } from "vitest";
import { asc, eq } from "drizzle-orm";
import { categories, profiles, tags, userSettings, workspaces } from "@/db/schema";
import {
  getCurrentUser,
  requireUser,
  ensureBootstrap,
  getUserSettings,
  getAppContext,
} from "@/lib/auth";
import { setSession, signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";

const count = async (
  table: typeof categories | typeof profiles | typeof tags,
  userId: string,
) => {
  const rows = await getTestDb()
    .select({ id: table.id })
    .from(table)
    .where(eq(table.userId, uid(userId)));
  return rows.length;
};

describe("getCurrentUser", () => {
  it("returns the signed-in user", async () => {
    signInAs("u1");
    expect(await getCurrentUser()).toEqual({
      id: uid("u1"),
      email: "u1@example.com",
      name: "u1",
    });
  });

  it("normalises missing email/name to null", async () => {
    setSession({ id: uid("u2"), email: null, name: null });
    expect(await getCurrentUser()).toEqual({ id: uid("u2"), email: null, name: null });
  });

  it("returns null when signed out", async () => {
    setSession(null);
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns the user when signed in", async () => {
    signInAs("u1");
    expect((await requireUser()).id).toBe(uid("u1"));
  });

  it("redirects to /sign-in when signed out", async () => {
    setSession(null);
    await expect(requireUser()).rejects.toMatchObject({ url: "/sign-in" });
  });
});

describe("ensureBootstrap", () => {
  it("seeds settings, 10 default categories, 2 default tags, and a Personal profile", async () => {
    await ensureBootstrap(uid("u1"));
    expect(await count(categories, "u1")).toBe(10);
    expect(await count(tags, "u1")).toBe(2);
    expect(await count(profiles, "u1")).toBe(1);

    const [settings] = await getTestDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("u1")));
    expect(settings.theme).toBe("system");

    // Currency + locale live on the workspace now (geo-detected; USD/en-US in tests).
    const [workspace] = await getTestDb()
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("u1")));
    expect(workspace.currency).toBe("USD");
    expect(workspace.locale).toBe("en-US");

    const [profile] = await getTestDb()
      .select()
      .from(profiles)
      .where(eq(profiles.userId, uid("u1")));
    expect(profile.name).toBe("Personal");
  });

  it("seeds exactly the default categories (7 expense + 3 income) and tags into the new workspace", async () => {
    await ensureBootstrap(uid("u1"));
    const [workspace] = await getTestDb()
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("u1")));

    const cats = await getTestDb()
      .select({ name: categories.name, kind: categories.kind })
      .from(categories)
      .where(eq(categories.workspaceId, workspace.id));
    expect(cats.map((c) => [c.kind, c.name]).sort()).toEqual([
      ["expense", "Bills & Utilities"],
      ["expense", "Food & Dining"],
      ["expense", "Groceries"],
      ["expense", "Health"],
      ["expense", "Housing"],
      ["expense", "Shopping"],
      ["expense", "Transport"],
      ["income", "Freelance"],
      ["income", "Investments"],
      ["income", "Salary"],
    ]);

    const seededTags = await getTestDb()
      .select({ name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.workspaceId, workspace.id))
      .orderBy(asc(tags.name));
    expect(seededTags).toEqual([
      { name: "Recurring", color: "#3b82f6" },
      { name: "Reimbursable", color: "#f59e0b" },
    ]);
  });

  it("is idempotent (no duplicates on a second call)", async () => {
    await ensureBootstrap(uid("u1"));
    await ensureBootstrap(uid("u1"));
    expect(await count(categories, "u1")).toBe(10);
    expect(await count(tags, "u1")).toBe(2);
    expect(await count(profiles, "u1")).toBe(1);
  });
});

describe("getUserSettings", () => {
  it("bootstraps settings on first read", async () => {
    const settings = await getUserSettings(uid("fresh"));
    expect(settings.userId).toBe(uid("fresh"));
    expect(settings.theme).toBe("system");
  });

  it("returns existing settings without re-seeding", async () => {
    await ensureBootstrap(uid("u1"));
    const settings = await getUserSettings(uid("u1"));
    expect(settings.theme).toBe("system");
    expect(await count(categories, "u1")).toBe(10); // unchanged
    expect(await count(tags, "u1")).toBe(2);
  });
});

describe("getAppContext", () => {
  it("resolves the user and their settings together", async () => {
    signInAs("u1");
    const ctx = await getAppContext();
    expect(ctx.user.id).toBe(uid("u1"));
    expect(ctx.workspace.currency).toBe("USD");
  });
});
