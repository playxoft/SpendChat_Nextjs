import { describe, it, expect } from "vitest";
import {
  FILE_INLINE_TYPES,
  STORAGE_QUOTA_BYTES,
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
  computeFolderSizes,
  contentDisposition,
  fileTypeLabel,
  formatStorageCompact,
  profileAccentColor,
  serializeFile,
  serializeFileShare,
  serializeFolder,
  serializeTag,
  storageUsageTone,
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

describe("storageUsageTone — thresholds for the storage ring", () => {
  const LIMIT = STORAGE_QUOTA_BYTES;

  it("is a flat 1 GB", () => {
    expect(STORAGE_QUOTA_BYTES).toBe(1_073_741_824);
  });

  it("stays ok below 85% of the quota", () => {
    expect(storageUsageTone(0, LIMIT)).toBe("ok");
    expect(storageUsageTone(LIMIT * 0.5, LIMIT)).toBe("ok");
    expect(storageUsageTone(LIMIT * 0.85 - 1, LIMIT)).toBe("ok");
  });

  it("warns from exactly 85%", () => {
    expect(storageUsageTone(LIMIT * 0.85, LIMIT)).toBe("warn");
    expect(storageUsageTone(LIMIT * 0.99, LIMIT)).toBe("warn");
  });

  it("is full at and past the quota", () => {
    expect(storageUsageTone(LIMIT, LIMIT)).toBe("full");
    expect(storageUsageTone(LIMIT + 1, LIMIT)).toBe("full");
  });
});

describe("formatStorageCompact — the at-a-glance '0.1/1 GB' label", () => {
  const GIB = 1024 ** 3;

  it("rounds used space to one decimal of a GB", () => {
    expect(formatStorageCompact(0, GIB)).toBe("0.0/1 GB");
    expect(formatStorageCompact(0.1 * GIB, GIB)).toBe("0.1/1 GB");
    expect(formatStorageCompact(0.55 * GIB, GIB)).toBe("0.6/1 GB");
    expect(formatStorageCompact(GIB, GIB)).toBe("1.0/1 GB");
  });

  it("trims the limit of trailing zeros", () => {
    expect(formatStorageCompact(0, 2 * GIB)).toBe("0.0/2 GB");
    expect(formatStorageCompact(0, 1.5 * GIB)).toBe("0.0/1.5 GB");
  });
});

describe("computeFolderSizes — descendant totals from the working set", () => {
  const folder = (id: string, parentId: string | null = null, system = false) => ({
    id,
    parentId,
    profileId: "p1",
    system,
  });
  const file = (folderId: string | null, sizeBytes: number) => ({ folderId, sizeBytes });

  it("credits files to their folder and every ancestor", () => {
    const sizes = computeFolderSizes(
      [folder("root"), folder("child", "root"), folder("grand", "child")],
      [file("grand", 100), file("child", 10), file("root", 1)],
      [],
    );
    expect(sizes.get("grand")).toBe(100);
    expect(sizes.get("child")).toBe(110);
    expect(sizes.get("root")).toBe(111);
  });

  it("ignores root-level files and leaves empty folders unset", () => {
    const sizes = computeFolderSizes([folder("a")], [file(null, 500)], []);
    expect(sizes.get("a")).toBeUndefined();
  });

  it("credits transaction files to their profile's system folder", () => {
    const sizes = computeFolderSizes(
      [folder("sys", null, true), { id: "sys2", parentId: null, profileId: "p2", system: true }],
      [],
      [
        { profileId: "p1", sizeBytes: 40 },
        { profileId: "p2", sizeBytes: 7 },
      ],
    );
    expect(sizes.get("sys")).toBe(40);
    expect(sizes.get("sys2")).toBe(7);
  });

  it("survives a parent cycle without hanging", () => {
    const sizes = computeFolderSizes(
      [folder("a", "b"), folder("b", "a")],
      [file("a", 5)],
      [],
    );
    expect(sizes.get("a")).toBe(5);
    expect(sizes.get("b")).toBe(5);
  });
});

describe("contentDisposition — the shared download header", () => {
  it("emits both an ASCII and an RFC 5987 filename", () => {
    expect(contentDisposition("deed.pdf", false)).toBe(
      `attachment; filename="deed.pdf"; filename*=UTF-8''deed.pdf`,
    );
    expect(contentDisposition("deed.pdf", true)).toMatch(/^inline; /);
  });

  it("replaces non-ASCII characters in the plain filename but keeps them encoded", () => {
    const header = contentDisposition("കരാർ.pdf", false);
    expect(header).toContain(`filename="____.pdf"`);
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("കരാർ.pdf")}`);
  });

  it("neutralizes quotes and backslashes so a name can't break out of the header", () => {
    const header = contentDisposition(`ev"il\\.pdf`, false);
    expect(header).toContain(`filename="ev_il_.pdf"`);
    expect(header.match(/"/g)).toHaveLength(2);
  });
});

describe("profileAccentColor — section divider accents", () => {
  it("uses the profile's own color when it's a 6-digit hex", () => {
    expect(profileAccentColor({ id: UUID, color: "#123abc" })).toBe("#123abc");
    expect(profileAccentColor({ id: UUID, color: "#12ABEF" })).toBe("#12ABEF");
  });

  it("falls back to a stable palette pick keyed off the id", () => {
    const first = profileAccentColor({ id: UUID, color: null });
    expect(VAULT_COLORS).toContain(first);
    expect(profileAccentColor({ id: UUID, color: null })).toBe(first);
    // A different id is allowed to collide, but the mapping itself is stable.
    expect(VAULT_COLORS).toContain(profileAccentColor({ id: UUID2, color: null }));
  });

  // `profiles.color` is only length-capped (unlike folder/tag colors), so the
  // API can store anything; the divider appends an alpha suffix to whatever we
  // return, and a non-`#rrggbb` value would leave a half-styled bar.
  it("falls back on any color the alpha suffix can't be appended to", () => {
    const fallback = profileAccentColor({ id: UUID, color: null });
    for (const color of ["rgb(59,130,246)", "#3b8", "blue", "#123abcd", "", "  "]) {
      expect(profileAccentColor({ id: UUID, color })).toBe(fallback);
    }
  });
});
