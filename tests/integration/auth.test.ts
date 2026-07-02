import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { categories, profiles, userSettings } from "@/db/schema";
import {
  getCurrentUser,
  requireUser,
  ensureBootstrap,
  getUserSettings,
  getAppContext,
} from "@/lib/auth";
import { setSession, signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";

const count = async (table: typeof categories | typeof profiles, userId: string) => {
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
  it("seeds settings, 15 default categories, and a Personal profile", async () => {
    await ensureBootstrap(uid("u1"));
    expect(await count(categories, "u1")).toBe(15);
    expect(await count(profiles, "u1")).toBe(1);

    const [settings] = await getTestDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("u1")));
    expect(settings.currency).toBe("USD");

    const [profile] = await getTestDb()
      .select()
      .from(profiles)
      .where(eq(profiles.userId, uid("u1")));
    expect(profile.name).toBe("Personal");
  });

  it("is idempotent (no duplicates on a second call)", async () => {
    await ensureBootstrap(uid("u1"));
    await ensureBootstrap(uid("u1"));
    expect(await count(categories, "u1")).toBe(15);
    expect(await count(profiles, "u1")).toBe(1);
  });
});

describe("getUserSettings", () => {
  it("bootstraps settings on first read", async () => {
    const settings = await getUserSettings(uid("fresh"));
    expect(settings.userId).toBe(uid("fresh"));
    expect(settings.locale).toBe("en-US");
  });

  it("returns existing settings without re-seeding", async () => {
    await ensureBootstrap(uid("u1"));
    const settings = await getUserSettings(uid("u1"));
    expect(settings.theme).toBe("system");
    expect(await count(categories, "u1")).toBe(15); // unchanged
  });
});

describe("getAppContext", () => {
  it("resolves the user and their settings together", async () => {
    signInAs("u1");
    const ctx = await getAppContext();
    expect(ctx.user.id).toBe(uid("u1"));
    expect(ctx.settings.currency).toBe("USD");
  });
});
