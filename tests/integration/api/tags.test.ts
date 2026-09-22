import { describe, it, expect } from "vitest";
import { GET as listTags, POST as createTag } from "@/app/api/v1/tags/route";
import { PATCH as patchTag, DELETE as deleteTag } from "@/app/api/v1/tags/[id]/route";
import { GET as listTxns, POST as createTxn } from "@/app/api/v1/transactions/route";
import { setSession, signInAs, uid } from "../helpers/session";
import { bootstrapUser, workspaceIdOf } from "../helpers/seed";
import { apiReq, jsonBody, ctx } from "./helpers";

const MISSING = "00000000-0000-0000-0000-000000000000";

/** POST a tag and return the created row. */
async function post(name: string, color = "#ef4444") {
  const res = await createTag(
    apiReq("/api/v1/tags", { method: "POST", body: jsonBody({ name, color }) }),
  );
  return { status: res.status, body: await res.json() };
}

/** The tags embedded on the caller's transactions, by transaction title. */
async function embeddedTags(): Promise<Record<string, string[]>> {
  const res = await listTxns(apiReq("/api/v1/transactions"));
  const { data } = await res.json();
  const out: Record<string, string[]> = {};
  for (const row of data as { title: string; tags: { name: string }[] }[]) {
    out[row.title] = row.tags.map((t) => t.name);
  }
  return out;
}

describe("/api/v1/tags", () => {
  it("401s without a token", async () => {
    setSession(null);
    const res = await listTags(apiReq("/api/v1/tags", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("starts empty and lists by name, case-insensitively", async () => {
    signInAs("a");
    await bootstrapUser("a");

    const empty = await listTags(apiReq("/api/v1/tags"));
    expect(empty.status).toBe(200);
    // Unlike categories, a workspace is not seeded with tags — the list starts
    // empty and the user builds it.
    expect((await empty.json()).data).toEqual([]);

    await post("zebra");
    await post("Apple");
    const res = await listTags(apiReq("/api/v1/tags"));
    const { data } = await res.json();
    // `lower(name)`, so "Apple" leads — a C-collation database would otherwise
    // sort every capital ahead of every lowercase.
    expect((data as { name: string }[]).map((t) => t.name)).toEqual(["Apple", "zebra"]);
  });

  it("creates a tag (201) and rejects a duplicate name (409)", async () => {
    signInAs("a");
    await bootstrapUser("a");

    const created = await post("Travel", "#3B82F6");
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe("Travel");
    // Lowercased on the way in, so a chip's `${color}1a` alpha suffix is always
    // built from a known shape.
    expect(created.body.data.color).toBe("#3b82f6");
    expect(created.body.data).toHaveProperty("createdAt");

    // The unique index is on `lower(name)`, so this is the same tag.
    const dup = await post("travel");
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toMatch(/already exists/);
  });

  it("422s on an empty name or a color that isn't a hex triple", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await post("")).status).toBe(422);
    expect((await post("Travel", "red")).status).toBe(422);
  });

  it("renames a tag everywhere it is used", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const { body } = await post("Travel");
    const id = body.data.id;

    await createTxn(
      apiReq("/api/v1/transactions", {
        method: "POST",
        body: jsonBody({
          type: "expense",
          amount: 10,
          occurredOn: "2026-06-01",
          title: "flight",
          tagIds: [id],
        }),
      }),
    );

    const patched = await patchTag(
      apiReq(`/api/v1/tags/${id}`, { method: "PATCH", body: jsonBody({ name: "Trips" }) }),
      ctx({ id }),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.name).toBe("Trips");
    // Transactions reference the tag by id and resolve it at read time, so the
    // rename shows on every row carrying it without touching a transaction.
    expect((await embeddedTags()).flight).toEqual(["Trips"]);
  });

  it("422s a PATCH that changes nothing", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const { body } = await post("Travel");
    const res = await patchTag(
      apiReq(`/api/v1/tags/${body.data.id}`, { method: "PATCH", body: jsonBody({}) }),
      ctx({ id: body.data.id }),
    );
    // Silently succeeding would bump `updated_at` having done nothing.
    expect(res.status).toBe(422);
  });

  it("deletes a tag and detaches it from its transactions", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const travel = (await post("Travel")).body.data.id;
    const work = (await post("Work")).body.data.id;

    await createTxn(
      apiReq("/api/v1/transactions", {
        method: "POST",
        body: jsonBody({
          type: "expense",
          amount: 10,
          occurredOn: "2026-06-01",
          title: "hotel",
          tagIds: [travel, work],
        }),
      }),
    );

    const del = await deleteTag(
      apiReq(`/api/v1/tags/${travel}`, { method: "DELETE" }),
      ctx({ id: travel }),
    );
    expect(del.status).toBe(200);
    expect((await del.json()).data).toEqual({ id: travel, deleted: true });

    // `tag_ids` carries no foreign key, so nothing in the database detaches a
    // deleted tag for us — the service sweeps the column in the same
    // transaction as the delete. Without it the id would linger, resolving to
    // nothing: invisible on the row and impossible to remove.
    expect((await embeddedTags()).hotel).toEqual(["Work"]);
  });

  it("404s patching or deleting an unknown tag", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const patched = await patchTag(
      apiReq(`/api/v1/tags/${MISSING}`, { method: "PATCH", body: jsonBody({ name: "x" }) }),
      ctx({ id: MISSING }),
    );
    expect(patched.status).toBe(404);
    const deleted = await deleteTag(
      apiReq(`/api/v1/tags/${MISSING}`, { method: "DELETE" }),
      ctx({ id: MISSING }),
    );
    expect(deleted.status).toBe(404);
  });

  it("422s a delete with an id that isn't a uuid", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await deleteTag(
      apiReq("/api/v1/tags/not-a-uuid", { method: "DELETE" }),
      ctx({ id: "not-a-uuid" }),
    );
    expect(res.status).toBe(422);
  });

  it("is read-only for a viewer (403 on every write)", async () => {
    // Four rows of the API reference promise "Editor+ (403 for viewer)", and
    // nothing was checking it.
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    const mine = (await post("Travel")).body.data.id;

    const ws = await import("@/services/workspaces");
    await bootstrapUser("v");
    await ws.addMember(uid("a"), W, {
      email: "v@example.com",
      access: { mode: "all", role: "viewer" },
    });
    signInAs("v");
    await ws.openWorkspaceIfAccessible(uid("v"), W);

    // Reading is fine — a viewer sees the shared list.
    const list = await listTags(apiReq("/api/v1/tags"));
    expect(list.status).toBe(200);
    expect((await list.json()).data.map((t: { name: string }) => t.name)).toEqual(["Travel"]);

    expect((await post("Theirs")).status).toBe(403);
    const patched = await patchTag(
      apiReq(`/api/v1/tags/${mine}`, { method: "PATCH", body: jsonBody({ name: "Nope" }) }),
      ctx({ id: mine }),
    );
    expect(patched.status).toBe(403);
    const deleted = await deleteTag(
      apiReq(`/api/v1/tags/${mine}`, { method: "DELETE" }),
      ctx({ id: mine }),
    );
    expect(deleted.status).toBe(403);
  });

  it("409s past the workspace tag ceiling", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const { TAGS_PER_WORKSPACE_MAX } = await import("@/lib/validation");
    const { createTxnTag } = await import("@/services/tags");
    const W = await workspaceIdOf("a");
    // Through the service, so the test isn't 100 HTTP round trips.
    for (let i = 0; i < TAGS_PER_WORKSPACE_MAX; i++) {
      await createTxnTag(uid("a"), W, { name: `tag-${i}`, color: "#ef4444" });
    }
    const res = await post("one-too-many");
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(new RegExp(`${TAGS_PER_WORKSPACE_MAX} tags`));
  });

  it("keeps another workspace's tags out of reach", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const mine = (await post("Travel")).body.data.id;

    signInAs("b");
    await bootstrapUser("b");
    const theirs = await listTags(apiReq("/api/v1/tags"));
    expect((await theirs.json()).data).toEqual([]);

    // Same name is fine in another workspace — the unique index is per
    // workspace, not global.
    expect((await post("Travel")).status).toBe(201);

    const patched = await patchTag(
      apiReq(`/api/v1/tags/${mine}`, { method: "PATCH", body: jsonBody({ name: "stolen" }) }),
      ctx({ id: mine }),
    );
    expect(patched.status).toBe(404);
    const deleted = await deleteTag(
      apiReq(`/api/v1/tags/${mine}`, { method: "DELETE" }),
      ctx({ id: mine }),
    );
    expect(deleted.status).toBe(404);
  });
});
