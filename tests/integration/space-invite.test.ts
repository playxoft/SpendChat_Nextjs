import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { spaceMembers, spaces, workspaceInvites, workspaceMembers } from "@/db/schema";
import { inviteToSpace } from "@/services/spaces";
import * as ws from "@/services/workspaces";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, defaultSpaceIdOf, registerUser, workspaceIdOf } from "./helpers/seed";

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
