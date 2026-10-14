import { describe, it, expect, vi } from "vitest";

// GET /files is read-only, but its module imports the R2 client — keep the edge mocked.
vi.mock("@/lib/r2", () => ({
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { GET } from "@/app/api/v1/usage/route";
import { GET as getVault } from "@/app/api/v1/files/route";
import { GET as listProfiles } from "@/app/api/v1/profiles/route";
import { PATCH as patchProfile } from "@/app/api/v1/profiles/[id]/route";
import { POST as createWorkspace } from "@/app/api/v1/workspaces/route";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "@/lib/categories";
import { PLAN_LIMITS } from "@/lib/plans";
import { setSession, signInAs } from "../helpers/session";
import { bootstrapUser, setWorkspacePlan, workspaceIdOf } from "../helpers/seed";
import { apiReq, ctx, jsonBody } from "./helpers";

async function usage(headers?: Record<string, string>) {
  const res = await GET(apiReq("/api/v1/usage", { headers }));
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

describe("GET /api/v1/usage", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await GET(apiReq("/api/v1/usage", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("reports a new Free workspace's plan, limits and usage", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const free = PLAN_LIMITS.free;

    const data = await usage();
    expect(data).toEqual({
      plan: "free",
      readOnly: false,
      readOnlyReason: null,
      ai: {
        used: 0,
        limit: free.aiActionsPerMonth,
        remaining: free.aiActionsPerMonth,
        topUpRemaining: 0,
        topUpExpiresAt: null,
        resetsAt: expect.stringMatching(/^\d{4}-\d{2}-01T00:00:00\.000Z$/),
      },
      storage: { usedBytes: 0, limitBytes: free.storageBytes, trashBytes: 0 },
      members: { used: 1, limit: free.members },
      spaces: { used: 1, limit: free.spaces },
      categories: { used: DEFAULT_CATEGORIES.length, limit: free.categories },
      tags: { used: DEFAULT_TAGS.length, limit: free.tags },
      budgets: { used: 0, limit: free.budgets.max, unlimited: false },
      profilesPerSpace: free.profilesPerSpace,
      voice: false,
      profileLevelAccess: false,
    });
    expect(new Date(data.ai.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("follows the workspace's plan, and GET /files reports the same storage limit", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await setWorkspacePlan(await workspaceIdOf("a"), "pro");
    const pro = PLAN_LIMITS.pro;

    const data = await usage();
    expect(data).toMatchObject({
      plan: "pro",
      ai: { limit: pro.aiActionsPerMonth, remaining: pro.aiActionsPerMonth },
      storage: { limitBytes: pro.storageBytes },
      members: { limit: pro.members },
      spaces: { limit: pro.spaces },
      categories: { limit: pro.categories },
      tags: { limit: pro.tags },
      profilesPerSpace: pro.profilesPerSpace,
      voice: true,
      profileLevelAccess: true,
    });

    const vault = await getVault(apiReq("/api/v1/files"));
    expect((await vault.json()).meta.storage).toEqual({ usedBytes: 0, limitBytes: pro.storageBytes });
  });

  // Covers both single-select readers of the view-only flag:
  // `getWorkspaceEntitlements` (the `readOnly` here) and
  // `getEffectiveProfileRole` (the refused write below).
  it("reports the workspace X-Workspace-Id picks; an extra free one is view-only", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const Wa = await workspaceIdOf("a");
    await setWorkspacePlan(Wa, "plus");
    const created = await createWorkspace(
      apiReq("/api/v1/workspaces", { method: "POST", body: jsonBody({ name: "Side" }) }),
    );
    const side = ((await created.json()) as { data: { id: string } }).data.id;
    await setWorkspacePlan(Wa, "free"); // two free workspaces → the newer one is view-only

    expect(await usage({ "X-Workspace-Id": Wa })).toMatchObject({ plan: "free", readOnly: false });
    expect(await usage({ "X-Workspace-Id": side })).toMatchObject({
      plan: "free",
      readOnly: true,
      readOnlyReason: "extra_free",
    });

    // Every profile there reads as read-only, and a write is refused with the upgrade error.
    const list = await listProfiles(apiReq("/api/v1/profiles", { headers: { "X-Workspace-Id": side } }));
    const profiles = (await list.json()).data as { id: string; access: string }[];
    expect(profiles.map((p) => p.access)).toEqual(["read"]);

    const write = await patchProfile(
      apiReq(`/api/v1/profiles/${profiles[0]!.id}`, {
        method: "PATCH",
        headers: { "X-Workspace-Id": side },
        body: jsonBody({ name: "Renamed" }),
      }),
      ctx({ id: profiles[0]!.id }),
    );
    expect(write.status).toBe(403);
    expect((await write.json()).error).toMatchObject({
      code: "plan_limit",
      details: { limit: "freeWorkspaces", plan: "free", upgradeTo: "plus" },
    });
  });

  it("404s an unknown X-Workspace-Id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await GET(
      apiReq("/api/v1/usage", { headers: { "X-Workspace-Id": "00000000-0000-4000-8000-999999999999" } }),
    );
    expect(res.status).toBe(404);
  });
});
