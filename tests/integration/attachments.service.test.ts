import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock only the R2 edge — everything else (RBAC, DB, validation) runs for real.
vi.mock("@/lib/r2", () => ({
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { uploadObject, deleteObject } from "@/lib/r2";
import { files, profileAccess, transactionAttachments, transactions } from "@/db/schema";
import {
  createAttachments,
  deleteAttachment,
  getAttachmentForDownload,
  listAttachments,
  updateAttachment,
  type AttachmentUpload,
} from "@/services/attachments";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_TRANSACTION,
  STORAGE_QUOTA_BYTES,
} from "@/lib/validation";
import { bootstrapUser, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";

function mkFile(name: string, type: string, size = 8): AttachmentUpload {
  return { fileName: name, contentType: type, bytes: new Uint8Array(size).buffer, size };
}

/** An image upload carrying a (pre-generated) thumbnail, as the route would build. */
function mkImage(name: string): AttachmentUpload {
  return {
    fileName: name,
    contentType: "image/jpeg",
    bytes: new Uint8Array(64).buffer,
    size: 64,
    thumbnail: { bytes: new Uint8Array(16).buffer, contentType: "image/webp" },
  };
}

/** Bootstrap owner "a" and give them a transaction to attach to. */
async function setup() {
  await bootstrapUser("a");
  const ws = await workspaceIdOf("a");
  const pid = await firstProfileId("a");
  const txn = await insertTxn("a", { type: "expense", amountMinor: 1000, occurredOn: "2026-06-01" });
  return { ws, pid, txn };
}

/** Register `alias` and grant them `role` on `profileId`. */
async function grant(alias: string, profileId: string, role: "viewer" | "editor" | "admin") {
  await bootstrapUser(alias);
  await getTestDb().insert(profileAccess).values({ profileId, userId: uid(alias), role });
}

describe("createAttachments", () => {
  it("stores files under a workspace/transaction-scoped key and denormalizes access columns", async () => {
    const { ws, pid, txn } = await setup();
    const created = await createAttachments(uid("a"), ws, txn, [
      mkFile("receipt.pdf", "application/pdf", 12),
    ]);

    expect(created).toHaveLength(1);
    const dto = created[0]!;
    expect(dto.fileName).toBe("receipt.pdf");
    expect(dto.contentType).toBe("application/pdf");
    expect(dto.sizeBytes).toBe(12);
    expect(dto.kind).toBeNull();
    expect(dto.label).toBeNull();

    expect(uploadObject).toHaveBeenCalledTimes(1);
    const key = vi.mocked(uploadObject).mock.calls[0]![0];
    expect(key).toMatch(new RegExp(`^attachments/${ws}/${txn}/[0-9a-f-]+\\.pdf$`));

    const [row] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.id, dto.id));
    expect(row!.profileId).toBe(pid);
    expect(row!.workspaceId).toBe(ws);
    expect(row!.userId).toBe(uid("a"));
    expect(row!.r2Key).toBe(key);
  });

  it("stores a thumbnail for an image and reports hasThumbnail", async () => {
    const { ws, txn } = await setup();
    const [dto] = await createAttachments(uid("a"), ws, txn, [mkImage("photo.jpg")]);
    expect(dto!.hasThumbnail).toBe(true);
    // Two objects go to R2: the original and the `_thumb` preview.
    expect(uploadObject).toHaveBeenCalledTimes(2);
    const keys = vi.mocked(uploadObject).mock.calls.map((c) => c[0]);
    expect(keys.some((k) => k.endsWith("_thumb.webp"))).toBe(true);

    const [row] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.id, dto!.id));
    expect(row!.thumbnailKey).toMatch(/_thumb\.webp$/);

    // Deleting removes both the original and the thumbnail.
    await deleteAttachment(uid("a"), ws, dto!.id);
    expect(deleteObject).toHaveBeenCalledWith(row!.r2Key);
    expect(deleteObject).toHaveBeenCalledWith(row!.thumbnailKey);
  });

  it("rejects a batch that would exceed the workspace storage quota, before R2", async () => {
    const { ws, pid, txn } = await setup();
    // Vault files and attachments share the pool — seed it nearly full.
    await getTestDb()
      .insert(files)
      .values({
        workspaceId: ws,
        profileId: pid,
        userId: uid("a"),
        r2Key: "vault/quota-seed",
        name: "big.bin",
        contentType: "application/octet-stream",
        sizeBytes: STORAGE_QUOTA_BYTES - 4,
      });

    await expect(
      createAttachments(uid("a"), ws, txn, [mkFile("receipt.pdf", "application/pdf", 8)]),
    ).rejects.toMatchObject({ status: 413, code: "storage_quota_exceeded" });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("accepts an upload that exactly fills the quota", async () => {
    const { ws, pid, txn } = await setup();
    await getTestDb()
      .insert(files)
      .values({
        workspaceId: ws,
        profileId: pid,
        userId: uid("a"),
        r2Key: "vault/quota-seed",
        name: "big.bin",
        contentType: "application/octet-stream",
        sizeBytes: STORAGE_QUOTA_BYTES - 8,
      });

    const created = await createAttachments(uid("a"), ws, txn, [
      mkFile("receipt.pdf", "application/pdf", 8),
    ]);
    expect(created).toHaveLength(1);
  });

  it("resolves an office doc sent as octet-stream via its extension", async () => {
    const { ws, txn } = await setup();
    const [dto] = await createAttachments(uid("a"), ws, txn, [
      mkFile("statement.xlsx", "application/octet-stream"),
    ]);
    expect(dto!.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("rejects an unsupported (script-carrying) type before uploading", async () => {
    const { ws, txn } = await setup();
    await expect(
      createAttachments(uid("a"), ws, txn, [mkFile("logo.svg", "image/svg+xml")]),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects files larger than 5 MB", async () => {
    const { ws, txn } = await setup();
    const big = mkFile("big.pdf", "application/pdf");
    big.size = ATTACHMENT_MAX_BYTES + 1;
    await expect(createAttachments(uid("a"), ws, txn, [big])).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("enforces the per-transaction count cap", async () => {
    const { ws, txn } = await setup();
    const full = Array.from({ length: ATTACHMENT_MAX_PER_TRANSACTION }, (_, i) =>
      mkFile(`f${i}.pdf`, "application/pdf"),
    );
    await createAttachments(uid("a"), ws, txn, full);
    await expect(
      createAttachments(uid("a"), ws, txn, [mkFile("one-too-many.pdf", "application/pdf")]),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("requires editor: a viewer is forbidden, a stranger 404s, a foreign workspace 404s", async () => {
    const { ws, pid, txn } = await setup();
    await grant("b", pid, "viewer");
    await bootstrapUser("c"); // no access at all

    await expect(
      createAttachments(uid("b"), ws, txn, [mkFile("r.pdf", "application/pdf")]),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      createAttachments(uid("c"), ws, txn, [mkFile("r.pdf", "application/pdf")]),
    ).rejects.toMatchObject({ code: "not_found" });

    // Owner but wrong workspace id → the transaction reads as not-here.
    const otherWs = await workspaceIdOf("c");
    await expect(
      createAttachments(uid("a"), otherWs, txn, [mkFile("r.pdf", "application/pdf")]),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(uploadObject).not.toHaveBeenCalled();
  });
});

describe("listAttachments", () => {
  it("returns files for a viewer and nothing for someone without access", async () => {
    const { ws, pid, txn } = await setup();
    await grant("b", pid, "viewer");
    await bootstrapUser("c");
    await createAttachments(uid("a"), ws, txn, [mkFile("r.pdf", "application/pdf")]);

    expect(await listAttachments(uid("b"), ws, txn)).toHaveLength(1);
    expect(await listAttachments(uid("c"), ws, txn)).toEqual([]);
  });
});

describe("updateAttachment", () => {
  it("renames and tags with PATCH semantics (undefined leaves a field, null clears it)", async () => {
    const { ws, txn } = await setup();
    const [dto] = await createAttachments(uid("a"), ws, txn, [mkFile("r.pdf", "application/pdf")]);

    const tagged = await updateAttachment(uid("a"), ws, dto!.id, {
      label: "March rent",
      kind: "invoice",
    });
    expect(tagged.label).toBe("March rent");
    expect(tagged.kind).toBe("invoice");

    // Only label provided → kind is untouched.
    const cleared = await updateAttachment(uid("a"), ws, dto!.id, { label: null });
    expect(cleared.label).toBeNull();
    expect(cleared.kind).toBe("invoice");
  });

  it("won't let a viewer edit", async () => {
    const { ws, pid, txn } = await setup();
    await grant("b", pid, "viewer");
    const [dto] = await createAttachments(uid("a"), ws, txn, [mkFile("r.pdf", "application/pdf")]);
    await expect(
      updateAttachment(uid("b"), ws, dto!.id, { label: "nope" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("deleteAttachment", () => {
  it("deletes the row and the object for an editor, and is idempotent", async () => {
    const { ws, pid, txn } = await setup();
    await grant("b", pid, "viewer");
    const [dto] = await createAttachments(uid("a"), ws, txn, [mkFile("r.pdf", "application/pdf")]);

    await expect(deleteAttachment(uid("b"), ws, dto!.id)).rejects.toMatchObject({
      code: "forbidden",
    });

    expect(await deleteAttachment(uid("a"), ws, dto!.id)).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^attachments/${ws}/${txn}/`)),
    );
    const rows = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.id, dto!.id));
    expect(rows).toHaveLength(0);

    // Already gone → false, not an error.
    expect(await deleteAttachment(uid("a"), ws, dto!.id)).toBe(false);
  });
});

describe("getAttachmentForDownload", () => {
  it("scopes to the caller's accessible profiles and tolerates a bad id", async () => {
    const { ws, txn } = await setup();
    await bootstrapUser("c");
    const [dto] = await createAttachments(uid("a"), ws, txn, [mkFile("r.pdf", "application/pdf")]);

    const owner = await getAttachmentForDownload(uid("a"), ws, dto!.id);
    expect(owner?.r2Key).toBeTruthy();

    expect(await getAttachmentForDownload(uid("c"), ws, dto!.id)).toBeNull();
    expect(await getAttachmentForDownload(uid("a"), ws, "not-a-uuid")).toBeNull();
  });
});

describe("cascade", () => {
  it("removes attachment rows when the transaction is deleted", async () => {
    const { ws, txn } = await setup();
    await createAttachments(uid("a"), ws, txn, [mkFile("r.pdf", "application/pdf")]);

    await getTestDb().delete(transactions).where(eq(transactions.id, txn));

    const rows = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, txn));
    expect(rows).toHaveLength(0);
  });
});
