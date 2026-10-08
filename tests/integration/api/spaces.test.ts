import { describe, it, expect } from "vitest";
import { GET as listSpaces, POST as createSpace } from "@/app/api/v1/spaces/route";
import { PATCH as patchSpace, DELETE as deleteSpace } from "@/app/api/v1/spaces/[id]/route";
import { POST as reorderSpaces } from "@/app/api/v1/spaces/reorder/route";
import { GET as spaceAccess } from "@/app/api/v1/spaces/[id]/access/route";
import { PUT as setSpaceMember } from "@/app/api/v1/spaces/[id]/members/route";
import { GET as listProfiles, POST as createProfile } from "@/app/api/v1/profiles/route";
import { POST as moveToSpace } from "@/app/api/v1/profiles/[id]/space/route";
import {
  GET as listOverrides,
  PUT as setOverride,
} from "@/app/api/v1/profiles/[id]/overrides/route";
import * as ws from "@/services/workspaces";
import { setSession, signInAs, uid } from "../helpers/session";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  setWorkspacePlan,
  workspaceIdOf,
} from "../helpers/seed";
import { apiReq, ctx, jsonBody } from "./helpers";

type Space = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  profileCount: number;
  role: string | null;
};
type Profile = { id: string; name: string; spaceId: string; access: string };

async function json<T>(res: Response): Promise<{ status: number; body: T }> {
  return { status: res.status, body: (await res.json()) as T };
}

async function spaces(headers?: Record<string, string>): Promise<Space[]> {
  return (await json<{ data: Space[] }>(await listSpaces(apiReq("/api/v1/spaces", { headers }))))
    .body.data;
}

async function profiles(headers?: Record<string, string>): Promise<Profile[]> {
  return (
    await json<{ data: Profile[] }>(await listProfiles(apiReq("/api/v1/profiles", { headers })))
  ).body.data;
}

async function newSpace(name: string, icon?: string): Promise<Space> {
  const res = await createSpace(
    apiReq("/api/v1/spaces", { method: "POST", body: jsonBody({ name, icon }) }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: Space }).data;
}

async function newProfile(name: string, spaceId?: string): Promise<Profile> {
  const res = await createProfile(
    apiReq("/api/v1/profiles", { method: "POST", body: jsonBody({ name, spaceId }) }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: Profile }).data;
}

/** a owns the workspace; b joins it as an editor of the given spaces only. */
async function sharedWorkspace(bSpaceIds: string[]): Promise<string> {
  const Wa = await workspaceIdOf("a");
  await bootstrapUser("b");
  await ws.addMember(uid("a"), Wa, {
    email: "b@example.com",
    access: { mode: "all", role: "editor", spaceIds: bSpaceIds },
  });
  return Wa;
}

describe("/api/v1/spaces", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await listSpaces(apiReq("/api/v1/spaces", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("lists the default space, then creates, renames and reorders", async () => {
    signInAs("a");
    await bootstrapUser("a");

    const initial = await spaces();
    expect(initial).toEqual([
      {
        id: expect.any(String),
        name: "Main",
        icon: "🗂️",
        position: 0,
        profileCount: 1,
        trashedProfileCount: 0,
        role: "admin",
      },
    ]);
    const main = initial[0]!;

    const home = await newSpace("Home", "🏠");
    expect(home).toMatchObject({ name: "Home", icon: "🏠", position: 1, profileCount: 0, role: "admin" });

    const patched = await json<{ data: Space }>(
      await patchSpace(
        apiReq(`/api/v1/spaces/${home.id}`, { method: "PATCH", body: jsonBody({ name: "House", icon: "" }) }),
        ctx({ id: home.id }),
      ),
    );
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ id: home.id, name: "House", icon: null });

    const reordered = await json<{ data: Space[] }>(
      await reorderSpaces(
        apiReq("/api/v1/spaces/reorder", { method: "POST", body: jsonBody({ ids: [home.id, main.id] }) }),
      ),
    );
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.map((s) => s.name)).toEqual(["House", "Main"]);
  });

  it("409s a duplicate name and 422s a blank one", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const dup = await createSpace(
      apiReq("/api/v1/spaces", { method: "POST", body: jsonBody({ name: "Main" }) }),
    );
    expect(dup.status).toBe(409);
    const blank = await createSpace(
      apiReq("/api/v1/spaces", { method: "POST", body: jsonBody({ name: "  " }) }),
    );
    expect(blank.status).toBe(422);
  });

  it("refuses a space past the plan's cap with plan_limit, and lifts it on Plus", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await newSpace("Home"); // Free: 2 spaces, Main included

    const res = await createSpace(
      apiReq("/api/v1/spaces", { method: "POST", body: jsonBody({ name: "Work" }) }),
    );
    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error).toMatchObject({
      code: "plan_limit",
      details: { limit: "spaces", plan: "free", max: 2, used: 2, upgradeTo: "plus" },
    });
    expect(typeof error.message).toBe("string");

    await setWorkspacePlan(await workspaceIdOf("a"), "plus");
    await newSpace("Work");
    expect(await spaces()).toHaveLength(3);
  });

  it("deletes an empty space; one with profiles needs moveProfilesTo (query or body)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const main = await defaultSpaceIdOf(await workspaceIdOf("a"));
    const home = await newSpace("Home");
    const house = await newProfile("House", home.id);
    expect(house.spaceId).toBe(home.id);

    // Still holds a profile → 409, nothing changes.
    const refused = await deleteSpace(
      apiReq(`/api/v1/spaces/${home.id}`, { method: "DELETE" }),
      ctx({ id: home.id }),
    );
    expect(refused.status).toBe(409);
    // A blank query param is "not given", not a malformed uuid.
    const blank = await deleteSpace(
      apiReq(`/api/v1/spaces/${home.id}?moveProfilesTo=`, { method: "DELETE" }),
      ctx({ id: home.id }),
    );
    expect(blank.status).toBe(409);

    const ok = await json<{ data: { id: string; deleted: boolean } }>(
      await deleteSpace(
        apiReq(`/api/v1/spaces/${home.id}?moveProfilesTo=${main}`, { method: "DELETE" }),
        ctx({ id: home.id }),
      ),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ id: home.id, deleted: true });
    expect((await profiles()).find((p) => p.id === house.id)?.spaceId).toBe(main);

    // The JSON-body form does the same.
    const garage = await newSpace("Garage");
    const car = await newProfile("Car", garage.id);
    const viaBody = await deleteSpace(
      apiReq(`/api/v1/spaces/${garage.id}`, {
        method: "DELETE",
        body: jsonBody({ moveProfilesTo: main }),
      }),
      ctx({ id: garage.id }),
    );
    expect(viaBody.status).toBe(200);
    expect((await profiles()).find((p) => p.id === car.id)?.spaceId).toBe(main);

    // The last space can't go.
    const last = await deleteSpace(
      apiReq(`/api/v1/spaces/${main}`, { method: "DELETE" }),
      ctx({ id: main }),
    );
    expect(last.status).toBe(409);
  });

  it("scopes space ids to the current workspace: 422 malformed, 404 elsewhere", async () => {
    signInAs("b");
    await bootstrapUser("b");
    const bSpace = await defaultSpaceIdOf(await workspaceIdOf("b"));

    signInAs("a");
    await bootstrapUser("a");
    const bad = await patchSpace(
      apiReq("/api/v1/spaces/nope", { method: "PATCH", body: jsonBody({ name: "X" }) }),
      ctx({ id: "nope" }),
    );
    expect(bad.status).toBe(422);
    const elsewhere = await deleteSpace(
      apiReq(`/api/v1/spaces/${bSpace}`, { method: "DELETE" }),
      ctx({ id: bSpace }),
    );
    expect(elsewhere.status).toBe(404);
    const access = await spaceAccess(apiReq(`/api/v1/spaces/${bSpace}/access`), ctx({ id: bSpace }));
    expect(access.status).toBe(404);
  });

  it("moves a profile into another space, refusing a full one with plan_limit", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    const home = await newSpace("Home");

    const moved = await json<{ data: Profile }>(
      await moveToSpace(
        apiReq(`/api/v1/profiles/${personal}/space`, { method: "POST", body: jsonBody({ spaceId: home.id }) }),
        ctx({ id: personal }),
      ),
    );
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ id: personal, spaceId: home.id, access: "admin" });

    // Free: 3 profiles per space. Home now holds Personal + 2 more = full.
    await newProfile("Two", home.id);
    await newProfile("Three", home.id);
    const extra = await newProfile("Four"); // lands in Main
    const full = await moveToSpace(
      apiReq(`/api/v1/profiles/${extra.id}/space`, { method: "POST", body: jsonBody({ spaceId: home.id }) }),
      ctx({ id: extra.id }),
    );
    expect(full.status).toBe(403);
    expect((await full.json()).error).toMatchObject({
      code: "plan_limit",
      details: { limit: "profilesPerSpace", plan: "free", max: 3, used: 3, upgradeTo: "plus" },
    });

    const badBody = await moveToSpace(
      apiReq(`/api/v1/profiles/${extra.id}/space`, { method: "POST", body: jsonBody({ spaceId: "x" }) }),
      ctx({ id: extra.id }),
    );
    expect(badBody.status).toBe(422);
  });
});

describe("space membership and access", () => {
  it("a member sees only their spaces and profiles; admins change that", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const main = await defaultSpaceIdOf(await workspaceIdOf("a"));
    const home = await newSpace("Home");
    const house = await newProfile("House", home.id);
    const Wa = await sharedWorkspace([main]);
    const asB = { "X-Workspace-Id": Wa };

    // b: editor of Main only.
    signInAs("b");
    expect(await spaces(asB)).toEqual([expect.objectContaining({ id: main, role: "editor" })]);
    expect((await profiles(asB)).map((p) => [p.name, p.access])).toEqual([["Personal", "write"]]);
    // Not an admin: the access view and membership changes are refused.
    const denied = await spaceAccess(
      apiReq(`/api/v1/spaces/${main}/access`, { headers: asB }),
      ctx({ id: main }),
    );
    expect(denied.status).toBe(403);

    // a puts b in Home as a viewer.
    signInAs("a");
    const set = await json<{
      data: {
        space: { id: string; workspaceId: string };
        members: { userId: string; workspaceRole: string; spaceRole: string | null; isOwner: boolean }[];
        profiles: { id: string }[];
        canEditOverrides: boolean;
      };
    }>(
      await setSpaceMember(
        apiReq(`/api/v1/spaces/${home.id}/members`, {
          method: "PUT",
          body: jsonBody({ userId: uid("b"), role: "viewer" }),
        }),
        ctx({ id: home.id }),
      ),
    );
    expect(set.status).toBe(200);
    expect(set.body.data.space).toMatchObject({ id: home.id, workspaceId: Wa });
    expect(set.body.data.members).toEqual([
      expect.objectContaining({ userId: uid("a"), workspaceRole: "admin", spaceRole: null, isOwner: true }),
      expect.objectContaining({ userId: uid("b"), workspaceRole: "editor", spaceRole: "viewer", isOwner: false }),
    ]);
    expect(set.body.data.profiles.map((p) => p.id)).toEqual([house.id]);
    expect(set.body.data.canEditOverrides).toBe(false);

    signInAs("b");
    expect((await spaces(asB)).map((s) => [s.id, s.role])).toEqual([
      [main, "editor"],
      [home.id, "viewer"],
    ]);
    expect((await profiles(asB)).find((p) => p.id === house.id)).toMatchObject({
      spaceId: home.id,
      access: "read",
    });

    // a takes b out of Home again.
    signInAs("a");
    const removed = await setSpaceMember(
      apiReq(`/api/v1/spaces/${home.id}/members`, {
        method: "PUT",
        body: jsonBody({ userId: uid("b"), role: null }),
      }),
      ctx({ id: home.id }),
    );
    expect(removed.status).toBe(200);
    // Admins see every space already — they can't be added to one.
    const adminTarget = await setSpaceMember(
      apiReq(`/api/v1/spaces/${home.id}/members`, {
        method: "PUT",
        body: jsonBody({ userId: uid("a"), role: "editor" }),
      }),
      ctx({ id: home.id }),
    );
    expect(adminTarget.status).toBe(400);

    signInAs("b");
    expect((await spaces(asB)).map((s) => s.id)).toEqual([main]);
    expect((await profiles(asB)).map((p) => p.id)).not.toContain(house.id);
  });

  it("per-profile overrides: refused on Free with plan_limit, applied on Plus", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const main = await defaultSpaceIdOf(await workspaceIdOf("a"));
    const personal = await firstProfileId("a");
    const Wa = await sharedWorkspace([main]);
    const asB = { "X-Workspace-Id": Wa };

    signInAs("a");
    const put = (access: string | null) =>
      setOverride(
        apiReq(`/api/v1/profiles/${personal}/overrides`, {
          method: "PUT",
          body: jsonBody({ userId: uid("b"), access }),
        }),
        ctx({ id: personal }),
      );

    const refused = await put("none");
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toMatchObject({
      code: "plan_limit",
      details: { limit: "profileLevelAccess", plan: "free", upgradeTo: "plus" },
    });

    await setWorkspacePlan(Wa, "plus");
    const set = await json<{ data: { userId: string; access: string }[] }>(await put("none"));
    expect(set.status).toBe(200);
    expect(set.body.data).toEqual([{ userId: uid("b"), access: "none" }]);

    const listed = await json<{ data: { userId: string; access: string }[] }>(
      await listOverrides(apiReq(`/api/v1/profiles/${personal}/overrides`), ctx({ id: personal })),
    );
    expect(listed.body.data).toEqual([{ userId: uid("b"), access: "none" }]);

    // `none` hides the profile from b even inside their space.
    signInAs("b");
    expect((await profiles(asB)).map((p) => p.id)).not.toContain(personal);
    const notAdmin = await listOverrides(
      apiReq(`/api/v1/profiles/${personal}/overrides`, { headers: asB }),
      ctx({ id: personal }),
    );
    expect(notAdmin.status).toBe(403);

    // `read` brings it back, read-only.
    signInAs("a");
    await put("read");
    signInAs("b");
    expect((await profiles(asB)).find((p) => p.id === personal)?.access).toBe("read");

    // null clears it: back to b's space role (editor → write).
    signInAs("a");
    const cleared = await json<{ data: unknown[] }>(await put(null));
    expect(cleared.body.data).toEqual([]);
    signInAs("b");
    expect((await profiles(asB)).find((p) => p.id === personal)?.access).toBe("write");
  });

  it("422s a malformed profile id on the override endpoints", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await listOverrides(apiReq("/api/v1/profiles/nope/overrides"), ctx({ id: "nope" }));
    expect(res.status).toBe(422);
  });
});
