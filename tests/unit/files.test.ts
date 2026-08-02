import { describe, it, expect } from "vitest";
import {
  FILE_INLINE_TYPES,
  createFileShareSchema,
  createFolderSchema,
  createTagSchema,
  resolveFileType,
  tagIdsSchema,
  updateFileSchema,
  vaultColorSchema,
} from "@/lib/validation";
import {
  FILE_CATEGORY_LABELS,
  VAULT_COLORS,
  fileTypeLabel,
  serializeFile,
  serializeFileShare,
  serializeFolder,
  serializeTag,
} from "@/lib/files";
import { FILE_CATEGORIES } from "@/lib/validation";

const UUID = "0198f6a2-0000-7000-8000-000000000000";
const UUID2 = "0198f6a2-0000-7000-8000-000000000001";

describe("resolveFileType — the vault's permissive resolver", () => {
  it("trusts a well-formed declared MIME type, taking the ext from the name", () => {
    expect(resolveFileType("clip.mp4", "video/mp4")).toEqual({
      contentType: "video/mp4",
      ext: "mp4",
    });
    expect(resolveFileType("scan.pdf", "application/pdf; charset=binary")).toEqual({
      contentType: "application/pdf",
      ext: "pdf",
    });
  });

  it("accepts types the attachments allowlist rejects (video, zip, even svg)", () => {
    expect(resolveFileType("archive.zip", "application/zip").contentType).toBe("application/zip");
    expect(resolveFileType("logo.svg", "image/svg+xml").contentType).toBe("image/svg+xml");
    // ...but nothing outside the inline set is ever served inline.
    expect(FILE_INLINE_TYPES.has("image/svg+xml")).toBe(false);
    expect(FILE_INLINE_TYPES.has("text/html")).toBe(false);
  });

  it("maps a known type to its extension when the filename has none", () => {
    expect(resolveFileType("recording", "audio/mpeg")).toEqual({
      contentType: "audio/mpeg",
      ext: "mp3",
    });
  });

  it("falls back to the extension's canonical type for octet-stream, else bin", () => {
    expect(resolveFileType("invoice.docx", "application/octet-stream")).toEqual({
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: "docx",
    });
    expect(resolveFileType("mystery", "")).toEqual({
      contentType: "application/octet-stream",
      ext: "bin",
    });
    expect(resolveFileType("weird.???", "not a mime")).toEqual({
      contentType: "application/octet-stream",
      ext: "bin",
    });
  });
});

describe("tags — entity schemas + palette", () => {
  it("tagIdsSchema dedupes and rejects non-uuids", () => {
    expect(tagIdsSchema.parse([UUID, UUID, UUID2])).toEqual([UUID, UUID2]);
    expect(tagIdsSchema.safeParse(["legal"]).success).toBe(false);
  });

  it("createTagSchema needs a profile, a name, and a hex color", () => {
    expect(
      createTagSchema.safeParse({ profileId: UUID, name: "Legal", color: "#ef4444" }).success,
    ).toBe(true);
    expect(
      createTagSchema.safeParse({ profileId: UUID, name: "", color: "#ef4444" }).success,
    ).toBe(false);
    expect(
      createTagSchema.safeParse({ profileId: UUID, name: "Legal", color: "red" }).success,
    ).toBe(false);
  });

  it("every palette swatch passes the color schema", () => {
    for (const color of VAULT_COLORS) {
      expect(vaultColorSchema.safeParse(color).success).toBe(true);
    }
    expect(vaultColorSchema.safeParse("#12345g").success).toBe(false);
  });
});

describe("share + folder input schemas", () => {
  it("requires exactly one of fileId/folderId on a share", () => {
    expect(createFileShareSchema.safeParse({ fileId: UUID }).success).toBe(true);
    expect(createFileShareSchema.safeParse({ folderId: UUID }).success).toBe(true);
    expect(createFileShareSchema.safeParse({}).success).toBe(false);
    expect(createFileShareSchema.safeParse({ fileId: UUID, folderId: UUID }).success).toBe(false);
  });

  it("defaults a share to downloadable with no expiry", () => {
    const parsed = createFileShareSchema.parse({ fileId: UUID });
    expect(parsed.allowDownload).toBe(true);
    expect(parsed.expiresInDays ?? null).toBeNull();
  });

  it("folder create needs a profile + non-empty name; file update accepts null folder (root)", () => {
    expect(createFolderSchema.safeParse({ profileId: UUID, name: "  " }).success).toBe(false);
    expect(
      createFolderSchema.safeParse({ profileId: UUID, name: "Land", color: "#3b82f6" }).success,
    ).toBe(true);
    expect(updateFileSchema.safeParse({ id: UUID, folderId: null }).success).toBe(true);
    expect(updateFileSchema.safeParse({ id: UUID, category: "not-a-category" }).success).toBe(false);
  });
});

describe("lib/files display helpers", () => {
  it("labels every preset category", () => {
    for (const c of FILE_CATEGORIES) {
      expect(FILE_CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  it("labels media and archive types the attachments label map doesn't know", () => {
    expect(fileTypeLabel("video/mp4")).toBe("Video");
    expect(fileTypeLabel("audio/mpeg")).toBe("Audio");
    expect(fileTypeLabel("application/zip")).toBe("ZIP");
    expect(fileTypeLabel("application/pdf")).toBe("PDF");
    expect(fileTypeLabel("application/x-unknown")).toBe("File");
  });

  it("serializers emit ISO dates and never leak the R2 key", () => {
    const createdAt = new Date("2026-07-30T10:00:00Z");
    const file = serializeFile({
      id: "f",
      profileId: "p",
      folderId: null,
      name: "deed.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
      category: "land",
      tagIds: [UUID],
      thumbnailKey: "vault/x/y/z_thumb.webp",
      createdAt,
    });
    expect(file.createdAt).toBe(createdAt.toISOString());
    expect(file.hasThumbnail).toBe(true);
    expect(file.tagIds).toEqual([UUID]);
    expect("r2Key" in file).toBe(false);
    expect("thumbnailKey" in file).toBe(false);

    const folder = serializeFolder({
      id: "d",
      profileId: "p",
      parentId: null,
      name: "Transaction attachments",
      color: "#3b82f6",
      systemKey: "transactions",
      tagIds: [],
      createdAt,
      updatedAt: createdAt,
    });
    expect(folder.system).toBe(true);
    expect(folder.color).toBe("#3b82f6");
    expect(folder.createdAt).toBe(createdAt.toISOString());
    expect(folder.updatedAt).toBe(createdAt.toISOString());
    expect(folder.createdByName).toBeNull();

    const tag = serializeTag({
      id: "t",
      profileId: "p",
      name: "Legal",
      color: "#ef4444",
      createdAt,
      updatedAt: createdAt,
    });
    expect(tag.updatedAt).toBe(createdAt.toISOString());

    const share = serializeFileShare({
      id: "s",
      fileId: "f",
      folderId: null,
      token: "t",
      allowDownload: false,
      expiresAt: null,
      createdAt,
    });
    expect(share.expiresAt).toBeNull();
    expect(share.allowDownload).toBe(false);
  });
});
