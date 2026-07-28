import { describe, it, expect } from "vitest";
import { resolveAttachmentType } from "@/lib/validation";
import {
  attachmentDisplayName,
  attachmentTypeLabel,
  formatFileSize,
  isImageContentType,
  serializeAttachment,
} from "@/lib/attachments";

describe("resolveAttachmentType — the upload allowlist", () => {
  it("accepts each allowed MIME type and maps it to an extension", () => {
    const cases: [string, string][] = [
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["image/gif", "gif"],
      ["application/pdf", "pdf"],
      ["application/msword", "doc"],
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
      ["application/vnd.ms-excel", "xls"],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
      ["text/csv", "csv"],
      ["text/plain", "txt"],
    ];
    for (const [mime, ext] of cases) {
      expect(resolveAttachmentType(`file.${ext}`, mime)).toEqual({ contentType: mime, ext });
    }
  });

  it("falls back to the filename extension when the browser sends a generic type", () => {
    expect(resolveAttachmentType("invoice.docx", "application/octet-stream")).toEqual({
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: "docx",
    });
    expect(resolveAttachmentType("receipt.pdf", "")).toEqual({
      contentType: "application/pdf",
      ext: "pdf",
    });
    // Extension match is case-insensitive.
    expect(resolveAttachmentType("SCAN.PDF", null)).toEqual({
      contentType: "application/pdf",
      ext: "pdf",
    });
  });

  it("ignores MIME parameters like charset", () => {
    expect(resolveAttachmentType("data.csv", "text/csv; charset=utf-8")).toEqual({
      contentType: "text/csv",
      ext: "csv",
    });
  });

  it("rejects script-carrying and disallowed types (SVG, HTML, video, executables)", () => {
    expect(resolveAttachmentType("logo.svg", "image/svg+xml")).toBeNull();
    expect(resolveAttachmentType("page.html", "text/html")).toBeNull();
    expect(resolveAttachmentType("clip.mp4", "video/mp4")).toBeNull();
    expect(resolveAttachmentType("song.mp3", "audio/mpeg")).toBeNull();
    expect(resolveAttachmentType("app.exe", "application/x-msdownload")).toBeNull();
    expect(resolveAttachmentType("archive.zip", "application/zip")).toBeNull();
  });

  it("rejects an unknown extension with an unknown type", () => {
    expect(resolveAttachmentType("mystery.xyz", "application/octet-stream")).toBeNull();
    expect(resolveAttachmentType("noext", "")).toBeNull();
  });
});

describe("attachment display helpers", () => {
  it("labels content types for the tile", () => {
    expect(attachmentTypeLabel("application/pdf")).toBe("PDF");
    expect(attachmentTypeLabel("image/jpeg")).toBe("JPEG");
    expect(
      attachmentTypeLabel(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("Word");
    expect(
      attachmentTypeLabel(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("Excel");
    expect(attachmentTypeLabel("application/x-unknown")).toBe("File");
  });

  it("detects image content types", () => {
    expect(isImageContentType("image/png")).toBe(true);
    expect(isImageContentType("application/pdf")).toBe(false);
  });

  it("formats byte sizes compactly", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(1_500_000)).toBe("1.4 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("prefers a custom label over the filename", () => {
    expect(attachmentDisplayName({ label: "March rent", fileName: "scan_001.pdf" })).toBe(
      "March rent",
    );
    expect(attachmentDisplayName({ label: null, fileName: "scan_001.pdf" })).toBe("scan_001.pdf");
    expect(attachmentDisplayName({ label: "   ", fileName: "scan_001.pdf" })).toBe("scan_001.pdf");
  });
});

describe("serializeAttachment", () => {
  it("maps a row to the DTO, ISO-formats the timestamp, and derives hasThumbnail", () => {
    const createdAt = new Date("2026-07-22T10:00:00.000Z");
    const dto = serializeAttachment({
      id: "att-1",
      transactionId: "txn-1",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
      kind: "receipt",
      label: null,
      thumbnailKey: null,
      createdAt,
    });
    expect(dto).toEqual({
      id: "att-1",
      transactionId: "txn-1",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
      kind: "receipt",
      label: null,
      hasThumbnail: false,
      createdAt: "2026-07-22T10:00:00.000Z",
    });
  });

  it("sets hasThumbnail true when a thumbnail key is present", () => {
    const dto = serializeAttachment({
      id: "att-2",
      transactionId: "txn-1",
      fileName: "photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 900,
      kind: null,
      label: null,
      thumbnailKey: "attachments/w/t/abc_thumb.webp",
      createdAt: "2026-07-22T10:00:00.000Z",
    });
    expect(dto.hasThumbnail).toBe(true);
  });
});
