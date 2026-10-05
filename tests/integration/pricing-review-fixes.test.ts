import { describe, it, expect, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  aiUsageLog,
  profileAccess,
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { chargeVoiceTranscribe, withAiCharge } from "@/lib/ai-quota";
import { ensureBootstrap } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { canWriteInWorkspace, createWorkspaceWithDefaults, getEffectiveProfileRole } from "@/lib/workspaces";
import { setProfileOverride, setSpaceMember } from "@/services/spaces";
import * as ws from "@/services/workspaces";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";

/**
 * Regressions for what the code review of personal pricing phases 1–5 found.
 * Each block names the defect it pins down.
 */

const db = () => getTestDb();

describe("bootstrap race — parallel first requests", () => {
  it("creates one workspace however many first requests race, so none of them is a view-only extra", async () => {
    await registerUser("racer");
    await Promise.all([1, 2, 3, 4].map(() => ensureBootstrap(uid("racer"))));
    const owned = await db()
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("racer")));
    expect(owned).toHaveLength(1);
    expect(await canWriteInWorkspace(uid("racer"), owned[0]!.id)).toBe(true);
  });

  it("a parallel 'create workspace' can't sneak a second free one past the one-free-workspace rule", async () => {
    await bootstrapUser("c5");
    const attempts = await Promise.allSettled(
      [1, 2].map((n) =>
        createWorkspaceWithDefaults(uid("c5"), `Extra ${n}`, { requireNoFreeWorkspace: true }),
      ),
    );
    expect(attempts.every((a) => a.status === "rejected")).toBe(true);
    const owned = await db()
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("c5")));
    expect(owned).toHaveLength(1);
  });
});

/** Owner "a" on Plus with spaces Main (Personal) + B (Kids); member "m" in both as viewer. */
async function twoSpaces() {
  await bootstrapUser("a");
  await registerUser("m");
  const W = await workspaceIdOf("a");
  await setWorkspacePlan(W, "plus");
  const main = await defaultSpaceIdOf(W);
  const [b] = await db()
    .insert(spaces)
    .values({ workspaceId: W, name: "B", position: 1 })
    .returning({ id: spaces.id });
  const [kids] = await db()
    .insert(profiles)
    .values({ userId: uid("a"), workspaceId: W, spaceId: b!.id, name: "Kids", sortOrder: 1 })
    .returning({ id: profiles.id });
  await ws.setMemberAccess(uid("a"), W, {
    userId: uid("m"),
    access: { mode: "all", role: "viewer", spaceIds: [main, b!.id] },
  });
  return { W, main, B: b!.id, personal: await firstProfileId("a"), kids: kids!.id };
}

describe("leaving a space through the People list", () => {
  it("takes that space's overrides with it, as the space dialog does", async () => {
    const { W, main, kids } = await twoSpaces();
    await setProfileOverride(uid("a"), kids, { userId: uid("m"), access: "write" });
    expect((await getEffectiveProfileRole(uid("m"), kids))?.role).toBe("editor");

    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("m"),
      access: { mode: "all", role: "viewer", spaceIds: [main] },
    });
    expect(await getEffectiveProfileRole(uid("m"), kids)).toBeNull();
    const left = await db()
      .select()
      .from(profileOverrides)
      .where(eq(profileOverrides.userId, uid("m")));
    expect(left).toHaveLength(0);
  });

  it("keeps an override that opens a profile in a space they were never in", async () => {
    const { W, main, B, kids } = await twoSpaces();
    // Out of B, then a deliberate one-profile opening into it.
    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("m"),
      access: { mode: "all", role: "viewer", spaceIds: [main] },
    });
    await setProfileOverride(uid("a"), kids, { userId: uid("m"), access: "read" });
    // Re-scoping within the spaces they're in leaves it alone.
    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("m"),
      access: { mode: "all", role: "editor", spaceIds: [main] },
    });
    expect((await getEffectiveProfileRole(uid("m"), kids))?.role).toBe("viewer");
    const stillInB = await db()
      .select()
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, B), eq(spaceMembers.userId, uid("m"))));
    expect(stillInB).toHaveLength(0);
  });
});

describe("overrides after a downgrade to Free", () => {
  it("an existing override can be narrowed or cleared, never widened, and no new one can be made", async () => {
    const { W, personal, kids } = await twoSpaces();
    await setProfileOverride(uid("a"), kids, { userId: uid("m"), access: "write" });
    await setWorkspacePlan(W, "free");

    // Narrowing an existing one is allowed — the admin is never stuck with it.
    await setProfileOverride(uid("a"), kids, { userId: uid("m"), access: "none" });
    expect(await getEffectiveProfileRole(uid("m"), kids)).toBeNull();

    // Widening it back is the paid feature.
    await expect(
      setProfileOverride(uid("a"), kids, { userId: uid("m"), access: "write" }),
    ).rejects.toMatchObject({ code: "plan_limit" });

    // Clearing "none" would open the profile up again (space role viewer): refused.
    await expect(
      setProfileOverride(uid("a"), kids, { userId: uid("m"), access: null }),
    ).rejects.toMatchObject({ code: "plan_limit" });

    // A brand-new override — even "none" — is per-profile access, which Free lacks.
    await expect(
      setProfileOverride(uid("a"), personal, { userId: uid("m"), access: "none" }),
    ).rejects.toMatchObject({ code: "plan_limit" });
  });
});

describe("invites to some spaces", () => {
  it("name those spaces in the email instead of promising all profiles", async () => {
    const { W, B } = await twoSpaces();
    vi.mocked(sendEmail).mockClear();
    await ws.addMember(uid("a"), W, {
      email: "newcomer@example.com",
      access: { mode: "all", role: "viewer", spaceIds: [B] },
    });
    const mail = vi.mocked(sendEmail).mock.calls.at(-1)![0];
    expect(mail.text).toContain("B · viewer");
    expect(mail.text).not.toContain("all profiles");
  });
});

describe("second review round", () => {
  it("a clip the recorder stopped at exactly two minutes stays two actions when it measures a hair longer", async () => {
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "pro");
    const clip = await chargeVoiceTranscribe(uid("a"), W, { durationMs: 120_000 });
    await withAiCharge(clip, async (onUsage) => {
      onUsage({ inputTokens: 4000, outputTokens: 40, audioMs: 120_031 });
      return "two minutes of talking";
    });
    const [row] = await db().select({ units: aiUsageLog.units }).from(aiUsageLog).where(eq(aiUsageLog.id, clip.id));
    expect(row!.units).toBe(2);
  });

  it("a failed clip doesn't re-charge a properly paired parse because an older pair straddles the window", async () => {
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "pro");
    const ago = (ms: number) => new Date(Date.now() - ms);
    const row = (kind: string, units: number, createdAt: Date) => ({
      userId: uid("a"),
      workspaceId: W,
      kind,
      units,
      ownerId: uid("a"),
      plan: "pro" as const,
      createdAt,
    });
    await db().insert(aiUsageLog).values([
      row("voice_transcribe", 1, ago(15 * 60_000 + 10_000)), // T0, just outside the window
      row("transaction_parse_voice", 0, ago(15 * 60_000 - 10_000)), // P0, just inside
      row("voice_transcribe", 1, ago(61_000)), // T1
      row("transaction_parse_voice", 0, ago(60_000)), // P1
    ]);
    const t2 = await chargeVoiceTranscribe(uid("a"), W, { durationMs: 10_000 });
    await expect(
      withAiCharge(t2, async () => {
        throw new Error("provider down");
      }),
    ).rejects.toThrow();
    const ledger = await db()
      .select({ kind: aiUsageLog.kind, units: aiUsageLog.units })
      .from(aiUsageLog)
      .where(eq(aiUsageLog.userId, uid("a")))
      .orderBy(asc(aiUsageLog.createdAt));
    expect(ledger.map((r) => [r.kind, r.units])).toEqual([
      ["voice_transcribe", 1],
      ["transaction_parse_voice", 0],
      ["voice_transcribe", 1],
      ["transaction_parse_voice", 0],
      ["voice_transcribe_failed", 0],
    ]);
  });

  it("leaving a space keeps a 'none' override, so a legacy grant can't bring the hidden profile back", async () => {
    const { W, main, B, kids } = await twoSpaces();
    await db().insert(profileAccess).values({ profileId: kids, userId: uid("m"), role: "viewer" });
    await setProfileOverride(uid("a"), kids, { userId: uid("m"), access: "none" });
    expect(await getEffectiveProfileRole(uid("m"), kids)).toBeNull();

    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("m"),
      access: { mode: "all", role: "viewer", spaceIds: [main] },
    });
    expect(await getEffectiveProfileRole(uid("m"), kids)).toBeNull();
    await setSpaceMember(uid("a"), B, { userId: uid("m"), role: null });
    expect(await getEffectiveProfileRole(uid("m"), kids)).toBeNull();
  });

  it("a view-only workspace still lets an admin narrow access — lower a space role, demote a member", async () => {
    await bootstrapUser("o");
    await setWorkspacePlan(await workspaceIdOf("o"), "free");
    // A second, non-grandfathered free workspace is view-only.
    const extra = await createWorkspaceWithDefaults(uid("o"), "Extra");
    await registerUser("n");
    const space = await defaultSpaceIdOf(extra.id);
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId: extra.id, userId: uid("n"), role: "editor" });
    await db().insert(spaceMembers).values({ spaceId: space, userId: uid("n"), role: "editor" });

    await expect(setSpaceMember(uid("o"), space, { userId: uid("n"), role: "viewer" })).resolves.toBeUndefined();
    await expect(
      ws.updateMemberRole(uid("o"), extra.id, { userId: uid("n"), role: "viewer" }),
    ).resolves.toBeUndefined();
    // Widening is still refused.
    await expect(
      setSpaceMember(uid("o"), space, { userId: uid("n"), role: "editor" }),
    ).rejects.toMatchObject({ code: "plan_limit" });
  });
});

