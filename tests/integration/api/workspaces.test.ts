import { describe, it, expect } from "vitest";
import { GET, POST } from "@/app/api/v1/workspaces/route";
import { GET as getMe } from "@/app/api/v1/me/route";
import * as ws from "@/services/workspaces";
import { setSession, signInAs, uid } from "../helpers/session";
import { bootstrapUser, firstProfileId, workspaceIdOf } from "../helpers/seed";
import { apiReq, jsonBody } from "./helpers";

type WorkspaceItem = { id: string; name: string; icon: string | null; role: string | null };

describe("GET /api/v1/workspaces", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await GET(apiReq("/api/v1/workspaces", { auth: false }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("lists every workspace the member can open, with per-workspace roles", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const Wa = await workspaceIdOf("a");
    const Wb = await workspaceIdOf("b");
    // b becomes an editor of a's workspace, on top of owning theirs.
    await ws.addMember(uid("a"), Wa, {
      email: "b@example.com",
      access: { mode: "all", role: "editor" },
    });

    signInAs("b");
    const res = await GET(apiReq("/api/v1/workspaces"));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: WorkspaceItem[] };

    expect(data).toHaveLength(2);
    const byId = Object.fromEntries(data.map((w) => [w.id, w]));
    expect(byId[Wa]).toMatchObject({ id: Wa, name: "a's Workspace", role: "editor" });
    expect(byId[Wb]).toMatchObject({ id: Wb, name: "b's Workspace", role: "admin" });
    // Each workspace carries its currency + number format now.
    expect(byId[Wb]).toMatchObject({
      currency: "USD",
      locale: "en-US",
      currencyDetail: { code: "USD", symbol: "$", decimals: 2 },
    });
  });

  it("returns role null for a grant-only workspace, after memberships", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("c");
    const Wa = await workspaceIdOf("a");
    const Wc = await workspaceIdOf("c");
    const aProfile = await firstProfileId("a");
    // c gets a per-profile grant on a's profile — no workspace membership.
    await ws.addMember(uid("a"), Wa, {
      email: "c@example.com",
      access: { mode: "profiles", entries: [{ profileId: aProfile, role: "viewer" }] },
    });

    signInAs("c");
    const res = await GET(apiReq("/api/v1/workspaces"));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: WorkspaceItem[] };

    expect(data).toHaveLength(2);
    // Membership first, grant-only workspace last with role null.
    expect(data[0]).toMatchObject({ id: Wc, name: "c's Workspace", role: "admin" });
    expect(data[1]).toMatchObject({ id: Wa, name: "a's Workspace", role: null });
  });

  it("ignores X-Workspace-Id (never 404s) and returns the full list", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await GET(
      apiReq("/api/v1/workspaces", {
        headers: { "X-Workspace-Id": "00000000-0000-4000-8000-999999999999" },
      }),
    );
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: WorkspaceItem[] };
    expect(data).toHaveLength(1);
    expect(data[0].role).toBe("admin");
  });
});

describe("POST /api/v1/workspaces", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await POST(
      apiReq("/api/v1/workspaces", {
        auth: false,
        method: "POST",
        body: jsonBody({ name: "Trip" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("creates a workspace, returns it with role admin, and makes it current", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await POST(
      apiReq("/api/v1/workspaces", { method: "POST", body: jsonBody({ name: "Trip", icon: "🏝️" }) }),
    );
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: WorkspaceItem };
    expect(data.name).toBe("Trip");
    expect(data.icon).toBe("🏝️");
    expect(data.role).toBe("admin");
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);

    // The service runs the web flow with makeCurrent — /me without a
    // workspace header now resolves to the new workspace.
    const meRes = await getMe(apiReq("/api/v1/me"));
    const me = await meRes.json();
    expect(me.data.workspace).toMatchObject({ id: data.id, name: "Trip", role: "admin" });

    // And it shows up in the switcher list.
    const listRes = await GET(apiReq("/api/v1/workspaces"));
    const list = (await listRes.json()) as { data: WorkspaceItem[] };
    expect(list.data.map((w) => w.id)).toContain(data.id);
  });

  it("422s on a blank name", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await POST(
      apiReq("/api/v1/workspaces", { method: "POST", body: jsonBody({ name: "   " }) }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
  });

  it("400s on a non-JSON body", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await POST(
      apiReq("/api/v1/workspaces", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });
});
