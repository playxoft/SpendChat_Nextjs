import { ApiError, badRequest } from "@/lib/errors";

/** Multipart framing plus the ordinary form fields sent beside the files. */
const SLACK_BYTES = 1024 * 1024;

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
 * Reject an obviously-oversized multipart body from its `Content-Length`,
 * **before** `request.formData()` is awaited.
 *
 * `parseUploadForm` already refuses a part that declares too many bytes, but by
 * the time it can look, the runtime has read the whole body into the isolate —
 * the per-file cap is enforced on a request that has already cost us the memory.
 *
 * **Be clear about what this is.** `Content-Length` is set by the client and may
 * be omitted entirely (a chunked upload is legal and is let through, since the
 * per-part checks downstream are the real limit). So this is not a defence
 * against someone deliberately exhausting memory — they simply omit the header.
 * It is a cheap, early, honest 413 for the ordinary case: a real client
 * uploading something far too big learns immediately instead of after the
 * transfer. Enforcing a true ceiling would mean capping bytes as they are read
 * off `request.body`, which the multipart parser here doesn't do.
 *
 * The bound is deliberately tight rather than "the most the route could ever
 * accept": `formData()` holds the raw body and the parsed parts at the same
 * time, so a request sized at the theoretical maximum still doesn't fit in a
 * 128 MB isolate. Half the theoretical maximum keeps a legitimate full batch
 * comfortably inside it, and no real client sends every slot at the cap.
 */
export function assertUploadBodySize(
  request: Request,
  { maxFiles, maxBytes }: { maxFiles: number; maxBytes: number },
): void {
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return;
  // Every file at the cap, plus framing. Previews get no slot of their own: a
  // batch that is all full-size files *and* all full-size previews is not a real
  // upload, and counting it doubles the ceiling this exists to lower.
  //
  // The slack is per *additional* part, so a single-part route gets none. On a
  // one-file route it would otherwise sit between the guard and the route's own
  // cap, and the same user action — one oversized recording — would come back as
  // 400 or 413 depending on which side of that gap it landed.
  const limit = maxFiles * maxBytes + (maxFiles > 1 ? SLACK_BYTES : 0);
  if (declared > limit) {
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

/**
 * The one entry point every multipart upload route should use: guard the body
 * size, read the form, and parse the file parts — in that order, together.
 *
 * This exists because the pieces were separate and a route forgot one. The
 * `Content-Length` guard was wired into four routes; `/ai/transcribe`, added a
 * commit later and carrying the largest bodies in the product, was written
 * without it, and nothing could have caught that: the guard was a line you had
 * to remember, not a thing the parser did. Handing back both the raw `form`
 * (routes still need `profileId`/`folderId` off it) and the parsed parts means
 * a new upload route gets the guard by taking the only path that parses.
 *
 * Every rejection throws — `handle()` maps it for the `/api/v1` routes and the
 * cookie-session routes funnel it through their own `fail()` — so both keep the
 * statuses they had: 413 for an oversized body or part, 400 for a bad shape.
 */
export async function readUploadForm(
  request: Request,
  options: ParseUploadFormOptions & { malformedMessage: string },
): Promise<{ form: FormData; uploads: UploadPart[] }> {
  assertUploadBodySize(request, options);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest(options.malformedMessage);
  }

  return { form, uploads: await parseUploadForm(form, options) };
}
