import { describe, it, expect, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { profileAccess, userSettings, users, workspaceInvites, workspaceMembers } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { openWorkspacePath } from "@/lib/invite-links";
import { siteConfig } from "@/lib/site";
import { sendWelcomeEmailOnce } from "@/lib/welcome-email";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, registerUser, workspaceIdOf } from "./helpers/seed";

const db = () => getTestDb();
const sent = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]);

/** The rows behind one invited address, and the token they share. */
async function inviteRows(email: string) {
  return db().select().from(workspaceInvites).where(eq(workspaceInvites.email, email));
}

async function currentWorkspaceOf(alias: string) {
  const [row] = await db()
    .select({ id: userSettings.lastWorkspaceId })
    .from(userSettings)
    .where(eq(userSettings.userId, uid(alias)));
  return row?.id ?? null;
}

/* ------------------------------------------------------------------------- */

describe("welcome email", () => {
  it("is queued once, on the bootstrap that creates the account's workspace", async () => {
    await bootstrapUser("w1");
    expect(sent()).toHaveLength(1);
    const mail = sent()[0]!;
    expect(mail.to).toBe("w1@example.com");
    expect(mail.subject).toBe(`Welcome to ${siteConfig.name}, w1`);
    expect(mail.replyTo).toBe(siteConfig.supportEmail);
    expect(mail.html).toContain(`${siteConfig.url}/app`);
    expect(mail.text).toContain(`${siteConfig.url}/app`);

    // Every later bootstrap is silent, and the claim is recorded.
    await ensureBootstrap(uid("w1"));
    await ensureBootstrap(uid("w1"));
    expect(sent()).toHaveLength(1);
    const [row] = await db().select({ at: users.welcomedAt }).from(users).where(eq(users.id, uid("w1")));
    expect(row!.at).toBeInstanceOf(Date);
  });

  it("is claimed by exactly one of several concurrent first requests", async () => {
    await registerUser("race");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => sendWelcomeEmailOnce(uid("race"))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(sent()).toHaveLength(1);
  });

  it("is never sent to an account without an email address", async () => {
    await db()
      .insert(users)
      .values({ id: uid("noml"), firebaseUid: "fb-noml", email: null, name: "Nobody" });
    await ensureBootstrap(uid("noml"));
    expect(sent()).toHaveLength(0);
    expect(await sendWelcomeEmailOnce(uid("noml"))).toBe(false);
    const [row] = await db().select({ at: users.welcomedAt }).from(users).where(eq(users.id, uid("noml")));
    expect(row!.at).toBeNull(); // still unclaimed — sends once an address arrives
  });

  it("does nothing for a user id with no account row", async () => {
    await ensureBootstrap(uid("ghost"));
    expect(sent()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------- */

describe("invite join links", () => {
  async function setup() {
    signInAs("a");
    await bootstrapUser("a");
    vi.mocked(sendEmail).mockClear(); // drop a's welcome email from the tally
    return workspaceIdOf("a");
  }

  it("stamps one shared token on the invite rows and emails a join link to a new person", async () => {
    const W = await setup();
    const p1 = await firstProfileId("a");
    const res = await ws.addMember(uid("a"), W, {
      email: "new@example.com",
      access: { mode: "profiles", entries: [{ profileId: p1, role: "editor" }] },
    });
    expect(res.status).toBe("invited");

    const rows = await inviteRows("new@example.com");
    expect(rows).toHaveLength(1);
    const token = rows[0]!.token!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    expect(sent()).toHaveLength(1);
    const mail = sent()[0]!;
    expect(mail.to).toBe("new@example.com");
    expect(mail.subject).toBe(`a invited you to a's Workspace on ${siteConfig.name}`);
    expect(mail.html).toContain(`${siteConfig.url}/invite/${token}`);
    expect(mail.text).toContain(`${siteConfig.url}/invite/${token}`);
    expect(mail.text).toContain("“Personal” profile in “a's Workspace” as editor");
  });

  it("sends an existing account an open-workspace link instead", async () => {
    const W = await setup();
    await bootstrapUser("b");
    vi.mocked(sendEmail).mockClear();
    const res = await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "all", role: "viewer" },
    });
    expect(res.status).toBe("added");
    const mail = sent()[0]!;
    expect(mail.subject).toBe(`You now have access to a's Workspace on ${siteConfig.name}`);
    expect(mail.html).toContain(`${siteConfig.url}${openWorkspacePath(W)}`);
    expect(await inviteRows("b@example.com")).toHaveLength(0);
  });

  it("previews an invite from its token, and null for anything else", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "c@example.com", access: { mode: "all", role: "editor" } });
    const [{ token }] = await inviteRows("c@example.com");

    const preview = await ws.getInviteByToken(token);
    expect(preview).toEqual({
      workspaceId: W,
      workspaceName: "a's Workspace",
      workspaceIcon: "🏢",
      email: "c@example.com",
      inviterName: "a",
      scope: { kind: "all", role: "editor" },
    });

    expect(await ws.getInviteByToken("nope")).toBeNull(); // fails the schema
    expect(await ws.getInviteByToken("A".repeat(32))).toBeNull(); // well-formed, unknown
    expect(await ws.getInviteByToken(42)).toBeNull();
  });

  it("previews a multi-profile invite with every profile and its role", async () => {
    const W = await setup();
    const p1 = await firstProfileId("a");
    await ws.addMember(uid("a"), W, {
      email: "d@example.com",
      access: { mode: "profiles", entries: [{ profileId: p1, role: "viewer" }] },
    });
    const [{ token }] = await inviteRows("d@example.com");
    const preview = await ws.getInviteByToken(token);
    expect(preview?.scope).toEqual({ kind: "profiles", entries: [{ name: "Personal", role: "viewer" }] });
  });

  it("keeps the token when an admin re-scopes the invite, so the emailed link survives", async () => {
    const W = await setup();
    const p1 = await firstProfileId("a");
    await ws.addMember(uid("a"), W, { email: "e@example.com", access: { mode: "all", role: "viewer" } });
    const [{ token: before }] = await inviteRows("e@example.com");

    await ws.setInviteAccess(uid("a"), W, {
      email: "e@example.com",
      access: { mode: "profiles", entries: [{ profileId: p1, role: "admin" }] },
    });
    const after = await inviteRows("e@example.com");
    expect(after).toHaveLength(1);
    expect(after[0]!.token).toBe(before);
    expect((await ws.getInviteByToken(before!))?.scope).toEqual({
      kind: "profiles",
      entries: [{ name: "Personal", role: "admin" }],
    });
  });

  it("is withdrawn along with the invite", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "f@example.com", access: { mode: "all", role: "viewer" } });
    const [{ token }] = await inviteRows("f@example.com");
    await ws.cancelInviteByEmail(uid("a"), W, "f@example.com");
    expect(await ws.getInviteByToken(token)).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */

describe("acceptInviteByToken", () => {
  async function inviteFromA(email: string, role: "viewer" | "editor" | "admin" = "editor") {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await ws.addMember(uid("a"), W, { email, access: { mode: "all", role } });
    const [{ token }] = await inviteRows(email);
    return { W, token: token! };
  }

  it("lets a brand-new account join: bootstraps it, converts the invite, and lands it on the workspace", async () => {
    const { W, token } = await inviteFromA("g@example.com");
    await registerUser("g"); // the users row a real sign-in creates; no bootstrap yet
    const g = { id: uid("g"), email: "g@example.com", name: "g" };

    const res = await ws.acceptInviteByToken(g, token);
    expect(res).toEqual({ workspaceId: W });

    const [member] = await db()
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, uid("g")), eq(workspaceMembers.workspaceId, W)));
    expect(member?.role).toBe("editor");
    expect(await inviteRows("g@example.com")).toHaveLength(0);
    // Their own default workspace exists (bootstrap ran)…
    expect(await workspaceIdOf("g")).toBeTruthy();
    // …but the invited one is what /app opens.
    expect(await currentWorkspaceOf("g")).toBe(W);
    // And, being a first bootstrap, the welcome email went out too.
    expect(sent().some((m) => m.to === "g@example.com" && /^Welcome/.test(m.subject))).toBe(true);
  });

  it("converts profile-scoped rows into grants", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    const p1 = await firstProfileId("a");
    await ws.addMember(uid("a"), W, {
      email: "i@example.com",
      access: { mode: "profiles", entries: [{ profileId: p1, role: "viewer" }] },
    });
    const [{ token }] = await inviteRows("i@example.com");
    await registerUser("i");
    await ws.acceptInviteByToken({ id: uid("i"), email: "i@example.com", name: "i" }, token!);
    const grants = await db().select().from(profileAccess).where(eq(profileAccess.userId, uid("i")));
    expect(grants).toEqual([expect.objectContaining({ profileId: p1, role: "viewer" })]);
    expect(await currentWorkspaceOf("i")).toBe(W);
  });

  it("refuses a different signed-in account and leaves the invite intact", async () => {
    const { token } = await inviteFromA("j@example.com");
    await bootstrapUser("k");
    await expect(
      ws.acceptInviteByToken({ id: uid("k"), email: "k@example.com", name: "k" }, token),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ws.acceptInviteByToken({ id: uid("k"), email: null, name: "k" }, token),
    ).rejects.toMatchObject({ status: 403 });
    expect(await inviteRows("j@example.com")).toHaveLength(1);
    expect(await ws.listWorkspaces(uid("k"))).toHaveLength(1);
  });

  it("matches the invited address case-insensitively", async () => {
    const { W, token } = await inviteFromA("l@example.com");
    await registerUser("l");
    const res = await ws.acceptInviteByToken(
      { id: uid("l"), email: "  L@Example.com ", name: "l" },
      token,
    );
    expect(res.workspaceId).toBe(W);
  });

  it("rejects an unknown (404) or malformed (422) token, and a token that was already used", async () => {
    const { token } = await inviteFromA("m@example.com");
    await registerUser("m");
    const m = { id: uid("m"), email: "m@example.com", name: "m" };
    await expect(ws.acceptInviteByToken(m, "A".repeat(32))).rejects.toMatchObject({ status: 404 });
    await expect(ws.acceptInviteByToken(m, "bad token")).rejects.toMatchObject({ status: 422 });
    await ws.acceptInviteByToken(m, token);
    await expect(ws.acceptInviteByToken(m, token)).rejects.toMatchObject({ status: 404 });
  });

  it("still works after bootstrap already converted the invite by email", async () => {
    // The invitee visited /app first, so bootstrap accepted it; then they click
    // the link. The rows are gone, so the page says so — but nothing breaks.
    const { W, token } = await inviteFromA("n@example.com");
    await bootstrapUser("n");
    expect(await inviteRows("n@example.com")).toHaveLength(0);
    expect(await ws.getInviteByToken(token)).toBeNull();
    await expect(
      ws.acceptInviteByToken({ id: uid("n"), email: "n@example.com", name: "n" }, token),
    ).rejects.toMatchObject({ status: 404 });
    // …and the membership from bootstrap is there.
    expect((await ws.listWorkspaces(uid("n"))).some((w) => w.id === W)).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */

describe("openWorkspaceIfAccessible", () => {
  it("switches to a workspace the user can open and ignores one they can't", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    const own = await workspaceIdOf("b");

    await ws.openWorkspaceIfAccessible(uid("b"), W); // not a member yet
    expect(await currentWorkspaceOf("b")).toBe(own);

    await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "viewer" } });
    await ws.openWorkspaceIfAccessible(uid("b"), W);
    expect(await currentWorkspaceOf("b")).toBe(W);

    await ws.openWorkspaceIfAccessible(uid("b"), "not-a-uuid");
    expect(await currentWorkspaceOf("b")).toBe(W);
  });
});
