import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { users, userSettings } from "@/db/schema";
import { saveAboutYou } from "@/actions/settings";
import { normalizeUiPrefs } from "@/lib/validation";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser } from "./helpers/seed";

const rowOf = async (alias: string) => {
  const [user] = await getTestDb()
    .select({ about: users.about, acquisition: users.acquisition })
    .from(users)
    .where(eq(users.id, uid(alias)));
  const [settings] = await getTestDb()
    .select({ uiPrefs: userSettings.uiPrefs })
    .from(userSettings)
    .where(eq(userSettings.userId, uid(alias)));
  return { ...user, aboutDone: normalizeUiPrefs(settings?.uiPrefs).onboarding.aboutDone };
};

describe("saveAboutYou (the optional welcome questions)", () => {
  it("stores the answers, tidied, and never asks again", async () => {
    signInAs("ay1");
    await bootstrapUser("ay1");
    expect((await rowOf("ay1")).aboutDone).toBe(false);

    const res = await saveAboutYou({
      status: "answered",
      answers: {
        useFor: "business",
        teamSize: "2-10",
        goals: ["invoices", "invoices", "track"],
        describes: "freelancer",
      },
    });
    expect(res.ok).toBe(true);
    const row = await rowOf("ay1");
    expect(row.about).toMatchObject({
      status: "answered",
      useFor: "business",
      teamSize: "2-10",
      goals: ["invoices", "track"],
      describes: "freelancer",
    });
    expect(row.about?.at).toBeTruthy();
    expect(row.aboutDone).toBe(true);
  });

  it("records a skip, keeping whatever was answered before it", async () => {
    signInAs("ay2");
    await bootstrapUser("ay2");
    expect((await saveAboutYou({ status: "skipped", answers: { useFor: "personal" } })).ok).toBe(true);
    const row = await rowOf("ay2");
    expect(row.about).toMatchObject({ status: "skipped", useFor: "personal" });
    expect(row.aboutDone).toBe(true);
  });

  it("keeps the first answers when a second tab finishes later", async () => {
    signInAs("ay3");
    await bootstrapUser("ay3");
    await saveAboutYou({ status: "answered", answers: { useFor: "personal" } });
    await saveAboutYou({ status: "answered", answers: { useFor: "business" } });
    expect((await rowOf("ay3")).about).toMatchObject({ useFor: "personal" });
  });

  it("puts 'how did you hear about us' where the growth report reads it", async () => {
    signInAs("ay4");
    await bootstrapUser("ay4");
    await getTestDb().update(users).set({ acquisition: { source: "reddit", landing: "/" } }).where(eq(users.id, uid("ay4")));
    await saveAboutYou({ status: "answered", answers: {}, heardFrom: "other", heardFromOther: " a podcast " });
    const row = await rowOf("ay4");
    expect(row.acquisition).toMatchObject({
      source: "reddit",
      heardFrom: "other",
      heardFromOther: "a podcast",
    });
    expect(row.about).not.toHaveProperty("heardFrom");
  });

  it("refuses anything off the lists, and stores nothing", async () => {
    signInAs("ay5");
    await bootstrapUser("ay5");
    expect((await saveAboutYou({ status: "answered", answers: { useFor: "hobby" } })).ok).toBe(false);
    expect((await saveAboutYou({ status: "answered", answers: { name: "Ada" } })).ok).toBe(false);
    expect((await saveAboutYou({ status: "maybe", answers: {} })).ok).toBe(false);
    const row = await rowOf("ay5");
    expect(row.about).toBeNull();
    expect(row.aboutDone).toBe(false);
  });

  it("only ever writes the caller's own row", async () => {
    signInAs("ay6");
    await bootstrapUser("ay6");
    signInAs("ay7");
    await bootstrapUser("ay7");
    await saveAboutYou({ status: "answered", answers: { useFor: "both" } });
    const other = await rowOf("ay6");
    expect(other.about).toBeNull();
    expect(other.aboutDone).toBe(false);
  });
});
