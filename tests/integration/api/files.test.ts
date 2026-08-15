import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";

// Mock only the R2 edge — RBAC, DB, validation, and the routes run for real.
vi.mock("@/lib/r2", () => ({
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { deleteObject, signedGetUrl, uploadObject } from "@/lib/r2";
import { GET as getVault, POST as uploadFiles } from "@/app/api/v1/files/route";
import { PATCH as patchFile, DELETE as deleteFile } from "@/app/api/v1/files/[id]/route";
import { GET as fileUrl } from "@/app/api/v1/files/[id]/url/route";
import { POST as createFolder } from "@/app/api/v1/folders/route";
import { PATCH as patchFolder, DELETE as deleteFolder } from "@/app/api/v1/folders/[id]/route";
import { GET as listTags, POST as createTag } from "@/app/api/v1/file-tags/route";
import { PATCH as patchTag, DELETE as deleteTag } from "@/app/api/v1/file-tags/[id]/route";
import { GET as listShares, POST as createShare } from "@/app/api/v1/file-shares/route";
import { DELETE as deleteShare } from "@/app/api/v1/file-shares/[id]/route";
import { GET as shareFileBytes } from "@/app/api/share/[token]/file/[fileId]/route";
import { eq } from "drizzle-orm";
import { fileShares, files, folders, profileAccess, transactionAttachments } from "@/db/schema";
import { STORAGE_QUOTA_BYTES } from "@/lib/validation";
import { bootstrapUser, firstProfileId, insertTxn, workspaceIdOf } from "../helpers/seed";
import { signInAs, uid } from "../helpers/session";
import { getTestDb } from "../helpers/test-db";
import { apiReq, jsonBody, ctx } from "./helpers";

/** Sign in + bootstrap "a" and return their first profile id. */
async function setup(): Promise<string> {
  signInAs("a");
  await bootstrapUser("a");
  return firstProfileId("a");
}

/** A multipart vault-upload request, mirroring what the Flutter client sends. */
function uploadReq(
  fields: Record<string, string>,
  names: string[] = ["deed.pdf"],
  {
    thumbs = false,
    workspaceId,
    contentType = "application/pdf",
    thumbBytes = 8,
  }: {
    thumbs?: boolean;
    workspaceId?: string;
    contentType?: string;
    thumbBytes?: number;
  } = {},
): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  names.forEach((name, i) => {
    form.append("files", new Blob([new Uint8Array(24)], { type: contentType }), name);
    if (thumbs) {
      form.append(
        `thumb_${i}`,
        new Blob([new Uint8Array(thumbBytes)], { type: "image/webp" }),
        "t.webp",
      );
    }
  });
  const headers = new Headers({ authorization: "Bearer test-token" });
  if (workspaceId) headers.set("x-workspace-id", workspaceId);
  return new Request("http://localhost/api/v1/files", {
    method: "POST",
    body: form,
    headers,
  }) as NextRequest;
}

/** The `Content-Disposition` the route asked R2 to sign into the last URL. */
function lastDisposition(): string | undefined {
  const calls = vi.mocked(signedGetUrl).mock.calls;
  return calls[calls.length - 1]?.[1]?.disposition;
}

/** The `Content-Type` override the route signed into the last URL — what the
 * client actually receives, since the stored object keeps its own header. */
function lastSignedType(): string | undefined {
  const calls = vi.mocked(signedGetUrl).mock.calls;
  return calls[calls.length - 1]?.[1]?.contentType;
}

/** The vault working set as user "a" currently sees it. */
async function vault() {
  const res = await getVault(apiReq("/api/v1/files"));
  expect(res.status).toBe(200);
  return res.json();
}

/** Insert a vault-file row directly, bypassing the upload path — for a row that
 * predates a fix (a type today's upload would resolve) or an exact size. */
async function seedFileRow(
  pid: string,
  {
    name,
    contentType,
    sizeBytes = 24,
    folderId = null,
  }: { name: string; contentType: string; sizeBytes?: number; folderId?: string | null },
): Promise<string> {
  const [row] = await getTestDb()
    .insert(files)
    .values({
      workspaceId: await workspaceIdOf("a"),
      profileId: pid,
      userId: uid("a"),
      folderId,
      r2Key: `vault/test/${crypto.randomUUID()}`,
      name,
      contentType,
      sizeBytes,
    })
    .returning({ id: files.id });
  return row!.id;
}

describe("GET /api/v1/files", () => {
  it("401s without a bearer token", async () => {
    const res = await getVault(apiReq("/api/v1/files", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("returns the working set and lazily creates the predefined folder", async () => {
    await setup();
    const { data, meta } = await vault();
    expect(data.files).toEqual([]);
    expect(data.transactionFiles).toEqual([]);
    expect(data.tags).toEqual([]);
    const system = data.folders.filter((f: { system: boolean }) => f.system);
    expect(system).toHaveLength(1);
    expect(system[0].name).toBe("Transaction attachments");
    expect(meta).toEqual({
      filesCapped: false,
      filesLimit: 500,
      storage: { usedBytes: 0, limitBytes: STORAGE_QUOTA_BYTES },
    });
  });

  // The upload-side fix only reaches new files. Every video already in a vault
  // is application/octet-stream, so the list re-derives the type from the name
  // — otherwise "videos play again" would be false for the whole corpus that
  // reported the bug.
  it("reports the real media type for a file stored before the fix", async () => {
    const pid = await setup();
    await seedFileRow(pid, { name: "holiday.mkv", contentType: "application/octet-stream" });
    const { data } = await vault();
    expect(data.files).toHaveLength(1);
    expect(data.files[0].contentType).toBe("video/x-matroska");
  });

  it("keeps users' vaults isolated", async () => {
    const pid = await setup();
    const created = await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Legal" }),
      }),
    );
    expect(created.status).toBe(201);

    signInAs("b");
    await bootstrapUser("b");
    const { data } = await vault();
    expect(data.folders.some((f: { name: string }) => f.name === "Legal")).toBe(false);
  });
});

describe("folders", () => {
  it("creates, rejects duplicate siblings, renames, and guards subtree moves", async () => {
    const pid = await setup();
    const created = await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Legal", color: "#3b82f6" }),
      }),
    );
    expect(created.status).toBe(201);
    const folder = (await created.json()).data;
    expect(folder.color).toBe("#3b82f6");
    expect(folder.system).toBe(false);

    const dup = await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "legal" }),
      }),
    );
    expect(dup.status).toBe(409);

    const childRes = await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Deeds", parentId: folder.id }),
      }),
    );
    const child = (await childRes.json()).data;
    expect(child.parentId).toBe(folder.id);

    // A folder can't move into its own subtree.
    const cycle = await patchFolder(
      apiReq(`/api/v1/folders/${folder.id}`, {
        method: "PATCH",
        body: jsonBody({ parentId: child.id }),
      }),
      ctx({ id: folder.id }),
    );
    expect(cycle.status).toBe(400);

    const renamed = await patchFolder(
      apiReq(`/api/v1/folders/${folder.id}`, {
        method: "PATCH",
        body: jsonBody({ name: "Legal docs" }),
      }),
      ctx({ id: folder.id }),
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).data.name).toBe("Legal docs");

    // Deleting the parent removes the subtree.
    const del = await deleteFolder(
      apiReq(`/api/v1/folders/${folder.id}`, { method: "DELETE" }),
      ctx({ id: folder.id }),
    );
    expect(del.status).toBe(200);
    const { data } = await vault();
    expect(data.folders.filter((f: { system: boolean }) => !f.system)).toEqual([]);
  });

  it("allows only cosmetic changes on the predefined folder", async () => {
    await setup();
    const { data } = await vault();
    const system = data.folders.find((f: { system: boolean }) => f.system);

    const recolor = await patchFolder(
      apiReq(`/api/v1/folders/${system.id}`, {
        method: "PATCH",
        body: jsonBody({ color: "#ef4444" }),
      }),
      ctx({ id: system.id }),
    );
    expect(recolor.status).toBe(200);

    const rename = await patchFolder(
      apiReq(`/api/v1/folders/${system.id}`, {
        method: "PATCH",
        body: jsonBody({ name: "Renamed" }),
      }),
      ctx({ id: system.id }),
    );
    expect(rename.status).toBe(400);

    const del = await deleteFolder(
      apiReq(`/api/v1/folders/${system.id}`, { method: "DELETE" }),
      ctx({ id: system.id }),
    );
    expect(del.status).toBe(400);
  });

  it("404s an unknown folder", async () => {
    await setup();
    const missing = "00000000-0000-0000-0000-000000000000";
    const res = await deleteFolder(
      apiReq(`/api/v1/folders/${missing}`, { method: "DELETE" }),
      ctx({ id: missing }),
    );
    expect(res.status).toBe(404);
  });
});

describe("file-tags", () => {
  it("creates, lists, rejects duplicates, updates, and detaches on delete", async () => {
    const pid = await setup();
    const created = await createTag(
      apiReq("/api/v1/file-tags", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Legal", color: "#EF4444" }),
      }),
    );
    expect(created.status).toBe(201);
    const tag = (await created.json()).data;
    expect(tag.color).toBe("#ef4444"); // normalized to lowercase

    const dup = await createTag(
      apiReq("/api/v1/file-tags", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "legal", color: "#3b82f6" }),
      }),
    );
    expect(dup.status).toBe(409);

    const badColor = await createTag(
      apiReq("/api/v1/file-tags", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Urgent", color: "red" }),
      }),
    );
    expect(badColor.status).toBe(422);

    const listed = await listTags(apiReq("/api/v1/file-tags"));
    expect((await listed.json()).data).toHaveLength(1);

    const patched = await patchTag(
      apiReq(`/api/v1/file-tags/${tag.id}`, {
        method: "PATCH",
        body: jsonBody({ name: "Statutory" }),
      }),
      ctx({ id: tag.id }),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.name).toBe("Statutory");

    // Attach the tag to a folder, then delete the tag — the folder detaches.
    const folderRes = await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Tagged", tagIds: [tag.id] }),
      }),
    );
    const folder = (await folderRes.json()).data;
    expect(folder.tagIds).toEqual([tag.id]);

    const del = await deleteTag(
      apiReq(`/api/v1/file-tags/${tag.id}`, { method: "DELETE" }),
      ctx({ id: tag.id }),
    );
    expect(del.status).toBe(200);
    const { data } = await vault();
    expect(data.folders.find((f: { id: string }) => f.id === folder.id).tagIds).toEqual([]);
  });
});

describe("file upload + lifecycle", () => {
  it("uploads multipart (with thumbnails), edits, mints URLs, and deletes", async () => {
    const pid = await setup();
    const uploaded = await uploadFiles(
      uploadReq({ profileId: pid }, ["deed.pdf", "survey.pdf"], { thumbs: true }),
    );
    expect(uploaded.status).toBe(201);
    const files = (await uploaded.json()).data;
    expect(files).toHaveLength(2);
    expect(files[0].hasThumbnail).toBe(true);
    // 2 originals + 2 thumbnails hit storage.
    expect(vi.mocked(uploadObject)).toHaveBeenCalledTimes(4);

    const file = files[0];
    const patched = await patchFile(
      apiReq(`/api/v1/files/${file.id}`, {
        method: "PATCH",
        body: jsonBody({ name: "title deed.pdf", category: "land" }),
      }),
      ctx({ id: file.id }),
    );
    expect(patched.status).toBe(200);
    const updated = (await patched.json()).data;
    expect(updated.name).toBe("title deed.pdf");
    expect(updated.category).toBe("land");

    const url = await fileUrl(
      apiReq(`/api/v1/files/${file.id}/url`),
      ctx({ id: file.id }),
    );
    expect(url.status).toBe(200);
    const minted = (await url.json()).data;
    expect(minted.url).toBe("https://signed.example/object");
    expect(minted.fileName).toBe("title deed.pdf");
    expect(minted.contentType).toBe("application/pdf");

    const thumbUrl = await fileUrl(
      apiReq(`/api/v1/files/${file.id}/url?variant=thumb`),
      ctx({ id: file.id }),
    );
    expect((await thumbUrl.json()).data.contentType).toBe("image/webp");

    const del = await deleteFile(
      apiReq(`/api/v1/files/${file.id}`, { method: "DELETE" }),
      ctx({ id: file.id }),
    );
    expect(del.status).toBe(200);
    // The original *and* its preview leave the bucket. A `_thumb` object whose
    // row is gone is unreachable forever — and invisible to the storage meter,
    // which sums the DB, so it would never even show up as usage.
    expect(vi.mocked(deleteObject)).toHaveBeenCalledTimes(2);

    const again = await deleteFile(
      apiReq(`/api/v1/files/${file.id}`, { method: "DELETE" }),
      ctx({ id: file.id }),
    );
    expect(again.status).toBe(404);
  });

  it("deletes the previews of every file in a removed folder's subtree", async () => {
    const pid = await setup();
    const parent = (
      await (
        await createFolder(
          apiReq("/api/v1/folders", {
            method: "POST",
            body: jsonBody({ profileId: pid, name: "Legal" }),
          }),
        )
      ).json()
    ).data;
    const child = (
      await (
        await createFolder(
          apiReq("/api/v1/folders", {
            method: "POST",
            body: jsonBody({ profileId: pid, name: "Deeds", parentId: parent.id }),
          }),
        )
      ).json()
    ).data;
    await uploadFiles(uploadReq({ profileId: pid, folderId: child.id }, ["deed.pdf"], {
      thumbs: true,
    }));

    vi.mocked(deleteObject).mockClear();
    const del = await deleteFolder(
      apiReq(`/api/v1/folders/${parent.id}`, { method: "DELETE" }),
      ctx({ id: parent.id }),
    );
    expect(del.status).toBe(200);
    // One original + one preview, from a file two levels down.
    expect(vi.mocked(deleteObject)).toHaveBeenCalledTimes(2);
    const keys = vi.mocked(deleteObject).mock.calls.map((c) => c[0]);
    expect(keys.some((k) => k.endsWith("_thumb.webp"))).toBe(true);
  });

  it("413s a preview over the size cap, so the per-file cap can't be bypassed", async () => {
    const pid = await setup();
    const res = await uploadFiles(
      uploadReq({ profileId: pid }, ["tiny.pdf"], {
        thumbs: true,
        thumbBytes: 5 * 1024 * 1024 + 1,
      }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
    expect(vi.mocked(uploadObject)).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/files/:id/url — disposition", () => {
  /** Upload one file of `contentType` and mint a URL for it with `query`. */
  async function mintUrl(contentType: string, query = ""): Promise<void> {
    const pid = await setup();
    const uploaded = await uploadFiles(
      uploadReq({ profileId: pid }, [`doc.${contentType.split("/")[1]}`], { contentType }),
    );
    const file = (await uploaded.json()).data[0];
    const res = await fileUrl(
      apiReq(`/api/v1/files/${file.id}/url${query}`),
      ctx({ id: file.id }),
    );
    expect(res.status).toBe(200);
  }

  it("serves an allowlisted type inline", async () => {
    await mintUrl("application/pdf");
    expect(lastDisposition()).toMatch(/^inline; /);
  });

  it("forces a download for a type that is not on the inline allowlist", async () => {
    // The vault takes any well-formed MIME, so a stored HTML/SVG must never be
    // rendered off the R2 origin — that would execute its script in the app's
    // WebView. This is the guard the web route has always had.
    await mintUrl("text/html");
    expect(lastDisposition()).toMatch(/^attachment; /);
  });

  it("honours ?download=1 on an otherwise-inline type", async () => {
    await mintUrl("application/pdf", "?download=1");
    expect(lastDisposition()).toMatch(/^attachment; /);
  });

  it("always serves the generated preview inline", async () => {
    const pid = await setup();
    const uploaded = await uploadFiles(
      uploadReq({ profileId: pid }, ["page.html"], { contentType: "text/html", thumbs: true }),
    );
    const file = (await uploaded.json()).data[0];
    const res = await fileUrl(
      apiReq(`/api/v1/files/${file.id}/url?variant=thumb`),
      ctx({ id: file.id }),
    );
    expect(res.status).toBe(200);
    // The preview is webp we generated, not the uploaded bytes.
    expect(lastDisposition()).toMatch(/^inline; /);
  });

  it("corrects a pre-fix octet-stream row and restates the type on the URL", async () => {
    const pid = await setup();
    const id = await seedFileRow(pid, {
      name: "holiday.mkv",
      contentType: "application/octet-stream",
    });
    const res = await fileUrl(apiReq(`/api/v1/files/${id}/url`), ctx({ id }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.contentType).toBe("video/x-matroska");
    expect(lastDisposition()).toMatch(/^inline; /);
    // The object in the bucket still carries the type it was PUT with, and on a
    // presigned URL that header is what the client obeys — without the override
    // the app would be handed an anonymous binary to play.
    expect(lastSignedType()).toBe("video/x-matroska");
  });

  it("rejects an upload without profileId and one into the predefined folder", async () => {
    const pid = await setup();
    const noProfile = await uploadFiles(uploadReq({}));
    expect(noProfile.status).toBe(400);

    const { data } = await vault();
    const system = data.folders.find((f: { system: boolean }) => f.system);
    const intoSystem = await uploadFiles(uploadReq({ profileId: pid, folderId: system.id }));
    expect(intoSystem.status).toBe(400);
  });
});

describe("storage quota", () => {
  /** Seed a vault-file row of `sizeBytes` directly — the quota reads the DB,
   * so no actual bytes are involved. */
  async function seedVaultFile(pid: string, sizeBytes: number): Promise<void> {
    await seedFileRow(pid, {
      name: "big.bin",
      contentType: "application/octet-stream",
      sizeBytes,
    });
  }

  it("reports vault files + transaction attachments in meta.storage", async () => {
    const pid = await setup();
    await uploadFiles(uploadReq({ profileId: pid }, ["deed.pdf", "survey.pdf"]));

    // An attachment draws from the same workspace pool as vault files.
    const txnId = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-08-01",
    });
    await getTestDb()
      .insert(transactionAttachments)
      .values({
        transactionId: txnId,
        profileId: pid,
        workspaceId: await workspaceIdOf("a"),
        userId: uid("a"),
        r2Key: `attachments/test/${crypto.randomUUID()}`,
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      });

    const { meta } = await vault();
    // Two 24-byte uploads + the 1000-byte attachment.
    expect(meta.storage).toEqual({ usedBytes: 1048, limitBytes: STORAGE_QUOTA_BYTES });
  });

  it("413s an upload that would exceed the quota, before touching storage", async () => {
    const pid = await setup();
    await seedVaultFile(pid, STORAGE_QUOTA_BYTES - 10);

    const res = await uploadFiles(uploadReq({ profileId: pid }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("storage_quota_exceeded");
    expect(vi.mocked(uploadObject)).not.toHaveBeenCalled();
  });

  it("checks the batch as a whole, not each file alone", async () => {
    const pid = await setup();
    // 30 bytes left: either 24-byte file fits alone, the pair doesn't.
    await seedVaultFile(pid, STORAGE_QUOTA_BYTES - 30);

    const res = await uploadFiles(uploadReq({ profileId: pid }, ["a.pdf", "b.pdf"]));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("storage_quota_exceeded");
  });

  it("accepts an upload that exactly fills the quota", async () => {
    const pid = await setup();
    await seedVaultFile(pid, STORAGE_QUOTA_BYTES - 24);

    const res = await uploadFiles(uploadReq({ profileId: pid }));
    expect(res.status).toBe(201);
  });
});

describe("file-shares", () => {
  it("creates, lists, and revokes links; guards target selection", async () => {
    const pid = await setup();
    const uploaded = await uploadFiles(uploadReq({ profileId: pid }));
    const file = (await uploaded.json()).data[0];

    const created = await createShare(
      apiReq("/api/v1/file-shares", {
        method: "POST",
        body: jsonBody({ fileId: file.id, allowDownload: false, expiresInDays: 7 }),
      }),
    );
    expect(created.status).toBe(201);
    const share = (await created.json()).data;
    expect(share.sharePath).toBe(`/share/${share.token}`);
    expect(share.allowDownload).toBe(false);
    expect(share.expiresAt).not.toBeNull();

    const both = await createShare(
      apiReq("/api/v1/file-shares", {
        method: "POST",
        body: jsonBody({ fileId: file.id, folderId: file.id }),
      }),
    );
    expect(both.status).toBe(422);

    const listed = await listShares(apiReq(`/api/v1/file-shares?fileId=${file.id}`));
    expect(listed.status).toBe(200);
    expect((await listed.json()).data).toHaveLength(1);

    const revoked = await deleteShare(
      apiReq(`/api/v1/file-shares/${share.id}`, { method: "DELETE" }),
      ctx({ id: share.id }),
    );
    expect(revoked.status).toBe(200);
    const again = await deleteShare(
      apiReq(`/api/v1/file-shares/${share.id}`, { method: "DELETE" }),
      ctx({ id: share.id }),
    );
    expect(again.status).toBe(404);
  });

  it("omits expired links from the list", async () => {
    const pid = await setup();
    const uploaded = await uploadFiles(uploadReq({ profileId: pid }));
    const file = (await uploaded.json()).data[0];

    const live = await createShare(
      apiReq("/api/v1/file-shares", {
        method: "POST",
        body: jsonBody({ fileId: file.id }),
      }),
    );
    const stale = await createShare(
      apiReq("/api/v1/file-shares", {
        method: "POST",
        body: jsonBody({ fileId: file.id, expiresInDays: 1 }),
      }),
    );
    const staleId = (await stale.json()).data.id;
    // Age it past its expiry — the token stops resolving on the share page, so
    // handing the client a link for it would offer a guaranteed 404.
    await getTestDb()
      .update(fileShares)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fileShares.id, staleId));

    const listed = await listShares(apiReq(`/api/v1/file-shares?fileId=${file.id}`));
    const data = (await listed.json()).data;
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe((await live.json()).data.id);
  });

  it("422s a list query with neither target or both", async () => {
    const pid = await setup();
    const uploaded = await uploadFiles(uploadReq({ profileId: pid }));
    const file = (await uploaded.json()).data[0];

    const neither = await listShares(apiReq("/api/v1/file-shares"));
    expect(neither.status).toBe(422);

    // Answering for whichever we checked first would return a file's links to
    // a caller who believes they asked about a folder.
    const both = await listShares(
      apiReq(`/api/v1/file-shares?fileId=${file.id}&folderId=${file.id}`),
    );
    expect(both.status).toBe(422);
  });

  it("refuses to share the predefined folder", async () => {
    await setup();
    const { data } = await vault();
    const system = data.folders.find((f: { system: boolean }) => f.system);
    const res = await createShare(
      apiReq("/api/v1/file-shares", {
        method: "POST",
        body: jsonBody({ folderId: system.id }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("share link content — what a view-only link will serve", () => {
  /** A public share-content request: no session, the token is the whole auth. */
  const shareReq = (token: string, fileId: string, query = ""): NextRequest =>
    new Request(`http://localhost/api/share/${token}/file/${fileId}${query}`) as NextRequest;

  /** Seed one file, share it (as a file link, or inside a shared folder), and
   * return what the public route needs. */
  async function shared({
    name,
    contentType = "application/octet-stream",
    allowDownload,
    viaFolder = false,
  }: {
    name: string;
    contentType?: string;
    allowDownload: boolean;
    viaFolder?: boolean;
  }): Promise<{ token: string; fileId: string }> {
    const pid = await setup();
    let folderId: string | null = null;
    if (viaFolder) {
      const created = await createFolder(
        apiReq("/api/v1/folders", {
          method: "POST",
          body: jsonBody({ profileId: pid, name: "Recordings" }),
        }),
      );
      folderId = (await created.json()).data.id;
    }
    const fileId = await seedFileRow(pid, { name, contentType, folderId });
    const share = await createShare(
      apiReq("/api/v1/file-shares", {
        method: "POST",
        body: jsonBody(viaFolder ? { folderId, allowDownload } : { fileId, allowDownload }),
      }),
    );
    expect(share.status).toBe(201);
    return { token: (await share.json()).data.token, fileId };
  }

  // The failure this guards: a folder shared view-only, containing a container
  // no engine renders. Serving it inline doesn't show a dead player — the
  // browser writes the file to the recipient's Downloads folder, which is the
  // one thing `allowDownload: false` promises can't happen.
  it("refuses the bytes of a container no browser renders", async () => {
    const { token, fileId } = await shared({
      name: "contract-recording.wmv",
      allowDownload: false,
      viaFolder: true,
    });
    const res = await shareFileBytes(shareReq(token, fileId), ctx({ token, fileId }));
    expect(res.status).toBe(403);
    expect(vi.mocked(signedGetUrl)).not.toHaveBeenCalled();
  });

  it("still previews media the browser can play, with the corrected type", async () => {
    const { token, fileId } = await shared({ name: "clip.mp4", allowDownload: false });
    const res = await shareFileBytes(shareReq(token, fileId), ctx({ token, fileId }));
    expect(res.status).toBe(302);
    expect(lastDisposition()).toMatch(/^inline; /);
    expect(lastSignedType()).toBe("video/mp4");
  });

  it("keeps refusing ?download=1 on a view-only link", async () => {
    const { token, fileId } = await shared({ name: "clip.mp4", allowDownload: false });
    const res = await shareFileBytes(
      shareReq(token, fileId, "?download=1"),
      ctx({ token, fileId }),
    );
    expect(res.status).toBe(403);
  });

  // A download-allowed link may serve it, but it's labelled for what it is
  // rather than pretending to preview.
  it("serves an unrenderable container as an attachment when downloads are allowed", async () => {
    const { token, fileId } = await shared({ name: "wedding.avi", allowDownload: true });
    const res = await shareFileBytes(shareReq(token, fileId), ctx({ token, fileId }));
    expect(res.status).toBe(302);
    expect(lastDisposition()).toMatch(/^attachment; /);
    expect(lastSignedType()).toBe("video/x-msvideo");
  });

  it("404s a file the token doesn't cover, whatever its type", async () => {
    const { token } = await shared({ name: "clip.mp4", allowDownload: false });
    const other = await seedFileRow(await firstProfileId("a"), {
      name: "private.mp4",
      contentType: "video/mp4",
    });
    const res = await shareFileBytes(shareReq(token, other), ctx({ token, fileId: other }));
    expect(res.status).toBe(404);
  });
});

describe("RBAC", () => {
  it("lets a granted viewer read the vault but not write to it", async () => {
    const pid = await setup();
    const ws = await workspaceIdOf("a");
    await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Shared docs" }),
      }),
    );

    signInAs("b");
    await bootstrapUser("b");
    await getTestDb()
      .insert(profileAccess)
      .values({ profileId: pid, userId: uid("b"), role: "viewer" });

    const seen = await getVault(
      apiReq("/api/v1/files", { headers: { "x-workspace-id": ws } }),
    );
    expect(seen.status).toBe(200);
    const { data } = await seen.json();
    expect(data.folders.some((f: { name: string }) => f.name === "Shared docs")).toBe(true);

    const write = await createFolder(
      apiReq("/api/v1/folders", {
        method: "POST",
        body: jsonBody({ profileId: pid, name: "Viewer folder" }),
        headers: { "x-workspace-id": ws },
      }),
    );
    expect(write.status).toBe(403);
  });

  it("never writes rows on a viewer's read of the vault", async () => {
    const pid = await setup();
    const ws = await workspaceIdOf("a");

    signInAs("b");
    await bootstrapUser("b");
    await getTestDb()
      .insert(profileAccess)
      .values({ profileId: pid, userId: uid("b"), role: "viewer" });

    // Reading is not a licence to insert into someone else's profile — the
    // predefined folder would otherwise be created here and stamped "b".
    const seen = await getVault(apiReq("/api/v1/files", { headers: { "x-workspace-id": ws } }));
    expect(seen.status).toBe(200);
    expect((await seen.json()).data.folders.some((f: { system: boolean }) => f.system)).toBe(
      false,
    );
    expect(await getTestDb().select().from(folders)).toEqual([]);

    // An editor's read materializes it, attributed to them.
    signInAs("a");
    const { data } = await vault();
    const system = data.folders.find((f: { system: boolean }) => f.system);
    expect(system.createdByName).toBe("a");
  });
});
