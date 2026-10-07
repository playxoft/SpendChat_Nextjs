import { z } from "zod";
import { BUDGET_DESCRIPTION_MAX, BUDGET_SCOPES, BUDGET_TITLE_MAX, isMonthKey } from "./budgets";
import { CURRENCY_CODES } from "./currencies";
import { SPLIT_GROUP_MAX_PEOPLE } from "./plans";
import { SPLIT_DRAFT_REF_PATTERN, SPLIT_IMPORT_EXPENSES_MAX } from "./split-import";
import {
  CURRENCIES,
  PAID_PERSONAL_PLANS,
  PERIODS,
  type Currency,
  type PaidPersonalPlan,
  type Period,
} from "./pricing";

export const txnTypeSchema = z.enum(["income", "expense"]);

/**
 * Transaction field limits — the single source of truth. The Zod schemas below
 * enforce them at every write boundary (server actions + REST API); the
 * transaction inputs (composer, edit dialog, bulk grid) mirror them as input
 * `maxLength` / digit caps so the client stops over-long input before the send.
 * If any of these change, update the mobile API docs (`_developer/flutter/*`)
 * in lockstep — they publish these caps to the Flutter client.
 */
export const TRANSACTION_TITLE_MAX = 40;
export const TRANSACTION_DESCRIPTION_MAX = 150;
/** The amount's whole-number part is capped at 9 digits (max 999,999,999.99). */
export const AMOUNT_INTEGER_DIGITS_MAX = 9;
export const TRANSACTION_AMOUNT_MAX = 999_999_999.99;

/** Positive amount in major units, up to 2dp tolerance handled at conversion.
 *  Capped at a 9-digit whole-number part (999,999,999.99). */
export const amountSchema = z.coerce
  .number()
  .positive("Amount must be greater than 0")
  .finite()
  .max(TRANSACTION_AMOUNT_MAX, "Amount is too large (max 9 digits)");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/* -------------------------------------------------------------------------- */
/* Transaction tags                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Tag limits — the single source of truth, the way the transaction field caps
 * above are. `TAG_NAME_MAX` is also the `tags.name` column width, so the DB
 * rejects exactly what the app does.
 *
 * These deliberately match the vault's tag caps (`FILE_TAG_MAX` /
 * `FILE_TAGS_MAX`): the two systems are separate, but a user who has learned
 * "tags are short, about ten of them" in one place should not be corrected by
 * the other. `TAGS_PER_WORKSPACE_MAX` has no vault equivalent — it exists so a
 * runaway client (or an import) can't turn the picker into an unusable list.
 */
export const TAG_NAME_MAX = 20;
export const TAGS_PER_TRANSACTION_MAX = 10;
export const TAGS_PER_WORKSPACE_MAX = 100;

/**
 * An accent color (transaction tags, vault tags, folders): a hex `#rrggbb`.
 * Stored as text so a future custom-color picker needs no schema change — any
 * hex the UI mints is already valid here. Today's UI offers a fixed 20-swatch
 * palette (`TAG_COLORS` in `lib/tags.ts`, re-exported as `VAULT_COLORS` from
 * `lib/files.ts`).
 */
export const accentColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, "Pick a color");

/**
 * The tags on a transaction, as ids. Tags are entities (workspace-scoped, named
 * + colored) and transactions reference them by id — there are no free-text
 * tags, so a rename or recolor updates every tagged transaction at once.
 *
 * Deduped on the way in, because the same tag arriving twice is a client bug,
 * not a request to store it twice — and `tag_ids` has no unique constraint to
 * catch it. Ids the caller isn't entitled to are *not* rejected here: the
 * service filters them against the workspace (`workspaceTagIds`), the same way
 * `categoryId` is resolved, so a stale or forged id is dropped rather than
 * failing an otherwise valid write.
 */
export const txnTagIdsSchema = z
  .array(z.string().uuid())
  .max(TAGS_PER_TRANSACTION_MAX, `Too many tags (max ${TAGS_PER_TRANSACTION_MAX})`)
  .transform((ids) => [...new Set(ids)]);

const txnTagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(TAG_NAME_MAX, `Tag name is too long (max ${TAG_NAME_MAX} characters)`);

export const createTxnTagSchema = z.object({
  name: txnTagNameSchema,
  color: accentColorSchema,
});
export type CreateTxnTagInput = z.input<typeof createTxnTagSchema>;

export const updateTxnTagSchema = z.object({
  id: z.string().uuid(),
  name: txnTagNameSchema.optional(),
  color: accentColorSchema.optional(),
});
export type UpdateTxnTagInput = z.input<typeof updateTxnTagSchema>;

/** Setting a transaction's tags on its own, without touching any other field
 *  (the table cell's picker and the composer's chips both use this). */
export const setTransactionTagsSchema = z.object({
  id: z.string().uuid(),
  tagIds: txnTagIdsSchema,
});
export type SetTransactionTagsInput = z.input<typeof setTransactionTagsSchema>;

export const transactionInputSchema = z.object({
  type: txnTypeSchema,
  amount: amountSchema,
  categoryId: z.string().uuid().nullish(),
  profileId: z.string().uuid().nullish(),
  title: z
    .string()
    .trim()
    .max(TRANSACTION_TITLE_MAX, `Title is too long (max ${TRANSACTION_TITLE_MAX} characters)`)
    .optional()
    .default(""),
  description: z
    .string()
    .trim()
    .max(
      TRANSACTION_DESCRIPTION_MAX,
      `Description is too long (max ${TRANSACTION_DESCRIPTION_MAX} characters)`,
    )
    .optional()
    .default(""),
  // Deprecated alias for `title`; accepted until every caller passes `title`.
  note: z.string().trim().max(TRANSACTION_TITLE_MAX).optional(),
  occurredOn: dateSchema,
  // Optional everywhere, and deliberately *not* defaulted to `[]`: on an update
  // "absent" has to stay distinguishable from "empty", or a PATCH that only
  // moves the date would silently strip the row's tags. `updateTransaction`
  // reads it as "leave the tags alone" when undefined.
  tagIds: txnTagIdsSchema.optional(),
});
// `input` type accounts for fields with defaults being optional for callers.
export type TransactionInput = z.input<typeof transactionInputSchema>;

export const updateTransactionSchema = transactionInputSchema.extend({
  id: z.string().uuid(),
});

export const bulkTransactionsSchema = z.object({
  items: z.array(transactionInputSchema).min(1).max(500),
});

/**
 * Rows one bulk edit or delete may touch. A selection is made by hand from
 * loaded pages, so this is far above any real one — it exists so a tampered
 * request can't turn into an unbounded `IN` list.
 */
export const BULK_TRANSACTIONS_MAX = 500;

const bulkTransactionIdsSchema = z.array(z.string().uuid()).min(1).max(BULK_TRANSACTIONS_MAX);

export const bulkDeleteTransactionsSchema = z.object({ ids: bulkTransactionIdsSchema });
export type BulkDeleteTransactionsInput = z.input<typeof bulkDeleteTransactionsSchema>;

/** Profile names (create/rename), and what a restore trims a renamed one to. */
export const PROFILE_NAME_MAX = 20;

/** The most ids of one kind a single trash restore/delete takes. */
export const TRASH_SELECTION_MAX = BULK_TRANSACTIONS_MAX;

const trashIdsSchema = z.array(z.string().uuid()).max(TRASH_SELECTION_MAX).default([]);

/**
 * What to restore from — or delete for good out of — the trash. Every kind is
 * optional; at least one id overall. Ids the caller can't act on are skipped
 * (reported back), never an error, like the bulk transaction edits.
 */
export const trashSelectionSchema = z
  .object({
    transactionIds: trashIdsSchema,
    fileIds: trashIdsSchema,
    folderIds: trashIdsSchema,
    profileIds: trashIdsSchema,
  })
  .refine(
    (v) => v.transactionIds.length + v.fileIds.length + v.folderIds.length + v.profileIds.length > 0,
    { message: "Choose something in the trash first" },
  );
export type TrashSelectionInput = z.input<typeof trashSelectionSchema>;

/**
 * The trash list's keyset cursor, `<deletedAt ISO>_<id>`. The timestamp is
 * millisecond-precise on purpose (`deleted_at` is `timestamptz(3)`), so it
 * round-trips through a JavaScript `Date` without skipping tied rows.
 */
export const trashCursorSchema = z
  .string()
  .max(80)
  .transform((value, ctx) => {
    const cut = value.lastIndexOf("_");
    const at = new Date(value.slice(0, cut));
    const id = value.slice(cut + 1);
    if (cut <= 0 || Number.isNaN(at.getTime()) || !z.string().uuid().safeParse(id).success) {
      ctx.addIssue({ code: "custom", message: "Invalid cursor" });
      return z.NEVER;
    }
    return { deletedAt: at, id };
  });

/**
 * One change applied to many rows. Every field is optional and means "leave it
 * alone" when absent; `categoryId: null` is the explicit "Uncategorized". At
 * least one change is required — an edit of nothing is a client bug, not a
 * no-op worth a round-trip.
 */
export const bulkUpdateTransactionsSchema = z
  .object({
    ids: bulkTransactionIdsSchema,
    profileId: z.string().uuid().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    addTagIds: z.array(z.string().uuid()).max(TAGS_PER_TRANSACTION_MAX).optional(),
    removeTagIds: z.array(z.string().uuid()).max(TAGS_PER_WORKSPACE_MAX).optional(),
  })
  .refine(
    (d) =>
      d.profileId !== undefined ||
      d.categoryId !== undefined ||
      (d.addTagIds?.length ?? 0) > 0 ||
      (d.removeTagIds?.length ?? 0) > 0,
    { message: "Nothing to change" },
  );
export type BulkUpdateTransactionsInput = z.input<typeof bulkUpdateTransactionsSchema>;

/* -------------------------------------------------------------------------- */
/* Transaction attachments (receipts / bills / invoices)                       */
/* -------------------------------------------------------------------------- */

/**
 * Per-file size cap and per-transaction count cap — the single source of truth,
 * enforced on both the upload route and the client dropzone. Deliberately the
 * same on every plan; keeping them as named constants means a plan could raise
 * them in one place.
 */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// 2 on every plan; a plan that raised it would do so here (it's read everywhere from here).
export const ATTACHMENT_MAX_PER_TRANSACTION = 2;
/** Optional per-file display name/label. Not mandatory; falls back to fileName. */
export const ATTACHMENT_LABEL_MAX = 80;
/** Original filename we persist for the download's `Content-Disposition`. */
export const ATTACHMENT_FILENAME_MAX = 200;

/** Optional preset category a user can tag a file with (all optional). */
export const ATTACHMENT_KINDS = ["receipt", "bill", "invoice", "other"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export const attachmentKindSchema = z.enum(ATTACHMENT_KINDS);

/**
 * Content-type allowlist → the extension we store the object under. Images,
 * PDFs, office docs, CSV and plain text only. Deliberately excludes SVG and
 * HTML (script-carrying → stored-XSS when served inline) and all video/audio.
 */
export const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
};

/** Reverse map: extension → canonical content-type, for the octet-stream fallback. */
export const ATTACHMENT_EXTENSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(ATTACHMENT_CONTENT_TYPES).map(([type, ext]) => [ext, type]),
);

/** `accept` value for the file input — extensions + MIME types, so browsers that
 *  report a generic type for office docs still offer the right files. */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(ATTACHMENT_CONTENT_TYPES),
  ...Object.keys(ATTACHMENT_EXTENSIONS).map((ext) => `.${ext}`),
].join(",");

/** Content types we render inline (preview in a tab); everything else downloads. */
export const ATTACHMENT_INLINE_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

/** Excel types. Not browser-renderable, but the download route proxies their
 * bytes same-origin so the in-app viewer can parse + preview them client-side. */
export const ATTACHMENT_SPREADSHEET_TYPES = new Set<string>([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const filenameExt = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/**
 * Resolve an upload's canonical `{ contentType, ext }`, or null when the file
 * isn't an allowed type. Trusts the declared MIME type when it's on the
 * allowlist; otherwise (a browser handing us `application/octet-stream` for a
 * .docx, say) falls back to the filename extension. A blocked/unknown type with
 * a non-allowed extension is rejected.
 */
export function resolveAttachmentType(
  fileName: string,
  declaredType: string | null | undefined,
): { contentType: string; ext: string } | null {
  const declared = (declaredType ?? "").split(";")[0]!.trim().toLowerCase();
  const byType = ATTACHMENT_CONTENT_TYPES[declared];
  if (byType) return { contentType: declared, ext: byType };
  const ext = filenameExt(fileName);
  const byExt = ATTACHMENT_EXTENSIONS[ext];
  if (byExt) return { contentType: byExt, ext };
  return null;
}

/** Optional metadata a client may set on an attachment (both fields optional). */
export const attachmentMetaSchema = z.object({
  label: z
    .string()
    .trim()
    .max(ATTACHMENT_LABEL_MAX, `Name is too long (max ${ATTACHMENT_LABEL_MAX} characters)`)
    .nullish(),
  kind: attachmentKindSchema.nullish(),
});
export type AttachmentMetaInput = z.infer<typeof attachmentMetaSchema>;

/* -------------------------------------------------------------------------- */
/* Files (the document vault: board resolutions, land/house papers, certificates) */
/* -------------------------------------------------------------------------- */

/**
 * The app-wide upload cap. Deliberately the same constant as transaction
 * attachments (`ATTACHMENT_MAX_BYTES`): "5 MB per file" is one product rule,
 * not two — raise it in one place and both features follow.
 */
export const FILE_MAX_BYTES = ATTACHMENT_MAX_BYTES;
// The per-workspace storage quota is the plan's `storageBytes` (`lib/plans.ts`,
// enforced by `lib/storage-quota.ts`) — vault files *and* transaction
// attachments together, computed on read from the size columns so it can't drift.
/** Display/file name we persist (used in `Content-Disposition` on download). */
export const FILE_NAME_MAX = 200;
/** Folder + tag names are deliberately short — they're labels, not documents. */
export const FOLDER_NAME_MAX = 40;
/** DB cap for the free-text category column (presets are far shorter). */
export const FILE_CATEGORY_MAX = 40;
export const FILE_TAG_MAX = 20;
/** Per-file and per-folder tag count cap. */
export const FILE_TAGS_MAX = 10;
/** Files accepted in a single upload request. */
export const FILE_MAX_PER_UPLOAD = 10;

/**
 * Preset document categories (stored as text, so adding one later is a code
 * change, not a migration). These mirror what the vault is for: company
 * paperwork, personal/land/house documents, certificates.
 */
export const FILE_CATEGORIES = [
  "board-resolution",
  "company",
  "personal",
  "land",
  "house",
  "certificate",
  "other",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];
export const fileCategorySchema = z.enum(FILE_CATEGORIES);

/** The vault's name for `accentColorSchema` — kept so the vault's call sites,
 *  its docs and its tests read as they always have. One schema, two names. */
export const vaultColorSchema = accentColorSchema;

/**
 * Tags are entities (per-profile, named + colored), and items reference them
 * by id — free-text tags no longer exist. Only tags that were created can be
 * applied.
 */
export const tagIdsSchema = z
  .array(z.string().uuid())
  .max(FILE_TAGS_MAX, `Too many tags (max ${FILE_TAGS_MAX})`)
  .transform((ids) => [...new Set(ids)]);

const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(FILE_TAG_MAX, `Tag name is too long (max ${FILE_TAG_MAX} characters)`);

export const createTagSchema = z.object({
  profileId: z.string().uuid(),
  name: tagNameSchema,
  color: vaultColorSchema,
});
export type CreateTagInput = z.input<typeof createTagSchema>;

export const updateTagSchema = z.object({
  id: z.string().uuid(),
  name: tagNameSchema.optional(),
  color: vaultColorSchema.optional(),
});
export type UpdateTagInput = z.input<typeof updateTagSchema>;

const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Folder name is required")
  .max(FOLDER_NAME_MAX, `Folder name is too long (max ${FOLDER_NAME_MAX} characters)`);

const fileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(FILE_NAME_MAX, `File name is too long (max ${FILE_NAME_MAX} characters)`);

export const createFolderSchema = z.object({
  profileId: z.string().uuid(),
  parentId: z.string().uuid().nullish(),
  name: folderNameSchema,
  color: vaultColorSchema.nullish(),
  tagIds: tagIdsSchema.optional().default([]),
});
export type CreateFolderInput = z.input<typeof createFolderSchema>;

/** PATCH semantics: `undefined` leaves a field untouched; `parentId: null`
 * moves the folder to the root; `color: null` clears the accent. */
export const updateFolderSchema = z.object({
  id: z.string().uuid(),
  name: folderNameSchema.optional(),
  color: vaultColorSchema.nullish(),
  tagIds: tagIdsSchema.optional(),
  parentId: z.string().uuid().nullish(),
});
export type UpdateFolderInput = z.input<typeof updateFolderSchema>;

/** PATCH semantics: `folderId: null` moves the file to the root, `category:
 * null` clears the category. */
export const updateFileSchema = z.object({
  id: z.string().uuid(),
  name: fileNameSchema.optional(),
  category: fileCategorySchema.nullish(),
  tagIds: tagIdsSchema.optional(),
  folderId: z.string().uuid().nullish(),
});
export type UpdateFileInput = z.input<typeof updateFileSchema>;

/** How long a share link may live. `expiresInDays: null` = never expires. */
export const FILE_SHARE_MAX_DAYS = 365;

export const createFileShareSchema = z
  .object({
    fileId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
    /** false = view-only link: recipients can preview but get no download UI. */
    allowDownload: z.boolean().optional().default(true),
    expiresInDays: z.number().int().min(1).max(FILE_SHARE_MAX_DAYS).nullish(),
  })
  .refine((o) => (o.fileId != null) !== (o.folderId != null), {
    message: "Share exactly one file or folder",
  });
export type CreateFileShareInput = z.input<typeof createFileShareSchema>;

/**
 * Extension → canonical media type for the vault's video/audio uploads.
 *
 * This map is what actually makes video previews work. Browsers report `File.type`
 * inconsistently — empty or `application/octet-stream` for `.mkv`, `.avi`, `.m4v`,
 * `.flv` and often for files dragged in from other apps — and without a fallback
 * those land as `application/octet-stream`, which is neither `video/*` nor inline,
 * so the viewer only ever offered a download. Resolving by extension keeps the
 * stored type honest.
 *
 * Deliberately wider than what any one browser can decode: which containers and
 * codecs actually play is the *browser's* call, not ours, and it differs per
 * engine (Chrome plays Matroska, Safari doesn't; Safari plays more of QuickTime).
 * We serve every one of them inline with Range support and let `<video>` try —
 * the viewer falls back to a download card on a decode error, so a format the
 * engine can't handle degrades per-viewer instead of being blocked for everyone.
 */
const VIDEO_EXTENSIONS: Record<string, string> = {
  mp4: "video/mp4",
  // .m4v is an MP4 container. Typing it `video/x-m4v` gives Chrome no
  // registered renderer, so "Open in new tab" saves the file instead of
  // playing it — while `<video src>` plays it either way, since the media
  // pipeline sniffs the container rather than trusting the header.
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  // Only the unambiguous MPEG-transport-stream extension. `.ts` is far more
  // often TypeScript source, and Windows Chrome reports no `File.type` for it:
  // mapping it here would file `budget-export.ts` as a video, label it "Video",
  // serve it inline, and open it in a player that immediately errors.
  m2ts: "video/mp2t",
};

const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  weba: "audio/webm",
  amr: "audio/amr",
  wma: "audio/x-ms-wma",
};

/** Every media type the vault recognizes, video and audio together. */
export const MEDIA_EXTENSIONS: Record<string, string> = {
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
};

/**
 * Types the files API serves inline (previews). Everything else is stored fine
 * but served download-only with `Content-Disposition: attachment` — which is
 * what makes the permissive upload policy below safe: an uploaded HTML/SVG can
 * never execute in our origin because it is never rendered inline.
 *
 * Media is inline across the board (see `MEDIA_EXTENSIONS`): audio and video
 * bytes are decoded by the media pipeline, never as a document, so none of them
 * can run script the way an HTML or SVG file could.
 */
export const FILE_INLINE_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  ...Object.values(MEDIA_EXTENSIONS),
]);

/**
 * The media types a mainstream browser engine actually has a decoder for.
 *
 * `FILE_INLINE_TYPES` is deliberately wider: every container is offered to
 * `<video>`/`<audio>` so a format one engine can play isn't withheld from it,
 * and the player swaps in a download card when the decode fails. That trade
 * only works while a download is available — on a **view-only** share link it
 * isn't, and a top-level navigation to a `video/x-ms-wmv` no engine can render
 * doesn't show a dead player, it writes the file to the recipient's Downloads
 * folder. That is precisely what `allowDownload: false` promises can't happen,
 * so the view-only path serves inline only what will genuinely *render*
 * (`rendersInBrowser` in `lib/files.ts`) and 403s the rest.
 *
 * Left out on purpose: avi, wmv, flv, 3gpp2, MPEG-TS, MPEG-1/2 program
 * streams, amr and wma — legacy containers no engine ships a `<video>` decoder
 * for. The list fails closed: a container added to `MEDIA_EXTENSIONS` counts as
 * unrenderable on view-only links until it is added here too, so the worst a
 * missing entry costs is a "no preview" message, never a silent download.
 */
export const BROWSER_PLAYABLE_MEDIA_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/ogg",
  "video/3gpp",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/flac",
  "audio/webm",
]);

/** Fallback mime → extension map for uploads whose filename has no extension. */
const FILE_TYPE_EXTENSIONS: Record<string, string> = {
  ...ATTACHMENT_CONTENT_TYPES,
  "text/markdown": "md",
  "application/json": "json",
  "application/zip": "zip",
  // Reverse of the media map — first extension listed for a type wins.
  ...Object.fromEntries(
    Object.entries(MEDIA_EXTENSIONS)
      .reverse()
      .map(([ext, type]) => [type, ext]),
  ),
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const MIME_RE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

/**
 * Resolve a vault upload's `{ contentType, ext }`. Unlike transaction
 * attachments (strict allowlist), the vault accepts almost anything — videos,
 * archives, unknown binaries — because nothing outside `FILE_INLINE_TYPES` is
 * ever served inline (see above). An unrecognizable declared type falls back to
 * the extension's canonical type, then to `application/octet-stream`.
 */
export function resolveFileType(
  fileName: string,
  declaredType: string | null | undefined,
): { contentType: string; ext: string } {
  const declared = (declaredType ?? "").split(";")[0]!.trim().toLowerCase();
  const dot = fileName.lastIndexOf(".");
  const nameExt = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const ext = /^[a-z0-9]{1,10}$/.test(nameExt) ? nameExt : "";
  if (MIME_RE.test(declared) && declared !== "application/octet-stream") {
    return { contentType: declared, ext: ext || FILE_TYPE_EXTENSIONS[declared] || "bin" };
  }
  // No usable declared type: recover it from the extension. Media is checked
  // too, not just the attachment allowlist — browsers routinely hand us nothing
  // for a .mkv/.avi/.m4v, and octet-stream would cost the file its preview.
  const byExt = ext ? (ATTACHMENT_EXTENSIONS[ext] ?? MEDIA_EXTENSIONS[ext]) : undefined;
  return { contentType: byExt ?? "application/octet-stream", ext: ext || "bin" };
}

/**
 * The content type to *act* on for a stored file: its own, or the extension's
 * canonical type when the row was written as an anonymous binary.
 *
 * Every `.mkv`/`.avi`/`.m4v`/`.flac` uploaded before `resolveFileType` learned
 * the media map is still `application/octet-stream` in the database — which is
 * the whole corpus the "videos don't preview" report came from. Fixing only the
 * upload path would leave those a download card forever, so the type is
 * re-derived wherever a file is serialized or served, and the fix applies on
 * deploy instead of waiting on a backfill.
 *
 * Idempotent (a row already typed `video/*` resolves to itself) and pure string
 * work, so it is cheap enough to run per row of a 500-row listing.
 */
export function effectiveContentType(fileName: string, storedType: string): string {
  return resolveFileType(fileName, storedType).contentType;
}

export const themeSchema = z.enum(["light", "dark", "system"]);

/** Currency + number format (locale) — a per-workspace setting, admin-gated. */
export const workspaceCurrencySchema = z.object({
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  locale: z.string().trim().min(2).max(20),
});
export type WorkspaceCurrencyInput = z.infer<typeof workspaceCurrencySchema>;

/** Layout of the transaction composer inputs. Stored on `user_settings`. */
export const INPUT_MODES = ["amount_title", "title_amount", "combined"] as const;
export const inputModeSchema = z.enum(INPUT_MODES);
export type InputMode = (typeof INPUT_MODES)[number];

/**
 * How much room the tracker's composer takes. `normal` is the full layout (the
 * control strip on one line, the category slider on its own). `compact` folds
 * everything onto a single line and drops the controls to icons — the labels and
 * the inline shortcut chips become hover tooltips carrying the same hints.
 *
 * Orthogonal to `inputMode`: that decides the *order* of the amount/title
 * fields, this decides how much chrome surrounds them.
 */
export const COMPOSER_DENSITIES = ["normal", "compact"] as const;
export const composerDensitySchema = z.enum(COMPOSER_DENSITIES);
export type ComposerDensity = (typeof COMPOSER_DENSITIES)[number];

/**
 * Composer display preferences. Every key `.catch()`es its own default, so a row
 * written before the key existed (or hand-edited to nonsense) yields the default
 * for *that* key rather than failing the whole object — which is what lets a new
 * preference ship without a migration or a backfill.
 */
export const composerPrefsSchema = z.object({
  density: composerDensitySchema.catch("normal"),
});
export type ComposerPrefs = z.infer<typeof composerPrefsSchema>;

/**
 * Per-user UI preferences that follow the user across devices, workspaces and
 * profiles — the `user_settings.ui_prefs` jsonb column.
 *
 * Deliberately one namespaced bag instead of a column per toggle: the composer
 * is expected to grow more display options (hiding the description, showing only
 * a subset of fields…) and other surfaces will want their own namespace beside
 * `composer`. Adding either is then a key with a default here — no migration.
 *
 * Two rules keep that safe, and both matter:
 * - **Read** through `normalizeUiPrefs`, never straight off the row, so a value
 *   from an older build or a hand-edited row degrades to the default instead of
 *   reaching the UI (same discipline as `voiceLanguages`).
 * - **Write** by merging in SQL (`services/settings.ts`), never by storing a
 *   parsed object. Zod strips keys it doesn't know, so a whole-object write from
 *   a build that predates a preference would silently erase it.
 *
 * Device-local view state (the transactions column layout) stays in
 * localStorage on purpose — this column is only for preferences that should
 * follow the user to another browser.
 */
/** One-time tracker cards the user has waved away (`ui_prefs.onboarding`). */
export const onboardingPrefsSchema = z.object({
  inviteNudgeDismissed: z.boolean().catch(false),
});
export type OnboardingPrefs = z.infer<typeof onboardingPrefsSchema>;

/**
 * Most spaces one person can have folded shut in the sidebar. The list spans
 * every workspace they're in and keeps ids of spaces deleted since, so it's
 * capped: newest first, the oldest fall off.
 */
export const SIDEBAR_COLLAPSED_MAX = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Clean a collapsed-spaces list: uuid strings only, each once, in order, at
 * most `SIDEBAR_COLLAPSED_MAX`. Used on read (a hand-edited or older row) and
 * on write (whatever the client sent), so the stored list stays bounded.
 */
export function normalizeCollapsedSpaces(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !UUID_RE.test(id)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= SIDEBAR_COLLAPSED_MAX) break;
  }
  return out;
}

/** Sidebar state that follows the user (`ui_prefs.sidebar`): which spaces are folded shut. */
export const sidebarPrefsSchema = z.object({
  collapsedSpaces: z.array(z.unknown()).transform(normalizeCollapsedSpaces).catch([]),
});
export type SidebarPrefs = z.infer<typeof sidebarPrefsSchema>;

/** What the client sends to save the folded spaces: the whole list, newest first. */
export const collapsedSpacesInputSchema = z
  .array(z.string().uuid())
  .max(SIDEBAR_COLLAPSED_MAX, `Too many spaces (max ${SIDEBAR_COLLAPSED_MAX})`);

/** A fresh default bag each time — the sidebar list is mutable, so never share one. */
function uiPrefsDefault() {
  return {
    composer: { density: "normal" as const },
    onboarding: { inviteNudgeDismissed: false },
    sidebar: { collapsedSpaces: [] as string[] },
  };
}

export const uiPrefsSchema = z
  .object({
    composer: composerPrefsSchema.catch({ density: "normal" }),
    onboarding: onboardingPrefsSchema.catch({ inviteNudgeDismissed: false }),
    sidebar: sidebarPrefsSchema.catch(() => ({ collapsedSpaces: [] })),
  })
  .catch(() => uiPrefsDefault());
export type UiPrefs = z.infer<typeof uiPrefsSchema>;

/** Read-side guard for `user_settings.ui_prefs` — see `uiPrefsSchema`. */
export function normalizeUiPrefs(value: unknown): UiPrefs {
  return uiPrefsSchema.parse(value);
}

/**
 * Languages voice entry should expect, as ISO 639-1 codes. Shape only — which
 * codes are real is decided by `normalizeVoiceLanguages` against the catalogue
 * in `voice-languages.ts` (kept there so the picker, the browser recognizer and
 * the server prompt all read one list). An empty array is allowed and means
 * "back to the default".
 */
export const voiceLanguagesSchema = z.array(z.string().trim().min(2).max(8)).max(20);
export type VoiceLanguagesInput = z.infer<typeof voiceLanguagesSchema>;

/**
 * Partial user-settings update for the REST API's `PATCH /settings`. These
 * settings follow the user across workspaces (theme, input mode, voice
 * languages). Currency and number format are per-workspace and live on a
 * separate endpoint. Any subset may be supplied; at least one is required.
 */
export const patchSettingsSchema = z
  .object({
    theme: themeSchema,
    inputMode: inputModeSchema,
    voiceLanguages: voiceLanguagesSchema,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Provide at least one setting to update",
  });
export type PatchSettingsInput = z.infer<typeof patchSettingsSchema>;

/** A user's own display name (`users.name`), editable on the account page. */
export const accountNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(50, "Name is too long (max 50 characters)");
export const updateAccountNameSchema = z.object({ name: accountNameSchema });
export type UpdateAccountNameInput = z.infer<typeof updateAccountNameSchema>;

/** Category names are capped like tag names — both are chips in the same
 *  places, and a name that doesn't fit one doesn't fit the other. */
export const CATEGORY_NAME_MAX = 20;

export const categoryInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(CATEGORY_NAME_MAX, `Name is too long (max ${CATEGORY_NAME_MAX} characters)`),
  kind: txnTypeSchema,
  icon: z.string().trim().max(16).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(CATEGORY_NAME_MAX, `Name is too long (max ${CATEGORY_NAME_MAX} characters)`)
    .optional(),
  icon: z.string().trim().max(16).nullish(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(PROFILE_NAME_MAX, `Name is too long (max ${PROFILE_NAME_MAX} characters)`),
  icon: z.string().trim().max(16).optional(),
  color: z.string().trim().max(32).optional(),
  /** The space to create it in; omitted → the workspace's first space. */
  spaceId: z.string().uuid().optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const updateProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(PROFILE_NAME_MAX, `Name is too long (max ${PROFILE_NAME_MAX} characters)`).optional(),
  icon: z.string().trim().max(16).nullish(),
  color: z.string().trim().max(32).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** The sidebar sends every profile in the workspace; Pro allows 15 spaces × 10 profiles. */
export const REORDER_PROFILES_MAX = 200;

export const reorderProfilesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(REORDER_PROFILES_MAX),
});

/**
 * What a profile delete does with the transactions filed under it.
 *
 *   delete — remove them (and their attachments) along with the profile
 *   move   — re-file them under `toProfileId`, then delete the profile
 *   reject — refuse while the profile still has transactions
 *
 * `reject` is the default so a caller that says nothing (an older mobile build
 * calling `DELETE /profiles/:id`) still gets the 409 it was written against
 * rather than silently losing rows. The web dialog always sends a choice.
 */
export const deleteProfileSchema = z
  .object({
    transactions: z.enum(["reject", "delete", "move"]).default("reject"),
    toProfileId: z.string().uuid().optional(),
  })
  .refine((v) => v.transactions !== "move" || !!v.toProfileId, {
    message: "Choose a profile to move the transactions to",
    path: ["toProfileId"],
  });
export type DeleteProfileInput = z.input<typeof deleteProfileSchema>;
export type ProfileTransactionDisposal = z.infer<typeof deleteProfileSchema>["transactions"];

export const workspaceRoleSchema = z.enum(["viewer", "editor", "admin"]);

/** Shared so the bootstrap auto-name generator (`defaultWorkspaceName`) can keep
 *  generated names within the same limit the schema enforces. */
export const WORKSPACE_NAME_MAX = 30;

/** Emoji a new/blank workspace gets by default (like a profile's `👤`). */
export const DEFAULT_WORKSPACE_ICON = "🏢";

/** Longest space name — also the `spaces.name` column width. */
export const SPACE_NAME_MAX = 30;

/** The space every workspace starts with, and the one existing profiles moved into. */
export const DEFAULT_SPACE_NAME = "Main";
export const DEFAULT_SPACE_ICON = "🗂️";

/** Longest organisation name. */
export const ORGANIZATION_NAME_MAX = 40;

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Workspace name is required")
  .max(WORKSPACE_NAME_MAX, `Workspace name is too long (max ${WORKSPACE_NAME_MAX} characters)`);

/** Emoji for a workspace — same rule as a profile/category icon. */
export const workspaceIconSchema = z.string().trim().max(16);

export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  icon: workspaceIconSchema.optional(),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/** Update a workspace's display details (name + icon), admin-gated. */
export const updateWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  icon: workspaceIconSchema.nullish(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

// ── Spaces & organisations ─────────────────────────────────────────────────

export const spaceNameSchema = z
  .string()
  .trim()
  .min(1, "Space name is required")
  .max(SPACE_NAME_MAX, `Space name is too long (max ${SPACE_NAME_MAX} characters)`);

/** Emoji for a space — same rule as a workspace/profile icon. */
export const spaceIconSchema = z.string().trim().max(16);

export const createSpaceSchema = z.object({
  name: spaceNameSchema,
  icon: spaceIconSchema.optional(),
});
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

/** Rename / re-icon a space. `icon` omitted leaves it; "" clears it. */
export const updateSpaceSchema = z
  .object({
    name: spaceNameSchema.optional(),
    icon: spaceIconSchema.nullish(),
  })
  .refine((v) => v.name !== undefined || v.icon !== undefined, "Nothing to update");
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

/** The workspace's spaces in their new order (every space, once). */
export const reorderSpacesSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate space in order"),
});

/**
 * Delete a space. One that still holds profiles needs `moveProfilesTo` — the
 * space they move into — or the delete is refused; profiles are never deleted
 * as a side effect of deleting a space.
 */
export const deleteSpaceSchema = z.object({
  moveProfilesTo: z.string().uuid().optional(),
});
export type DeleteSpaceInput = z.input<typeof deleteSpaceSchema>;

export const moveProfileToSpaceSchema = z.object({ spaceId: z.string().uuid() });

export const spaceRoleSchema = z.enum(["viewer", "editor"]);

/** Add/update (role) or remove (null) a workspace member in one space. */
export const setSpaceMemberSchema = z.object({
  userId: z.string().uuid(),
  role: spaceRoleSchema.nullable(),
});
export type SetSpaceMemberInput = z.infer<typeof setSpaceMemberSchema>;

export const profileAccessLevelSchema = z.enum(["none", "read", "write"]);

/** Set (none/read/write) or clear (null) one member's override on one profile. */
export const setProfileOverrideSchema = z.object({
  userId: z.string().uuid(),
  access: profileAccessLevelSchema.nullable(),
});
export type SetProfileOverrideInput = z.infer<typeof setProfileOverrideSchema>;

export const organizationNameSchema = z
  .string()
  .trim()
  .min(1, "Organisation name is required")
  .max(ORGANIZATION_NAME_MAX, `Organisation name is too long (max ${ORGANIZATION_NAME_MAX} characters)`);

export const renameOrganizationSchema = z.object({ name: organizationNameSchema });

const inviteEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(100, "Email is too long (max 100 characters)")
  .email("Enter a valid email address");

/** Max profiles a single grant/invite may target at once. */
export const ACCESS_PROFILES_MAX = 50;

/** Max spaces one member/invite can be put into at once. */
export const ACCESS_SPACES_MAX = 50;

/**
 * How much of a workspace a person can reach.
 *
 * `all` = workspace membership at one role. An admin sees every space; a
 * viewer/editor sees the spaces in `spaceIds`, at that role — every space in
 * the workspace when `spaceIds` is omitted (what "all profiles" meant before
 * spaces existed). An empty list is allowed: a member who sees no space yet.
 *
 * `profiles` = per-profile grants without membership, each carrying its own
 * role, so a user can be an editor on one profile and a viewer on another.
 * New ones need a plan with per-profile access.
 */
export const accessGrantSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("all"),
    role: workspaceRoleSchema,
    spaceIds: z
      .array(z.string().uuid())
      .max(ACCESS_SPACES_MAX, `Too many spaces (max ${ACCESS_SPACES_MAX})`)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate space in access grant")
      .optional(),
  }),
  z.object({
    mode: z.literal("profiles"),
    entries: z
      .array(z.object({ profileId: z.string().uuid(), role: workspaceRoleSchema }))
      .min(1, "Pick at least one profile")
      .max(ACCESS_PROFILES_MAX, `Too many profiles (max ${ACCESS_PROFILES_MAX})`)
      // Guard against the same profile appearing twice with conflicting roles.
      .refine(
        (entries) => new Set(entries.map((e) => e.profileId)).size === entries.length,
        "Duplicate profile in access grant",
      ),
  }),
]);
export type AccessGrant = z.infer<typeof accessGrantSchema>;

/** Add someone to a workspace by email, at the given access scope. */
export const addMemberSchema = z.object({
  email: inviteEmailSchema,
  access: accessGrantSchema,
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

/** Re-scope a registered member's access. */
export const setMemberAccessSchema = z.object({
  userId: z.string().uuid(),
  access: accessGrantSchema,
});

/** Re-scope a pending invite (keyed by email). */
export const setInviteAccessSchema = z.object({
  email: inviteEmailSchema,
  access: accessGrantSchema,
});

export const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: workspaceRoleSchema,
});

/** The secret in an invite's join link (`lib/invite-links.ts` mints them). */
export const inviteTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, "That invite link isn't valid");


/**
 * What `startCheckout` (`services/billing.ts`) is asked to sell: a Plus or Pro
 * plan for a billing period, or one AI top-up. Never a price — the server reads
 * that from `lib/pricing.ts`. `currency` only picks which price list.
 */
export const startCheckoutSchema = z.discriminatedUnion("item", [
  z.object({
    item: z.literal("plan"),
    plan: z.enum(PAID_PERSONAL_PLANS as readonly [PaidPersonalPlan, ...PaidPersonalPlan[]]),
    period: z.enum(PERIODS as readonly [Period, ...Period[]]),
    currency: z.enum(CURRENCIES.map((c) => c.code) as [Currency, ...Currency[]]).optional(),
  }),
  z.object({
    item: z.literal("topup"),
    currency: z.enum(CURRENCIES.map((c) => c.code) as [Currency, ...Currency[]]).optional(),
  }),
]);
export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;

/* -------------------------------------------------------------------------- */
/* Split (groups outside workspaces)                                           */
/* -------------------------------------------------------------------------- */

/** Column widths for the split tables — the DB rejects exactly what these do. */
export const SPLIT_GROUP_NAME_MAX = 40;
export const SPLIT_MEMBER_NAME_MAX = 40;
export const SPLIT_ICON_MAX = 16;
/** Same as a transaction title, so "add my share to my workspace" never truncates. */
export const SPLIT_EXPENSE_TITLE_MAX = TRANSACTION_TITLE_MAX;
/** People one request may add: everyone but the creator. */
export const SPLIT_ADD_PEOPLE_MAX = SPLIT_GROUP_MAX_PEOPLE - 1;
/** Expenses and payments per page of a group's chat (the web's "Show earlier"). */
export const SPLIT_FEED_PAGE = 50;

const splitGroupNameSchema = z
  .string()
  .trim()
  .min(1, "Give the group a name")
  .max(SPLIT_GROUP_NAME_MAX, `Name is too long (max ${SPLIT_GROUP_NAME_MAX} characters)`);
const splitIconSchema = z.string().trim().max(SPLIT_ICON_MAX);
const splitCurrencySchema = z.enum(CURRENCY_CODES as [string, ...string[]], {
  error: "Pick a currency",
});
const splitIdSchema = z.string().uuid();

/**
 * Someone to add to a group: the name everyone in the group sees, and the email
 * only the creator sees (it's how they're invited and how joining is bound).
 * The name is required so a label never has to be derived from the address.
 */
export const splitPersonSchema = z.object({
  email: inviteEmailSchema,
  name: z
    .string()
    .trim()
    .min(1, "Add their name")
    .max(SPLIT_MEMBER_NAME_MAX, `Name is too long (max ${SPLIT_MEMBER_NAME_MAX} characters)`),
});

const splitPeopleSchema = z
  .array(splitPersonSchema)
  .max(SPLIT_ADD_PEOPLE_MAX, `A group holds up to ${SPLIT_GROUP_MAX_PEOPLE} people`)
  .refine(
    (people) => new Set(people.map((p) => p.email)).size === people.length,
    "That email is in the list twice",
  );

export const createSplitGroupSchema = z.object({
  name: splitGroupNameSchema,
  icon: splitIconSchema.nullish(),
  currency: splitCurrencySchema,
  members: splitPeopleSchema.optional().default([]),
});
export type CreateSplitGroupInput = z.input<typeof createSplitGroupSchema>;

/** Rename / re-icon (`icon: null` or "" clears it) / change currency while empty. */
export const updateSplitGroupSchema = z
  .object({
    name: splitGroupNameSchema.optional(),
    icon: splitIconSchema.nullish(),
    currency: splitCurrencySchema.optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.icon !== undefined || v.currency !== undefined,
    "Nothing to update",
  );
export type UpdateSplitGroupInput = z.input<typeof updateSplitGroupSchema>;

export const addSplitMembersSchema = z.object({
  members: splitPeopleSchema.min(1, "Add at least one person"),
});
export type AddSplitMembersInput = z.input<typeof addSplitMembersSchema>;

/** A percent as typed: 0–100 with at most two decimals (stored as basis points). */
const splitPercentSchema = z.coerce
  .number()
  .finite()
  .min(0, "Percent can't be negative")
  .max(100, "Percent can't be over 100")
  .refine((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-6, "Use at most two decimals");

const splitExpenseBase = {
  title: z
    .string()
    .trim()
    .min(1, "Add a title")
    .max(SPLIT_EXPENSE_TITLE_MAX, `Title is too long (max ${SPLIT_EXPENSE_TITLE_MAX} characters)`),
  amount: amountSchema,
  paidBy: splitIdSchema,
  occurredOn: dateSchema,
};
const splitParticipantsMax = SPLIT_GROUP_MAX_PEOPLE;

/**
 * An expense and how to divide it. The shares sent here are *inputs* — member
 * ids (equal), amounts (exact) or percents — and the server computes every
 * stored share from them (`lib/split-math.ts`).
 */
export const splitExpenseSchema = z.discriminatedUnion("splitType", [
  z.object({
    ...splitExpenseBase,
    splitType: z.literal("equal"),
    memberIds: z.array(splitIdSchema).min(1, "Pick who it's split between").max(splitParticipantsMax),
  }),
  z.object({
    ...splitExpenseBase,
    splitType: z.literal("exact"),
    shares: z
      .array(
        z.object({
          memberId: splitIdSchema,
          amount: z.coerce
            .number()
            .finite()
            .min(0, "Amounts can't be negative")
            .max(TRANSACTION_AMOUNT_MAX, "Amount is too large (max 9 digits)"),
        }),
      )
      .min(1, "Pick who it's split between")
      .max(splitParticipantsMax),
  }),
  z.object({
    ...splitExpenseBase,
    splitType: z.literal("percent"),
    shares: z
      .array(z.object({ memberId: splitIdSchema, percent: splitPercentSchema }))
      .min(1, "Pick who it's split between")
      .max(splitParticipantsMax),
  }),
]);
export type SplitExpenseInput = z.input<typeof splitExpenseSchema>;

/** "Mark as paid": `from` paid `to` this much. */
export const splitSettlementSchema = z
  .object({
    fromMemberId: splitIdSchema,
    toMemberId: splitIdSchema,
    amount: amountSchema,
    settledOn: dateSchema,
  })
  .refine((v) => v.fromMemberId !== v.toMemberId, "Pick two different people");
export type SplitSettlementInput = z.input<typeof splitSettlementSchema>;

/**
 * "Add my share to my workspace". `amount` is in the *workspace* currency and
 * only read when it differs from the group's; with the same currency the share
 * itself is the amount.
 */
export const addSplitShareToWorkspaceSchema = z.object({
  profileId: splitIdSchema,
  categoryId: splitIdSchema.nullish(),
  title: z
    .string()
    .trim()
    .max(TRANSACTION_TITLE_MAX, `Title is too long (max ${TRANSACTION_TITLE_MAX} characters)`)
    .optional(),
  occurredOn: dateSchema.optional(),
  amount: amountSchema.optional(),
});
export type AddSplitShareToWorkspaceInput = z.input<typeof addSplitShareToWorkspaceSchema>;

/**
 * "Update my entry" after the expense changed. `amount` is in the entry's
 * workspace currency and only read when it differs from the group's.
 */
export const updateSplitWorkspaceEntrySchema = z.object({
  amount: amountSchema.optional(),
});
export type UpdateSplitWorkspaceEntryInput = z.input<typeof updateSplitWorkspaceEntrySchema>;

/**
 * A group brought in from the free split calculator (`lib/split-import.ts`).
 * People are named by the draft's short keys; this checks the shape and the
 * people, and each expense is then checked again by `splitExpenseSchema` once
 * its keys are member ids — so an imported expense meets exactly the rules of
 * one typed into the app.
 */
const splitDraftRefSchema = z
  .string()
  .regex(SPLIT_DRAFT_REF_PATTERN, "That draft doesn't look right — open the calculator and try again");
const splitImportExpenseBase = {
  title: z.string(),
  amount: z.number(),
  paidBy: splitDraftRefSchema,
  occurredOn: z.string(),
};
const splitImportExpenseSchema = z.discriminatedUnion("splitType", [
  z.object({
    ...splitImportExpenseBase,
    splitType: z.literal("equal"),
    memberIds: z.array(splitDraftRefSchema).max(splitParticipantsMax),
  }),
  z.object({
    ...splitImportExpenseBase,
    splitType: z.literal("exact"),
    shares: z.array(z.object({ memberId: splitDraftRefSchema, amount: z.number() })).max(splitParticipantsMax),
  }),
  z.object({
    ...splitImportExpenseBase,
    splitType: z.literal("percent"),
    shares: z.array(z.object({ memberId: splitDraftRefSchema, percent: z.number() })).max(splitParticipantsMax),
  }),
]);

export const splitImportSchema = z
  .object({
    name: splitGroupNameSchema,
    icon: splitIconSchema.nullish(),
    currency: splitCurrencySchema,
    me: z.object({ ref: splitDraftRefSchema, name: splitPersonSchema.shape.name }),
    people: z
      .array(splitPersonSchema.extend({ ref: splitDraftRefSchema }))
      .max(SPLIT_ADD_PEOPLE_MAX, `A group holds up to ${SPLIT_GROUP_MAX_PEOPLE} people`)
      .refine(
        (people) => new Set(people.map((p) => p.email)).size === people.length,
        "That email is in the list twice",
      ),
    expenses: z
      .array(splitImportExpenseSchema)
      .max(SPLIT_IMPORT_EXPENSES_MAX, `A group can bring in up to ${SPLIT_IMPORT_EXPENSES_MAX} expenses at once`),
  })
  .refine(
    (v) => new Set([v.me.ref, ...v.people.map((p) => p.ref)]).size === v.people.length + 1,
    "Two people in the draft share a key — open the calculator and try again",
  );

// ── Budgets ────────────────────────────────────────────────────────────────

export const budgetScopeSchema = z.enum(BUDGET_SCOPES);

/** A calendar month, "2026-10", between 1970 and 2999. */
export const budgetMonthSchema = z
  .string()
  .refine(isMonthKey, "Month must be YYYY-MM, between 1970 and 2999");

const budgetEmailAlertsSchema = z.boolean().optional();

/** What people call a budget ("Groceries this month"). */
export const budgetTitleSchema = z
  .string()
  .trim()
  .min(1, "Give the budget a title")
  .max(BUDGET_TITLE_MAX, `Title is too long (max ${BUDGET_TITLE_MAX} characters)`);

/** An optional note; blank clears it. */
export const budgetDescriptionSchema = z
  .string()
  .trim()
  .max(BUDGET_DESCRIPTION_MAX, `Description is too long (max ${BUDGET_DESCRIPTION_MAX} characters)`)
  .transform((v) => (v === "" ? null : v));

/** The fields every new budget shares. A missing title gets the suggested one. */
const newBudgetFields = {
  amount: amountSchema,
  emailAlerts: budgetEmailAlertsSchema,
  title: budgetTitleSchema.optional(),
  description: budgetDescriptionSchema.nullish(),
};

/**
 * A new monthly budget: the whole workspace, one space, one profile, or one
 * expense category. `amount` is in major units of the workspace currency, like
 * a transaction's.
 */
export const createBudgetSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("workspace"), ...newBudgetFields }),
  z.object({ scope: z.literal("space"), spaceId: z.string().uuid("Pick a space"), ...newBudgetFields }),
  z.object({ scope: z.literal("profile"), profileId: z.string().uuid("Pick a profile"), ...newBudgetFields }),
  z.object({
    scope: z.literal("category"),
    categoryId: z.string().uuid("Pick a category"),
    ...newBudgetFields,
  }),
]);
export type CreateBudgetInput = z.input<typeof createBudgetSchema>;

/**
 * Change a budget's amount, email alerts, title or description (null or blank
 * clears it). What it covers is fixed.
 */
export const updateBudgetSchema = z
  .object({
    amount: amountSchema.optional(),
    emailAlerts: z.boolean().optional(),
    title: budgetTitleSchema.optional(),
    description: budgetDescriptionSchema.nullish(),
  })
  .refine(
    (v) =>
      v.amount !== undefined ||
      v.emailAlerts !== undefined ||
      v.title !== undefined ||
      v.description !== undefined,
    "Nothing to update",
  );
export type UpdateBudgetInput = z.input<typeof updateBudgetSchema>;

// ── Ask (AI chat over your transactions) ───────────────────────────────────

/**
 * Longest chat title. Also the `ai_chats.title` column width, so the database
 * rejects exactly what the app does. A new chat is titled from its first
 * question, cut to `AI_CHAT_AUTO_TITLE_MAX` (`chatTitleFrom`); a rename may use
 * the full width.
 */
export const AI_CHAT_TITLE_MAX = 80;

/**
 * Longest question one message may ask, in characters. A question is a
 * sentence or two; the cap keeps a paste from turning one AI action into a
 * prompt the size of a document. The composer enforces it too.
 */
export const AI_CHAT_QUESTION_MAX = 1000;

const aiChatIdSchema = z.string().uuid("That chat doesn't exist");

/**
 * Control characters that may not reach an Ask message: all of C0 except tab
 * and newline, and DEL. NUL is the one that bites — Postgres `text` refuses it,
 * so a question carrying one used to get all the way through a paid model call
 * and then fail at the insert — but none of the others belong in a question,
 * an answer or a title either.
 */
const ASK_CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/** Text with the control characters Ask stores no copy of taken out (tab and newline kept). */
export function stripControlChars(text: string): string {
  return text.replace(ASK_CONTROL_CHARS, "");
}

/** One question to Ask, in a chat or (no `chatId`) starting a new one. */
export const askAiSchema = z.object({
  chatId: aiChatIdSchema.optional(),
  question: z
    .string()
    .transform(stripControlChars)
    .pipe(
      z
        .string()
        .trim()
        .min(1, "Type a question first")
        .max(AI_CHAT_QUESTION_MAX, `Keep it under ${AI_CHAT_QUESTION_MAX} characters`),
    ),
});
export type AskAiInput = z.input<typeof askAiSchema>;

export const renameAiChatSchema = z.object({
  chatId: aiChatIdSchema,
  // A title is one line: tabs and newlines go too, as spaces.
  title: z
    .string()
    .transform((t) => stripControlChars(t).replace(/[\t\n]+/g, " "))
    .pipe(
      z
        .string()
        .trim()
        .min(1, "Give the chat a name")
        .max(AI_CHAT_TITLE_MAX, `Keep it under ${AI_CHAT_TITLE_MAX} characters`),
    ),
});
export type RenameAiChatInput = z.input<typeof renameAiChatSchema>;
