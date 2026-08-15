import { describe, it, expect } from "vitest";
import { parseUploadForm } from "@/lib/upload-form";
import { ApiError } from "@/lib/errors";

const OPTS = { maxFiles: 3, maxBytes: 100, tooManyMessage: "Too many files" };

const file = (name: string, size: number, type = "application/pdf"): File =>
  new File([new Uint8Array(size)], name, { type });

/** Assert `fn` rejects with an ApiError carrying `status`, and return it. */
async function rejectsWith(fn: () => Promise<unknown>, status: number): Promise<ApiError> {
  const err = await fn().then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  return err as ApiError;
}

describe("parseUploadForm", () => {
  it("reads the repeatable `files` field into parts", async () => {
    const form = new FormData();
    form.append("files", file("a.pdf", 10));
    form.append("files", file("b.pdf", 20, "image/png"));

    const parts = await parseUploadForm(form, OPTS);
    expect(parts).toHaveLength(2);
    expect(parts[0]!.fileName).toBe("a.pdf");
    expect(parts[0]!.size).toBe(10);
    expect(parts[0]!.contentType).toBe("application/pdf");
    expect(parts[0]!.bytes.byteLength).toBe(10);
    expect(parts[1]!.contentType).toBe("image/png");
    expect(parts.every((p) => p.thumbnail === undefined)).toBe(true);
  });

  it("accepts the `file` alias, ordering `files` entries first", async () => {
    const form = new FormData();
    form.append("file", file("alias.pdf", 1));
    form.append("files", file("plural.pdf", 2));

    const parts = await parseUploadForm(form, OPTS);
    expect(parts.map((p) => p.fileName)).toEqual(["plural.pdf", "alias.pdf"]);
  });

  it("reports a missing content type as null", async () => {
    const form = new FormData();
    form.append("files", file("unknown.bin", 4, ""));
    const [part] = await parseUploadForm(form, OPTS);
    expect(part!.contentType).toBeNull();
  });

  it("400s an empty request and one over the file count", async () => {
    await rejectsWith(() => parseUploadForm(new FormData(), OPTS), 400);

    const onlyText = new FormData();
    onlyText.append("files", "not-a-file");
    await rejectsWith(() => parseUploadForm(onlyText, OPTS), 400);

    const tooMany = new FormData();
    for (let i = 0; i <= OPTS.maxFiles; i++) tooMany.append("files", file(`${i}.pdf`, 1));
    const err = await rejectsWith(() => parseUploadForm(tooMany, OPTS), 400);
    expect(err.message).toBe("Too many files");
  });

  it("413s a file over the byte cap before reading it", async () => {
    const form = new FormData();
    form.append("files", file("big.pdf", OPTS.maxBytes + 1));
    const err = await rejectsWith(() => parseUploadForm(form, OPTS), 413);
    expect(err.code).toBe("payload_too_large");
  });

  it("pairs previews by `thumb_<ordinal>` and defaults their type to webp", async () => {
    const form = new FormData();
    form.append("files", file("a.pdf", 5));
    form.append("files", file("b.pdf", 5));
    form.append("thumb_0", new File([new Uint8Array(3)], "a.webp", { type: "image/webp" }));
    form.append("thumb_1", new File([new Uint8Array(4)], "b.webp", { type: "" }));

    const parts = await parseUploadForm(form, OPTS);
    expect(parts[0]!.thumbnail?.bytes.byteLength).toBe(3);
    expect(parts[0]!.thumbnail?.contentType).toBe("image/webp");
    expect(parts[1]!.thumbnail?.bytes.byteLength).toBe(4);
    // An untyped preview part still lands as webp, not "".
    expect(parts[1]!.thumbnail?.contentType).toBe("image/webp");
  });

  it("ignores a zero-byte preview", async () => {
    const form = new FormData();
    form.append("files", file("a.pdf", 5));
    form.append("thumb_0", new File([], "empty.webp", { type: "image/webp" }));
    const [part] = await parseUploadForm(form, OPTS);
    expect(part!.thumbnail).toBeUndefined();
  });

  it("caps previews at the same size as originals", async () => {
    const form = new FormData();
    form.append("files", file("small.pdf", 1));
    form.append(
      "thumb_0",
      new File([new Uint8Array(OPTS.maxBytes + 1)], "huge.webp", { type: "image/webp" }),
    );
    // Without this the per-file cap is bypassable: a 1-byte file plus a giant
    // "preview" stores unbounded bytes against a documented 5 MB contract.
    await rejectsWith(() => parseUploadForm(form, OPTS), 413);
  });

  it("keeps preview pairing stable when a non-file part is interleaved", async () => {
    const form = new FormData();
    form.append("files", "stray-string"); // ordinal 0 — dropped, but not renumbered
    form.append("files", file("real.pdf", 5));
    form.append("thumb_1", new File([new Uint8Array(7)], "real.webp", { type: "image/webp" }));

    const parts = await parseUploadForm(form, OPTS);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.fileName).toBe("real.pdf");
    expect(parts[0]!.thumbnail?.bytes.byteLength).toBe(7);
  });
});
