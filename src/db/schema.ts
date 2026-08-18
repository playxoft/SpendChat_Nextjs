import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
// Relative (not "@/…") so drizzle-kit's schema loader resolves it without the
// tsconfig path alias. Keeps the DB column length in lockstep with the Zod cap.
import {
  ATTACHMENT_FILENAME_MAX,
  ATTACHMENT_KINDS,
  ATTACHMENT_LABEL_MAX,
  FILE_CATEGORY_MAX,
  FILE_NAME_MAX,
  FILE_TAG_MAX,
  FOLDER_NAME_MAX,
  TRANSACTION_DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX,
} from "../lib/validation";
import type { UiPrefs } from "../lib/validation";

/** Time-ordered UUIDv7 default (Postgres 18 built-in). Use for all our PKs. */
const uuidV7 = sql`uuidv7()`;

/** Income vs. expense. Used by both categories and transactions. */
export const txnTypeEnum = pgEnum("txn_type", ["income", "expense"]);

/**
 * RBAC roles, lowest to highest: viewer (read), editor (read + write
 * transactions), admin (everything incl. members/profiles/workspace settings).
 * Used both workspace-wide (workspace_members) and per-profile (profile_access);
 * a user's effective role on a profile is the higher of the two.
 */
export const workspaceRoleEnum = pgEnum("workspace_role", ["viewer", "editor", "admin"]);

/** Optional preset tag for a transaction attachment (receipt/bill/invoice/other). */
export const attachmentKindEnum = pgEnum("attachment_kind", ATTACHMENT_KINDS);

/**
 * Application identity. `id` is our own uuidv7 — the value stored in every
 * `user_id` / `owner_id` column across the schema. `firebase_uid` links to the
 * Firebase Auth account; we translate Firebase UID → this `id` at the auth
 * boundary (`resolveUser`), so the rest of the app never sees a provider id.
 * Email/name/image are synced from the verified Firebase token.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    firebaseUid: text("firebase_uid").notNull().unique(),
    email: text("email"),
    name: text("name"),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One account per email, case-insensitive. Emails are stored lowercased
    // (`normalizeEmail` in identity.ts), so `lower(email)` is belt-and-suspenders.
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
  ],
);

/**
 * A workspace groups profiles (threads) and members. Every user gets a default
 * workspace ("<name>'s Workspace") at bootstrap and can create/join more.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    name: text("name").notNull(),
    // Optional emoji shown beside the workspace name (like `profiles.icon`).
    // Nullable; the app seeds a default at creation and the UI falls back.
    icon: text("icon"),
    // Internal (`users.id`) id of the creator. Owners always have the admin role.
    ownerId: uuid("owner_id").notNull(),
    // Currency + number format (locale) are per-workspace: every member of a
    // workspace sees amounts in this currency, formatted with this locale.
    // (Theme and input mode stay per-user in user_settings.)
    currency: text("currency").notNull().default("USD"),
    locale: text("locale").notNull().default("en-US"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workspaces_owner_idx").on(t.ownerId)],
);

/** Workspace-wide membership: the role applies to every profile in the workspace. */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: workspaceRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // "Which workspaces am I in?" — the switcher's query.
    index("workspace_members_user_idx").on(t.userId),
  ],
);

/**
 * Per-profile access grant, for sharing a single profile without (or beyond)
 * workspace-wide membership. Effective role = max(workspace role, this role).
 */
export const profileAccess = pgTable(
  "profile_access",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: workspaceRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.userId] }),
    index("profile_access_user_idx").on(t.userId),
  ],
);

/**
 * Pending invite for an email that has no account yet. Accepted
 * (converted to a membership / profile grant) automatically at the invitee's
 * first bootstrap. `profileId` null means a workspace-wide invite.
 */
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // stored lowercased
    role: workspaceRoleEnum("role").notNull().default("viewer"),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_invites_ws_email_profile_uq").on(
      t.workspaceId,
      t.email,
      // Coalesce so "workspace-wide" (null profile) is unique per email too.
      sql`coalesce(${t.profileId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index("workspace_invites_email_idx").on(t.email),
    // FK maintenance: cascade when the referenced profile is deleted.
    index("workspace_invites_profile_idx").on(t.profileId),
  ],
);

/**
 * Outbound-email audit log: one row per user-triggered send (invites/member
 * notifications are the only ones today). Exists to rate-limit sends per user —
 * recipients are arbitrary addresses, so without a cap a malicious account
 * could use our verified sending domain as a spam/phishing primitive.
 * Deliberately stores no recipient address (it's PII we don't need here).
 */
export const emailSendLog = pgTable(
  "email_send_log",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    /** The user whose action triggered the send (the sender, not the recipient). */
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The rate-limit query: sends by this user in the last hour.
    index("email_send_log_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * AI-request audit log: one row per call that reaches a paid model provider
 * (today only the composer's AI transaction parse). Same rationale as
 * `email_send_log` — an authenticated user can otherwise loop a server action
 * that spends the operator's API budget — and it doubles as the usage record.
 * Stores no note text: the input is the user's own financial data and none of it
 * is needed to count requests.
 */
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    /** Labels the call site ("transaction_parse"); the budget is one pool per user. */
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The rate-limit query: requests by this user in the last hour.
    index("ai_usage_log_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * Per-user preferences that follow the user across every workspace: theme, the
 * transaction-composer input mode, the languages voice entry expects, and the
 * `ui_prefs` display bag.
 * Currency and number format are NOT here — they belong to the workspace (see
 * `workspaces.currency` / `.locale`). `user_id` is our internal uuidv7 (resolved
 * from Firebase at the auth boundary). One row per user; created on first
 * sign-in (bootstrap).
 */
export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  theme: text("theme").notNull().default("system"),
  // How the transaction composer lays out its inputs:
  //   amount_title — amount field, then title (default / original layout)
  //   title_amount — title field, then amount
  //   combined     — one field holding two zones: an amount chip and the title
  //                  beside it (a paste of "100 fruits" splits across them)
  inputMode: text("input_mode").notNull().default("amount_title"),
  // ISO 639-1 codes the speech-to-text model is told to expect, e.g.
  // {en,ta,te} for someone who mixes Tamil and Telugu with English. A list (not
  // one code) because the transcription model takes a free-text language hint —
  // see `lib/voice-languages.ts`. Validated against the known set on both read
  // and write, so a hand-edited row can't reach the prompt.
  voiceLanguages: text("voice_languages")
    .array()
    .notNull()
    .default(sql`'{en}'::text[]`),
  // Display preferences for the app's own surfaces, namespaced by surface
  // (`{ composer: { density } }` today). A jsonb bag rather than a column per
  // toggle because these are expected to multiply — the composer alone has more
  // display options coming — and each new key ships as a Zod default instead of
  // a migration. Shape and defaults live in `uiPrefsSchema`; read it through
  // `normalizeUiPrefs` and write it by merging in SQL, never by storing a parsed
  // object (see the schema's doc comment for why both matter).
  uiPrefs: jsonb("ui_prefs").$type<UiPrefs>().notNull().default(sql`'{}'::jsonb`),
  // The workspace the user last had open; the switcher persists it here.
  lastWorkspaceId: uuid("last_workspace_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A "profile" groups transactions like a chat thread (Personal, Company, Home…).
 * Every user has at least one ("Personal"), created on bootstrap. Currency is a
 * workspace-level setting (`workspaces.currency`) — profiles don't carry one.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    // The creator's user id (attribution). Access control lives on the
    // workspace (workspace_members) and per-profile grants (profile_access).
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    // Manual ordering for the sidebar (drag-to-sort).
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_user_sort_idx").on(t.userId, t.sortOrder),
    index("profiles_workspace_idx").on(t.workspaceId, t.sortOrder),
    // Names are unique within a workspace (was per-user pre-workspaces).
    uniqueIndex("profiles_workspace_name_uq").on(t.workspaceId, t.name),
  ],
);

/**
 * Categories are workspace-scoped: everyone in a workspace shares one list, and
 * creating one only affects the current workspace. `userId` is created-by
 * attribution (like `profiles.userId` / `transactions.userId`), not the access
 * key — access is the workspace.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: txnTypeEnum("kind").notNull(),
    icon: text("icon"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Filter categories by workspace + income/expense.
    index("categories_workspace_kind_idx").on(t.workspaceId, t.kind),
    // Prevent duplicate category names per workspace/kind.
    uniqueIndex("categories_workspace_name_kind_uq").on(t.workspaceId, t.name, t.kind),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: uuid("user_id").notNull(),
    type: txnTypeEnum("type").notNull(),
    // Amount stored as a positive integer in the currency's minor units (e.g. cents).
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // Which profile (thread) this transaction belongs to. Backfilled to "Personal".
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    // Short headline for the transaction (was `note`). Length matches the Zod
    // cap (`TRANSACTION_TITLE_MAX`) so the DB rejects anything the app would.
    title: varchar("title", { length: TRANSACTION_TITLE_MAX }),
    // Longer free-text body shown on expand / in the detail dialog. Length is
    // the shared `TRANSACTION_DESCRIPTION_MAX`, in lockstep with validation.
    description: varchar("description", { length: TRANSACTION_DESCRIPTION_MAX }),
    occurredOn: date("occurred_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Primary list + date-range filtering (most common query).
    index("transactions_user_date_idx").on(t.userId, t.occurredOn.desc()),
    // Filter by category.
    index("transactions_user_category_idx").on(t.userId, t.categoryId),
    // Filter by income/expense.
    index("transactions_user_type_idx").on(t.userId, t.type),
    // Chat feed ordering (newest first by entry time).
    index("transactions_user_created_idx").on(t.userId, t.createdAt.desc()),
    // Filter a user's transactions by profile (thread).
    index("transactions_user_profile_idx").on(t.userId, t.profileId),
    // FK maintenance: the composites above lead with user_id, so they can't
    // serve a lookup keyed only on the FK column (category delete → set null,
    // profile delete → restrict check). Single-column indexes for those.
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_profile_idx").on(t.profileId),
  ],
);

/**
 * A file (receipt / bill / invoice / any document) attached to a transaction.
 * Access is inherited from the transaction's profile — `profileId` and
 * `workspaceId` are denormalized from the parent so attachment reads scope the
 * same profile-wise + workspace-wise way transactions do, without a join back.
 * The bytes live in R2 under `r2Key`; the row is metadata only. A transaction
 * delete cascades these rows away (the service also deletes the R2 objects).
 * `userId` is uploader attribution, never the access key.
 */
export const transactionAttachments = pgTable(
  "transaction_attachments",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    // Denormalized from the parent transaction for access scoping + cascade.
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Who uploaded it (attribution). Access is the transaction's profile role.
    userId: uuid("user_id").notNull(),
    // The R2 object key the bytes live under (never a public URL — served only
    // through the authenticated download route).
    r2Key: text("r2_key").notNull(),
    // A small preview object (image attachments only), so the tile loads instantly
    // without pulling the full-size original. Null for non-images / legacy rows.
    thumbnailKey: text("thumbnail_key"),
    // Original filename, used for the download's Content-Disposition.
    fileName: varchar("file_name", { length: ATTACHMENT_FILENAME_MAX }).notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    // Optional preset tag and optional custom display name — neither mandatory.
    kind: attachmentKindEnum("kind"),
    label: varchar("label", { length: ATTACHMENT_LABEL_MAX }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The primary read: all attachments for a transaction, oldest first.
    index("txn_attachments_txn_idx").on(t.transactionId, t.createdAt),
    // FK maintenance for the profile/workspace cascade deletes.
    index("txn_attachments_profile_idx").on(t.profileId),
    // Per-workspace listing / future storage metering.
    index("txn_attachments_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

/**
 * A vault tag: a per-profile named + colored label. Files and folders
 * reference tags by id (`tag_ids` uuid[]) — free-text tags don't exist, so a
 * tag rename/recolor updates every tagged item at once. `color` is hex text
 * (`#rrggbb`); today's UI picks from a fixed palette but the column accepts
 * any hex so custom colors need no migration.
 */
export const fileTags = pgTable(
  "file_tags",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Creator attribution — access is the profile role, never this column.
    userId: uuid("user_id").notNull(),
    name: varchar("name", { length: FILE_TAG_MAX }).notNull(),
    color: varchar("color", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One name per profile, case-insensitive ("Legal" == "legal").
    uniqueIndex("file_tags_profile_name_uq").on(t.profileId, sql`lower(${t.name})`),
    // FK maintenance for the workspace cascade.
    index("file_tags_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * A folder in the files vault (board resolutions, land/house papers,
 * certificates…). Folders nest via `parentId` (null = root) and belong to a
 * profile, so the vault scopes exactly like transactions: access = the
 * caller's effective role on the profile in the current workspace.
 * `workspaceId` is denormalized for the same reason as on
 * `transaction_attachments`. Deleting a folder cascades its subtree (the
 * service also deletes the R2 objects of every descendant file first).
 */
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Self-reference: null = a root folder. Cascade removes the whole subtree.
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, {
      onDelete: "cascade",
    }),
    // Creator attribution — access is the profile role, never this column.
    userId: uuid("user_id").notNull(),
    name: varchar("name", { length: FOLDER_NAME_MAX }).notNull(),
    // Optional accent (hex, like `file_tags.color`); null = the neutral default.
    color: varchar("color", { length: 16 }),
    /**
     * Marks a predefined folder the service manages: `"transactions"` is the
     * per-profile "Transaction attachments" folder that mirrors the profile's
     * transaction files. System folders can be recolored/tagged but never
     * renamed, moved, deleted, shared, or given children. Null = a normal
     * user folder.
     */
    systemKey: text("system_key"),
    tagIds: uuid("tag_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Browsing: the children of one folder (or the roots) within a profile.
    index("folders_profile_parent_idx").on(t.profileId, t.parentId),
    // At most one system folder of each kind per profile (the lazy-create races).
    uniqueIndex("folders_profile_system_uq")
      .on(t.profileId, t.systemKey)
      .where(sql`${t.systemKey} is not null`),
    // FK maintenance for the workspace/parent cascade deletes.
    index("folders_workspace_idx").on(t.workspaceId),
    index("folders_parent_idx").on(t.parentId),
  ],
);

/**
 * A stored file in the vault. Bytes live in R2 under `r2Key`; the row is
 * metadata. `folderId` null = the profile's root. `category` is a free-text
 * column constrained to the preset list at the write boundary (adding a preset
 * is a code change, not a migration). Access scopes by `profileId` exactly like
 * transactions; `userId` is uploader attribution.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    r2Key: text("r2_key").notNull(),
    // A small preview object (like `transaction_attachments.thumbnail_key`),
    // generated client-side at upload; null for types without one / older rows.
    thumbnailKey: text("thumbnail_key"),
    name: varchar("name", { length: FILE_NAME_MAX }).notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    category: varchar("category", { length: FILE_CATEGORY_MAX }),
    tagIds: uuid("tag_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The vault's default listing: a workspace's files, newest first.
    index("files_workspace_created_idx").on(t.workspaceId, t.createdAt.desc()),
    // Browsing a folder + FK maintenance for the cascades.
    index("files_profile_idx").on(t.profileId),
    index("files_folder_idx").on(t.folderId),
  ],
);

/**
 * A public share link for one file or one folder (exactly one is set). The
 * token IS the capability — anyone holding the URL can view, and download when
 * `allowDownload`. Revoking = deleting the row; `expiresAt` null = no expiry.
 * `profileId`/`workspaceId` are denormalized so a profile/workspace delete
 * sweeps its links, and creating a link requires editor on the profile.
 */
export const fileShares = pgTable(
  "file_shares",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
    // Who created the link (attribution).
    userId: uuid("user_id").notNull(),
    // URL-safe random secret (256 bits, base64url) — never an id we mint elsewhere.
    token: varchar("token", { length: 64 }).notNull(),
    allowDownload: boolean("allow_download").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The public resolution path: token → share.
    uniqueIndex("file_shares_token_uq").on(t.token),
    // "Links for this file/folder" in the share dialog + FK maintenance.
    index("file_shares_file_idx").on(t.fileId),
    index("file_shares_folder_idx").on(t.folderId),
    index("file_shares_profile_idx").on(t.profileId),
    index("file_shares_workspace_idx").on(t.workspaceId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionAttachment = typeof transactionAttachments.$inferSelect;
export type NewTransactionAttachment = typeof transactionAttachments.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type FileTag = typeof fileTags.$inferSelect;
export type NewFileTag = typeof fileTags.$inferInsert;
// "StoredFile", not "File" — the DOM's global `File` type is live in this app
// (uploads), and shadowing it invites silent type confusion.
export type StoredFile = typeof files.$inferSelect;
export type NewStoredFile = typeof files.$inferInsert;
export type FileShare = typeof fileShares.$inferSelect;
export type NewFileShare = typeof fileShares.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type ProfileAccess = typeof profileAccess.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type WorkspaceRole = (typeof workspaceRoleEnum.enumValues)[number];
