import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { profileAccess, spaceMembers, spaces, workspaceInvites, workspaceMembers } from "@/db/schema";
import { inviteToSpace } from "@/services/spaces";
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
 * "Invite someone" in a space's Members & access dialog. The point of a
 * separate path from `addMember`: it only ever adds — a member invited from one
 * space keeps their other spaces and their workspace role.
 */

const db = () => getTestDb();

/** Admin `a` (Free plan) with spaces Main and B; `m` a viewer in Main only. */
async function setup() {
  await bootstrapUser("a");
  await registerUser("m");
  const W = await workspaceIdOf("a");
  const main = await defaultSpaceIdOf(W);
  const [b] = await db()
    .insert(spaces)
    .values({ workspaceId: W, name: "B", position: 1 })
    .returning({ id: spaces.id });
  await ws.addMember(uid("a"), W, {
    email: "m@example.com",
    access: { mode: "all", role: "viewer", spaceIds: [main] },
  });
  return { W, main, B: b!.id };
}

async function spaceRole(spaceId: string, alias: string) {
  const [row] = await db()
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, uid(alias))));
  return row?.role ?? null;
}

async function workspaceRole(W: string, alias: string) {
  const [row] = await db()
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, W), eq(workspaceMembers.userId, uid(alias))));
  return row?.role ?? null;
}

describe("inviteToSpace", () => {
  it("puts an existing member in the space and leaves their other spaces and workspace role alone", async () => {
    const { W, main, B } = await setup();
    const res = await inviteToSpace(uid("a"), B, { email: "M@Example.com", role: "editor" });
    expect(res.status).toBe("space");
    expect(await spaceRole(B, "m")).toBe("editor");
    expect(await spaceRole(main, "m")).toBe("viewer");
    expect(await workspaceRole(W, "m")).toBe("viewer");
  });

  it("never lowers someone already in the space", async () => {
    const { B } = await setup();
    await inviteToSpace(uid("a"), B, { email: "m@example.com", role: "editor" });
    const res = await inviteToSpace(uid("a"), B, { email: "m@example.com", role: "viewer" });
    expect(res.status).toBe("unchanged");
    expect(await spaceRole(B, "m")).toBe("editor");
  });

  it("adds a registered person who isn't in the workspace, with this space only", async () => {
    const { W, main, B } = await setup();
    await registerUser("n");
    const res = await inviteToSpace(uid("a"), B, { email: "n@example.com", role: "viewer" });
    expect(res.status).toBe("added");
    expect(await workspaceRole(W, "n")).toBe("viewer");
    expect(await spaceRole(B, "n")).toBe("viewer");
    expect(await spaceRole(main, "n")).toBeNull();
  });

  it("invites an address without an account into the workspace", async () => {
    const { W, B } = await setup();
    const res = await inviteToSpace(uid("a"), B, { email: "newcomer@example.com", role: "viewer" });
    expect(res.status).toBe("invited");
    const rows = await db()
      .select()
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, W), eq(workspaceInvites.email, "newcomer@example.com")));
    expect(rows).toHaveLength(1);
  });

  it("refuses a pending invite rather than re-scoping it", async () => {
    const { W, main, B } = await setup();
    await ws.addMember(uid("a"), W, {
      email: "newcomer@example.com",
      access: { mode: "all", role: "editor", spaceIds: [main] },
    });
    await expect(
      inviteToSpace(uid("a"), B, { email: "newcomer@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses someone on single-profile grants only, and leaves the grants alone", async () => {
    const { W, B } = await setup();
    await setWorkspacePlan(W, "plus");
    await registerUser("g");
    const personal = await firstProfileId("a");
    await ws.addMember(uid("a"), W, {
      email: "g@example.com",
      access: { mode: "profiles", entries: [{ profileId: personal, role: "editor" }] },
    });
    await expect(
      inviteToSpace(uid("a"), B, { email: "g@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 409 });
    const grants = await db().select().from(profileAccess).where(eq(profileAccess.userId, uid("g")));
    expect(grants).toHaveLength(1);
    expect(await spaceRole(B, "g")).toBeNull();
  });

  it("an add-only addMember refuses, under the invite lock, an invite that's already there", async () => {
    const { W, main, B } = await setup();
    const grant = (spaceId: string) => ({
      email: "newcomer@example.com",
      access: { mode: "all" as const, role: "viewer" as const, spaceIds: [spaceId] },
    });
    await ws.addMember(uid("a"), W, grant(main), { addOnly: true });
    await expect(ws.addMember(uid("a"), W, grant(B), { addOnly: true })).rejects.toMatchObject({
      status: 409,
    });
    const [invite] = await db()
      .select({ spaceIds: workspaceInvites.spaceIds })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, W), eq(workspaceInvites.email, "newcomer@example.com")));
    expect(invite?.spaceIds).toEqual([main]);
  });

  it("an add-only addMember refuses someone who already has access", async () => {
    const { W, B } = await setup();
    await expect(
      ws.addMember(
        uid("a"),
        W,
        { email: "m@example.com", access: { mode: "all", role: "viewer", spaceIds: [B] } },
        { addOnly: true },
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an admin, who already sees every space", async () => {
    const { B } = await setup();
    await expect(
      inviteToSpace(uid("a"), B, { email: "a@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("is for workspace admins only", async () => {
    const { B } = await setup();
    await expect(
      inviteToSpace(uid("m"), B, { email: "someone@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
