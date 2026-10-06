import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { GET as trashTxns } from "@/app/api/v1/trash/transactions/route";
import { GET as trashFiles } from "@/app/api/v1/trash/files/route";
import { GET as trashProfiles } from "@/app/api/v1/trash/profiles/route";
import { POST as restore } from "@/app/api/v1/trash/restore/route";
import { POST as deleteForGood } from "@/app/api/v1/trash/delete/route";
import { POST as empty } from "@/app/api/v1/trash/empty/route";
import { DELETE as deleteTxn } from "@/app/api/v1/transactions/[id]/route";
import { DELETE as deleteFileRoute } from "@/app/api/v1/files/[id]/route";
import { DELETE as deleteFolderRoute } from "@/app/api/v1/folders/[id]/route";
import { POST as deleteAll } from "@/app/api/v1/transactions/delete-all/route";
import { GET as usage } from "@/app/api/v1/usage/route";
import { profileAccess } from "@/db/schema";
import { bootstrapUser, firstProfileId, insertTxn, setWorkspacePlan, workspaceIdOf } from "../helpers/seed";
import { signInAs, uid } from "../helpers/session";
import { getTestDb } from "../helpers/test-db";
import { seedFile, seedFolder, seedProfile } from "../helpers/vault-seed";
import { apiReq, ctx, jsonBody } from "./helpers";

let W: string;
let P: string;

beforeEach(async () => {
  signInAs("a");
  await bootstrapUser("a");
  W = await workspaceIdOf("a");
  P = await firstProfileId("a");
});

const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const post = (path: string, body?: unknown) =>
  apiReq(path, { method: "POST", ...(body === undefined ? {} : { body: jsonBody(body) }) });

describe("deletes report that they went to the trash", () => {
  it("DELETE /transactions/:id → trashed: true", async () => {
    const id = await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    const res = await json(await deleteTxn(apiReq(`/api/v1/transactions/${id}`, { method: "DELETE" }), ctx({ id })));
    expect(res).toEqual({ status: 200, body: { data: { id, deleted: true, trashed: true } } });
  });

  it("DELETE /files/:id and /folders/:id → trashed on Plus, deleted for good on Free", async () => {
    const free = await seedFile("a", P);
    let res = await json(await deleteFileRoute(apiReq(`/api/v1/files/${free}`, { method: "DELETE" }), ctx({ id: free })));
    expect(res.body.data).toEqual({ id: free, deleted: true, trashed: false });

    await setWorkspacePlan(W, "plus");
    const plus = await seedFile("a", P);
    res = await json(await deleteFileRoute(apiReq(`/api/v1/files/${plus}`, { method: "DELETE" }), ctx({ id: plus })));
    expect(res.body.data).toEqual({ id: plus, deleted: true, trashed: true });
    const folder = await seedFolder("a", P, "Docs");
    res = await json(
      await deleteFolderRoute(apiReq(`/api/v1/folders/${folder}`, { method: "DELETE" }), ctx({ id: folder })),
    );
    expect(res.body.data).toEqual({ id: folder, deleted: true, trashed: true });
  });

  it("POST /transactions/delete-all → moved to the trash", async () => {
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    const res = await json(await deleteAll(post("/api/v1/transactions/delete-all", { confirm: "DELETE" })));
    expect(res.body.data).toEqual({ deleted: 1, trashed: true });
  });

  it("GET /usage reports the bytes in the trash", async () => {
    await setWorkspacePlan(W, "plus");
    const id = await seedFile("a", P, { sizeBytes: 1234 });
    await deleteFileRoute(apiReq(`/api/v1/files/${id}`, { method: "DELETE" }), ctx({ id }));
    const res = await json(await usage(apiReq("/api/v1/usage")));
    expect(res.body.data.storage).toMatchObject({ usedBytes: 1234, trashBytes: 1234 });
  });
});

describe("GET /trash/*", () => {
  it("lists trashed transactions with paging, deleter and purge date", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await insertTxn("a", { type: "expense", amountMinor: 100 + i, occurredOn: "2026-06-01" });
      ids.push(id);
      await deleteTxn(apiReq(`/api/v1/transactions/${id}`, { method: "DELETE" }), ctx({ id }));
    }
    const first = await json(await trashTxns(apiReq("/api/v1/trash/transactions?limit=2")));
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.data[0]).toMatchObject({
      deletedBy: { id: uid("a") },
      canRestore: true,
      amountMinor: expect.any(Number),
    });
    expect(Date.parse(first.body.data[0].purgeAt) - Date.parse(first.body.data[0].deletedAt)).toBe(
      30 * 86_400_000,
    );
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));

    const second = await json(
      await trashTxns(
        apiReq(`/api/v1/trash/transactions?limit=2&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`),
      ),
    );
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.nextCursor).toBeNull();
    const all = [...first.body.data, ...second.body.data].map((r: { id: string }) => r.id);
    expect(all.sort()).toEqual(ids.sort());
  });

  it("rejects a malformed cursor with 422", async () => {
    const res = await trashTxns(apiReq("/api/v1/trash/transactions?cursor=garbage"));
    expect(res.status).toBe(422);
  });

  it("lists the vault's trash and (admins) trashed profiles", async () => {
    await setWorkspacePlan(W, "plus");
    const folder = await seedFolder("a", P, "Docs");
    await seedFile("a", P, { folderId: folder });
    await deleteFolderRoute(apiReq(`/api/v1/folders/${folder}`, { method: "DELETE" }), ctx({ id: folder }));
    const vault = await json(await trashFiles(apiReq("/api/v1/trash/files")));
    expect(vault.body.data.folders.map((f: { id: string; files: number }) => [f.id, f.files])).toEqual([[folder, 1]]);

    const work = await seedProfile("a", "Work");
    const { DELETE: deleteProfileRoute } = await import("@/app/api/v1/profiles/[id]/route");
    const del = await json(
      await deleteProfileRoute(apiReq(`/api/v1/profiles/${work}?transactions=delete`, { method: "DELETE" }), ctx({ id: work })),
    );
    expect(del.body.data).toEqual({ id: work, deleted: true, trashed: true });
    const trashed = await json(await trashProfiles(apiReq("/api/v1/trash/profiles")));
    expect(trashed.body.data.map((p: { id: string }) => p.id)).toEqual([work]);
  });

  it("shows trashed profiles only to admins", async () => {
    const work = await seedProfile("a", "Work");
    const { deleteProfile } = await import("@/services/profiles");
    await deleteProfile(uid("a"), work);
    await bootstrapUser("v");
    await getTestDb().insert(profileAccess).values({ profileId: P, userId: uid("v"), role: "viewer" });
    signInAs("v");
    const res = await json(
      await trashProfiles(apiReq("/api/v1/trash/profiles", { headers: { "X-Workspace-Id": W } })),
    );
    expect(res.body.data).toEqual([]);
  });

  it("401s without a token", async () => {
    expect((await trashTxns(apiReq("/api/v1/trash/transactions", { auth: false }))).status).toBe(401);
  });
});

describe("POST /trash/restore, /trash/delete, /trash/empty", () => {
  it("restores and reports counts and skips", async () => {
    const id = await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    await deleteTxn(apiReq(`/api/v1/transactions/${id}`, { method: "DELETE" }), ctx({ id }));
    const res = await json(
      await restore(post("/api/v1/trash/restore", { transactionIds: [id, "01a1127e-e254-7fff-a0a3-0f4616068dd4"] })),
    );
    expect(res).toEqual({
      status: 200,
      body: { data: { restored: { transactions: 1, files: 0, folders: 0, profiles: 0 }, skipped: 1 } },
    });
  });

  it("422s on an empty or malformed selection", async () => {
    expect((await restore(post("/api/v1/trash/restore", {}))).status).toBe(422);
    expect((await deleteForGood(post("/api/v1/trash/delete", { fileIds: ["nope"] }))).status).toBe(422);
  });

  it("refuses a profile restore that breaks a plan limit with 403 plan_limit", async () => {
    const work = await seedProfile("a", "Work");
    await seedProfile("a", "Spare");
    const { deleteProfile } = await import("@/services/profiles");
    await deleteProfile(uid("a"), work);
    await seedProfile("a", "Filler"); // Free: 3 profiles per space — full again
    const res = await json(await restore(post("/api/v1/trash/restore", { profileIds: [work] })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("plan_limit");
  });

  it("deletes for good, and empties the rest", async () => {
    const a = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    const b = await insertTxn("a", { type: "expense", amountMinor: 2, occurredOn: "2026-06-01" });
    for (const id of [a, b]) {
      await deleteTxn(apiReq(`/api/v1/transactions/${id}`, { method: "DELETE" }), ctx({ id }));
    }
    const del = await json(await deleteForGood(post("/api/v1/trash/delete", { transactionIds: [a] })));
    expect(del.body.data).toEqual({ deleted: { transactions: 1, files: 0, folders: 0, profiles: 0 }, skipped: 0 });
    const emptied = await json(await empty(post("/api/v1/trash/empty")));
    expect(emptied.body.data).toEqual({
      deleted: { transactions: 1, files: 0, folders: 0, profiles: 0 },
      remaining: 0,
    });
  });
});
