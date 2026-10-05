import { describe, it, expect } from "vitest";
import { GET, PATCH } from "@/app/api/v1/organization/route";
import { POST as createWorkspace } from "@/app/api/v1/workspaces/route";
import { setSession, signInAs, uid } from "../helpers/session";
import { bootstrapUser, setWorkspacePlan, workspaceIdOf } from "../helpers/seed";
import { apiReq, jsonBody } from "./helpers";

type Organization = {
  id: string;
  name: string;
  kind: string;
  owner: { id: string; name: string | null; email: string | null };
  workspaces: {
    id: string;
    name: string;
    icon: string | null;
    plan: string;
    grandfathered: boolean;
    readOnly: boolean;
    canOpen: boolean;
  }[];
};

async function org(): Promise<Organization> {
  const res = await GET(apiReq("/api/v1/organization"));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Organization }).data;
}

describe("/api/v1/organization", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await GET(apiReq("/api/v1/organization", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("returns the caller's personal organisation with its workspaces and plans", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const Wa = await workspaceIdOf("a");

    expect(await org()).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "a's organisation",
      kind: "personal",
      owner: { id: uid("a"), name: "a", email: "a@example.com" },
      workspaces: [
        {
          id: Wa,
          name: "a's Workspace",
          icon: expect.any(String),
          plan: "free",
          grandfathered: false,
          readOnly: false,
          canOpen: true,
        },
      ],
    });
  });

  // `getMyOrganization` reads the view-only flag inside a single-table select —
  // the shape that once flattened `readOnlyWorkspaceSql`'s self-join into a
  // constant false.
  it("marks an extra free workspace view-only", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const Wa = await workspaceIdOf("a");
    // Paid first workspace → a second (free) one can be created; then the
    // first drops back to Free, leaving two free workspaces.
    await setWorkspacePlan(Wa, "plus");
    const created = await createWorkspace(
      apiReq("/api/v1/workspaces", { method: "POST", body: jsonBody({ name: "Side" }) }),
    );
    expect(created.status).toBe(201);
    await setWorkspacePlan(Wa, "free");

    const { workspaces } = await org();
    expect(workspaces.map((w) => [w.name, w.plan, w.readOnly])).toEqual([
      ["a's Workspace", "free", false],
      ["Side", "free", true],
    ]);
  });

  it("renames the organisation, and 422s a blank or too-long name", async () => {
    signInAs("a");
    await bootstrapUser("a");

    const res = await PATCH(
      apiReq("/api/v1/organization", { method: "PATCH", body: jsonBody({ name: "  Acme  " }) }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: Organization }).data.name).toBe("Acme");
    expect((await org()).name).toBe("Acme");

    for (const name of ["   ", "x".repeat(41)]) {
      const bad = await PATCH(
        apiReq("/api/v1/organization", { method: "PATCH", body: jsonBody({ name }) }),
      );
      expect(bad.status).toBe(422);
      expect((await bad.json()).error.code).toBe("validation_error");
    }
    const notJson = await PATCH(
      apiReq("/api/v1/organization", { method: "PATCH", body: "nope" }),
    );
    expect(notJson.status).toBe(400);
  });

  it("is per account: another user sees only their own", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await PATCH(apiReq("/api/v1/organization", { method: "PATCH", body: jsonBody({ name: "Acme" }) }));

    signInAs("b");
    await bootstrapUser("b");
    const mine = await org();
    expect(mine.name).toBe("b's organisation");
    expect(mine.owner.id).toBe(uid("b"));
    expect(mine.workspaces.map((w) => w.id)).toEqual([await workspaceIdOf("b")]);
  });
});
