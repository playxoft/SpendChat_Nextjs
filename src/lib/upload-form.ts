import { ApiError, badRequest } from "@/lib/errors";

/**
 * The one multipart parser for every upload route — the vault (`/api/files`,
 * `/api/v1/files`) and transaction attachments (`/api/transactions/:id/
 * attachments`, `/api/v1/transactions/:id/attachments`). All four accepted the
 * same form shape and had grown four copies of this logic; the caps differ, so
 * they are arguments.
 *
 * Errors are thrown, never returned: the `/api/v1` routes let `handle()` map
 * them to the error envelope, and the cookie-session routes already funnel a
 * thrown `ApiError` through their own `fail()` helper, so both keep the exact
 * statuses they had (400 for shape, 413 for size).
 */

/**
 * Reject an oversized multipart body from its `Content-Length`, **before**
 * `request.formData()` is awaited.
 *
 * `parseUploadForm` already refuses a part that declares too many bytes, but by
 * the time it can look, the runtime has read the whole body into the isolate:
 * the per-file cap is enforced on a request that has already cost us the
 * memory. A Worker isolate gets 128 MB, so a single authenticated caller
 * posting a body far past what any real upload needs can push it out of memory
 * and take the request down with it. Reading `Content-Length` first turns that
 * into a cheap 413.
 *
 * The bound is what the route could legitimately accept — every file at the cap,
 * plus a same-size preview each — with `SLACK` for multipart framing and the
 * ordinary form fields beside the files. A body with no (or an unparseable)
 * `Content-Length` is let through: chunked uploads are legal, and the per-part
 * checks downstream are still the real limit. This is a floor under memory use,
 * not the size policy.
 */
const SLACK_BYTES = 1024 * 1024;

export function assertUploadBodySize(
  request: Request,
  { maxFiles, maxBytes }: { maxFiles: number; maxBytes: number },
): void {
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return;
  // ×2: each file may carry a client-generated preview of its own.
  if (declared > maxFiles * maxBytes * 2 + SLACK_BYTES) {
    throw new ApiError(413, "payload_too_large", "That upload is too large");
  }
}

/** One parsed part, ready for the service layer (bytes already in memory). */
export type UploadPart = {
  fileName: string;
  contentType: string | null;
  bytes: ArrayBuffer;
  size: number;
  /** The client-generated preview that rode along under `thumb_<ordinal>`. */
  thumbnail?: { bytes: ArrayBuffer; contentType: string };
};

export type ParseUploadFormOptions = {
  /** Max files per request (`FILE_MAX_PER_UPLOAD` / `ATTACHMENT_MAX_PER_TRANSACTION`). */
  maxFiles: number;
  /** Per-file byte cap, applied to previews as well (see below). */
  maxBytes: number;
  /** Message for the over-count rejection — the two features word it differently. */
  tooManyMessage: string;
};

/**
 * Read the files out of a multipart body.
 *
 * Files come from the repeatable `files` field, with `file` accepted as an
 * alias; when both are present the `files` entries are ordered first. A
 * client-generated preview may ride along under `thumb_<ordinal>`, where
 * **`ordinal` is the part's position in that combined list before non-file
 * entries are dropped** — so a stray non-file value (or a mix of both field
 * names) can never shift a preview onto the wrong file.
 *
 * Both the files and their previews are checked against `maxBytes` *before*
 * being read into memory: a preview is bytes we store in R2 and stream through
 * the Worker exactly like an original, so exempting it would make the
 * documented per-file cap meaningless.
 */
export async function parseUploadForm(
  form: FormData,
  { maxFiles, maxBytes, tooManyMessage }: ParseUploadFormOptions,
): Promise<UploadPart[]> {
  const parts = [...form.getAll("files"), ...form.getAll("file")];
  const picked: { file: File; ordinal: number }[] = [];
  parts.forEach((value, ordinal) => {
    if (value instanceof File) picked.push({ file: value, ordinal });
  });

  if (picked.length === 0) throw badRequest("No files were provided");
  if (picked.length > maxFiles) throw badRequest(tooManyMessage);

  const tooLarge = () =>
    new ApiError(
      413,
      "payload_too_large",
      `Each file must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`,
    );

  // Reject by declared size first — nothing is read into memory until every
  // part in the request is known to fit.
  for (const { file, ordinal } of picked) {
    if (file.size > maxBytes) throw tooLarge();
    const thumb = form.get(`thumb_${ordinal}`);
    if (thumb instanceof File && thumb.size > maxBytes) throw tooLarge();
  }

  return Promise.all(
    picked.map(async ({ file, ordinal }) => {
      const thumb = form.get(`thumb_${ordinal}`);
      const thumbnail =
        thumb instanceof File && thumb.size > 0
          ? { bytes: await thumb.arrayBuffer(), contentType: thumb.type || "image/webp" }
          : undefined;
      return {
        fileName: file.name,
        contentType: file.type || null,
        bytes: await file.arrayBuffer(),
        size: file.size,
        thumbnail,
      };
    }),
  );
}
