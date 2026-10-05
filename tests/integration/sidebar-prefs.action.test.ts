import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { userSettings } from "@/db/schema";
import { setCollapsedSpaces, updateComposerDensity } from "@/actions/settings";
import { normalizeUiPrefs } from "@/lib/validation";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser } from "./helpers/seed";

/**
 * The sidebar's folded spaces live in `ui_prefs.sidebar.collapsedSpaces` and
 * are written by a nested jsonb merge — so saving them must leave every other
 * namespace (and any sidebar key this build doesn't know) alone.
 */

const A = "0198f6a2-0000-7000-8000-00000000000a";
const B = "0198f6a2-0000-7000-8000-00000000000b";

async function prefsOf(alias: string) {
  const [row] = await getTestDb()
    .select({ uiPrefs: userSettings.uiPrefs })
    .from(userSettings)
    .where(eq(userSettings.userId, uid(alias)));
  return row?.uiPrefs as unknown;
}

describe("setCollapsedSpaces", () => {
  it("saves the list without touching the other namespaces", async () => {
    signInAs("sb1");
    await bootstrapUser("sb1");
    expect((await updateComposerDensity("compact")).ok).toBe(true);
    expect((await setCollapsedSpaces([B, A])).ok).toBe(true);
    expect(await prefsOf("sb1")).toEqual({
      composer: { density: "compact" },
      sidebar: { collapsedSpaces: [B, A] },
    });
  });

  it("replaces the list on the next save and dedupes it", async () => {
    signInAs("sb2");
    await bootstrapUser("sb2");
    expect((await setCollapsedSpaces([A])).ok).toBe(true);
    expect((await setCollapsedSpaces([B, B, A])).ok).toBe(true);
    expect(normalizeUiPrefs(await prefsOf("sb2")).sidebar.collapsedSpaces).toEqual([B, A]);
    expect((await setCollapsedSpaces([])).ok).toBe(true);
    expect(normalizeUiPrefs(await prefsOf("sb2")).sidebar.collapsedSpaces).toEqual([]);
  });

  it("keeps a sidebar key it doesn't know about", async () => {
    signInAs("sb3");
    await bootstrapUser("sb3");
    await getTestDb()
      .update(userSettings)
      .set({ uiPrefs: { sidebar: { futureKey: true } } as never })
      .where(eq(userSettings.userId, uid("sb3")));
    expect((await setCollapsedSpaces([A])).ok).toBe(true);
    expect(await prefsOf("sb3")).toEqual({ sidebar: { futureKey: true, collapsedSpaces: [A] } });
  });

  it("rejects ids that aren't uuids", async () => {
    signInAs("sb4");
    await bootstrapUser("sb4");
    const res = await setCollapsedSpaces(["not-a-uuid"]);
    expect(res.ok).toBe(false);
    expect(await prefsOf("sb4")).toEqual({});
  });
});
