import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
// Relative (not "@/…") so drizzle-kit's schema loader resolves it without the
// tsconfig path alias. Keeps the DB column length in lockstep with the Zod cap.
import {
  AI_CHAT_TITLE_MAX,
  ATTACHMENT_FILENAME_MAX,
  ATTACHMENT_KINDS,
  ATTACHMENT_LABEL_MAX,
  FILE_CATEGORY_MAX,
  FILE_NAME_MAX,
  FILE_TAG_MAX,
  FOLDER_NAME_MAX,
  ORGANIZATION_NAME_MAX,
  SPACE_NAME_MAX,
  SPLIT_EXPENSE_TITLE_MAX,
  SPLIT_GROUP_NAME_MAX,
  SPLIT_ICON_MAX,
  SPLIT_MEMBER_NAME_MAX,
  TAG_NAME_MAX,
  TRANSACTION_DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX,
} from "../lib/validation";
import type { UiPrefs } from "../lib/validation";
import type { Acquisition } from "../lib/attribution";
import { PERSONAL_PLANS } from "../lib/plans";
import {
  BUDGET_DESCRIPTION_MAX,
  BUDGET_PERIODS,
  BUDGET_SCOPES,
  BUDGET_TITLE_MAX,
} from "../lib/budgets";

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

/**
 * A role inside one space: read (viewer) or read + write (editor). Narrower
 * than `workspace_role` on purpose — "admin" is a workspace-wide role (admins
 * see every space), so a space can't grant it.
 */
export const spaceRoleEnum = pgEnum("space_role", ["viewer", "editor"]);

/** `personal` = one per account (holds the person's workspaces); `business` comes later. */
export const organizationKindEnum = pgEnum("organization_kind", ["personal", "business"]);

/** A workspace's plan (`src/lib/plans.ts` holds what each one includes). */
export const workspacePlanEnum = pgEnum("workspace_plan", PERSONAL_PLANS);

/** Optional preset tag for a transaction attachment (receipt/bill/invoice/other). */
export const attachmentKindEnum = pgEnum("attachment_kind", ATTACHMENT_KINDS);

/** What a budget covers: the whole workspace, one space, one profile, or one expense category. */
export const budgetScopeEnum = pgEnum("budget_scope", BUDGET_SCOPES);

/** How often a budget resets. Monthly only today; the enum leaves room for more. */
export const budgetPeriodEnum = pgEnum("budget_period", BUDGET_PERIODS);

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
    // Where the account came from: the browser's first-touch channel (UTM tags,
    // a directory's `?ref=`, the referring host), written on the INSERT only,
    // plus the "how did you hear about us" answer merged in later. Shape and
    // rules in `src/lib/attribution.ts`; null for accounts that predate it or
    // whose browser sent nothing. Read back with `pnpm growth:report:prod`.
    acquisition: jsonb("acquisition").$type<Acquisition>(),
    // When the one-time welcome email was claimed for this account. Claimed
    // with `UPDATE … WHERE welcomed_at IS NULL RETURNING`, so two concurrent
    // first requests can't both send it (see `lib/welcome-email.ts`). Null for
    // accounts that predate it — they never receive one retroactively.
    welcomedAt: timestamp("welcomed_at", { withTimezone: true }),
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
 * The top of the hierarchy: organisation → workspace → space → profile.
 *
 * Every account owns exactly one `personal` organisation (created at
 * bootstrap), which holds the workspaces that person creates. Plans and
 * billing are **per workspace**, not per organisation — the organisation is
 * the container the Settings page lists them under. `business` organisations
 * (many per account, all paid) are a later phase; the enum carries the value
 * now so that phase is a data change, not an enum migration.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    name: varchar("name", { length: ORGANIZATION_NAME_MAX }).notNull(),
    // Internal (`users.id`) id of the account that owns it.
    ownerId: uuid("owner_id").notNull(),
    kind: organizationKindEnum("kind").notNull().default("personal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One personal organisation per account — what makes bootstrap's
    // "find or create" race-safe (`onConflictDoNothing` on this index).
    uniqueIndex("organizations_personal_owner_uq")
      .on(t.ownerId)
      .where(sql`${t.kind} = 'personal'`),
  ],
);

/**
 * A workspace groups profiles (threads) and members. Every user gets a default
 * workspace ("<name>'s Workspace") at bootstrap and can create/join more.
 *
 * It is also the unit a plan is bought for: `plan` decides the limits every
 * member of the workspace shares (AI actions, storage, members, spaces…).
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
    // The organisation it belongs to — the owner's personal one today.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Limits apply from the day plans ship — there is no grace period (the app
    // isn't launched; 0037 dropped the short-lived `grandfathered` flag).
    plan: workspacePlanEnum("plan").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("workspaces_owner_idx").on(t.ownerId),
    // "Every workspace in this organisation" (Settings → Organisation) and the
    // organisation FK's restrict check.
    index("workspaces_organization_idx").on(t.organizationId),
  ],
);

/**
 * A space groups profiles inside a workspace (Notion-style: workspace → space →
 * profile), and it is the unit of sharing: a non-admin member sees only the
 * spaces they're added to (`space_members`). Workspace admins see every space —
 * there are no private spaces.
 *
 * Every workspace has at least one; the first is created with the workspace
 * (`DEFAULT_SPACE_NAME`). `position` orders them in the sidebar.
 */
export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: SPACE_NAME_MAX }).notNull(),
    icon: text("icon"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The sidebar's listing, in order; also serves the workspace FK cascade.
    index("spaces_workspace_position_idx").on(t.workspaceId, t.position),
    // Names are unique within a workspace, like profile names.
    uniqueIndex("spaces_workspace_name_uq").on(t.workspaceId, t.name),
    // The target of `profiles`' composite foreign key, which pins a profile's
    // space to the profile's own workspace (see `profiles_space_workspace_fk`).
    unique("spaces_id_workspace_uq").on(t.id, t.workspaceId),
  ],
);

/**
 * Who can open a space, and how: `viewer` reads every profile in it, `editor`
 * also writes. Members must be workspace members (the service enforces it, and
 * removing someone from the workspace removes these rows). Workspace admins
 * never need a row — they see every space.
 *
 * On Plus/Pro a per-profile override (`profile_overrides`) can change this for
 * one profile, in either direction.
 */
export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: spaceRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    // "Which spaces am I in?" and the account-deletion sweep.
    index("space_members_user_idx").on(t.userId),
  ],
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

/** A per-profile override inside a space: no access, read, or read + write. */
export const profileAccessLevelEnum = pgEnum("profile_access_level", ["none", "read", "write"]);

/**
 * Per-profile override for one workspace member (Plus/Pro feature).
 *
 * Unlike `profile_access`, which can only ever *add* access, an override
 * **replaces** whatever the member's space role would give on that one profile —
 * so it can lower access (`none` hides a profile inside a space they're in) as
 * well as raise it. Resolution order lives in `resolveProfileRole`
 * (`lib/rbac.ts`): workspace admin → override → space role / legacy grant.
 *
 * Only counted for workspace members, and never for admins (who see
 * everything). Creating or changing one needs a plan with
 * `profileLevelAccess`; existing rows keep enforcing after a downgrade, so a
 * downgrade can never widen anyone's access.
 */
export const profileOverrides = pgTable(
  "profile_overrides",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    access: profileAccessLevelEnum("access").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.userId] }),
    // Removing a member sweeps their overrides; account deletion too.
    index("profile_overrides_user_idx").on(t.userId),
  ],
);

/**
 * Pending invite for an email that has no account yet. Accepted
 * (converted to a membership / profile grant) automatically at the invitee's
 * first bootstrap, or explicitly from the `/invite/<token>` page.
 * `profileId` null means a workspace-wide invite.
 *
 * `token` is the secret in the emailed join link. One token is shared by every
 * row of a (workspace, email) group — the UI treats that group as a single
 * invite, and the email carries a single link — and it survives a re-scope, so
 * the link an admin already sent keeps working after they adjust the role.
 * Nullable only for rows that predate the column; those still convert by
 * email at bootstrap, they just have no link.
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
    token: text("token"),
    // For a workspace-wide (null-profile) invite below admin: the spaces the
    // person joins on acceptance, at `role`. Resolved to an explicit list when
    // the invite is written, so a space created later isn't silently included.
    // Null on per-profile rows, on admin invites (admins see every space), and on
    // rows written before spaces existed — those join every space, which is what
    // "workspace-wide" meant when they were sent.
    spaceIds: uuid("space_ids").array(),
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
    // The join page's lookup: every row of the invite group by its token.
    index("workspace_invites_token_idx").on(t.token),
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
 *
 * Nothing in the app deletes from this table; `pnpm db:health:*` sweeps rows
 * past its retention window (30 days by default), so the audit trail is only as
 * long as that window. The rate limiter itself reads one hour.
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
 * (the composer's AI parse and voice transcription). Same rationale as
 * `email_send_log` — an authenticated user can otherwise loop a server action
 * that spends the operator's API budget — and it is also **the usage record the
 * monthly AI allowance is counted from** (`units`, per workspace per calendar
 * month). Stores no note text: the input is the user's own financial data and
 * none of it is needed to count requests.
 *
 * No foreign key to `workspaces`, on purpose: a deleted workspace's rows must
 * keep counting against its owner's free allowance for the rest of the month
 * (abuse rule C2). Only `pnpm db:health:*` ever deletes, past its window — which
 * for this table never drops below `AI_USAGE_RETENTION_DAYS_MIN`, so the
 * current month is always complete.
 */
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    /** Labels the call site ("transaction_parse", "voice_transcribe"). */
    kind: text("kind").notNull(),
    /**
     * AI actions this call charged against the workspace's monthly allowance:
     * 1 for a typed note; one per started minute for a voice clip; 0 for the
     * parse that follows a paid transcription (voice = transcribe + parse).
     */
    units: integer("units").notNull().default(1),
    /** The workspace's owner and plan when the call was made (abuse rule C2). */
    ownerId: uuid("owner_id"),
    plan: workspacePlanEnum("plan"),
    /** Filled from the provider's usage metadata after the call; null if unknown. */
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    audioMs: integer("audio_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The rate-limit query: requests by this user in the last hour.
    index("ai_usage_log_user_created_idx").on(t.userId, t.createdAt),
    // The monthly allowance: this workspace's actions since the 1st.
    index("ai_usage_log_workspace_created_idx").on(t.workspaceId, t.createdAt),
    // A free owner's actions across all their free workspaces, deleted ones too.
    index("ai_usage_log_owner_created_idx").on(t.ownerId, t.createdAt),
  ],
);

/** Who wrote a message in an Ask chat. */
export const aiChatRoleEnum = pgEnum("ai_chat_role", ["user", "assistant"]);

/**
 * An Ask conversation: questions about the workspace's transactions, answered
 * by a model from a summary of them (`lib/ai-chat.ts`). **Private to the person
 * who started it** — every read and write is scoped by `user_id` *and*
 * `workspace_id`, so a chat never shows in another workspace, and no other
 * member (admins included) can open it.
 *
 * The workspace foreign key cascades: a deleted workspace takes its chats with
 * it. `user_id` has none, by house convention; account deletion removes the
 * rows explicitly (`services/settings.ts`). Titled from the first question, no
 * model call (`chatTitleFrom`). `updated_at` moves with every answer, so the
 * list reads newest-first off the index below.
 */
export const aiChats = pgTable(
  "ai_chats",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: AI_CHAT_TITLE_MAX }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "My chats here, newest first": an ascending index read backwards, which
    // is exactly `order by updated_at desc` — no `.desc()`, whose NULLS LAST
    // the planner won't match to a plain DESC sort.
    index("ai_chats_user_workspace_updated_idx").on(t.userId, t.workspaceId, t.updatedAt),
    // The workspace FK cascade.
    index("ai_chats_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * One message in an Ask chat. A question and its answer are written together,
 * after the answer arrives — a failed call stores nothing — with `created_at`
 * set by the app (asked, then answered), so the pair always sorts in order.
 * `units` is what the answer cost in AI actions (assistant rows only); the
 * charge itself lives in `ai_usage_log`, like every AI call's. 0 marks a
 * sample answer — no model, outside production — which nothing paid for.
 */
export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => aiChats.id, { onDelete: "cascade" }),
    role: aiChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    units: integer("units"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_chat_messages_chat_created_idx").on(t.chatId, t.createdAt)],
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
    // The space it sits in — which decides who can see it (`space_members`).
    // Always a space of the profile's own workspace: the composite foreign key
    // below makes a cross-workspace pointer impossible, because one would hand
    // the members of a space in workspace A a profile from workspace B.
    spaceId: uuid("space_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    // Manual ordering for the sidebar (drag-to-sort), within the space.
    sortOrder: integer("sort_order").notNull().default(0),
    // In the trash since this instant (null = live). Deleting a profile always
    // sends the whole profile here as one unit — its transactions, files and
    // folders stay as they were and are hidden because the access layer
    // (`accessibleProfileIds` / `getEffectiveProfileRole`) skips trashed
    // profiles. It has to be the profile: `transactions.profile_id` is ON DELETE
    // restrict, so a trashed transaction can't outlive its profile row. The
    // purge (`lib/trash-purge.ts`) hard-deletes it after `TRASH_DAYS`.
    // Millisecond precision like every `deleted_at` (see `transactions`).
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
    // Who sent it there (attribution only, like `user_id`; no foreign key).
    deletedBy: uuid("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_user_sort_idx").on(t.userId, t.sortOrder),
    index("profiles_workspace_idx").on(t.workspaceId, t.sortOrder),
    // Profiles of one space, in sidebar order; also the space FK's restrict check.
    index("profiles_space_sort_idx").on(t.spaceId, t.sortOrder),
    // Names are unique within a workspace (was per-user pre-workspaces) —
    // among *live* profiles, so "Home" can be created again the moment the old
    // "Home" goes to the trash. Restoring into a taken name renames the restored
    // one (`restoredName` in `lib/trash.ts`).
    uniqueIndex("profiles_workspace_name_uq")
      .on(t.workspaceId, t.name)
      .where(sql`${t.deletedAt} is null`),
    // Restrict, not cascade: deleting a space that still holds profiles must
    // fail — the service moves or deletes them first, deliberately.
    foreignKey({
      name: "profiles_space_workspace_fk",
      columns: [t.spaceId, t.workspaceId],
      foreignColumns: [spaces.id, spaces.workspaceId],
    }).onDelete("restrict"),
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

/**
 * A transaction tag: a workspace-scoped named + colored label, applied to
 * transactions through `transactions.tag_ids`.
 *
 * Workspace-scoped, like `categories` and unlike the vault's per-profile
 * `file_tags`, because the transactions list routinely shows every profile at
 * once ("All profiles") — per-profile tags would put two different "travel"
 * chips in the same column and leave the filter with nothing sane to list.
 * `userId` is created-by attribution, never the access key; access is the
 * workspace, reads need viewer and writes need editor.
 *
 * `color` is hex text (`#rrggbb`); today's UI picks from a fixed 20-swatch
 * palette but the column accepts any hex, so a custom picker needs no
 * migration. Same call as `file_tags.color`, for the same reason.
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    // Creator attribution — access is the workspace, never this column.
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: TAG_NAME_MAX }).notNull(),
    color: varchar("color", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One name per workspace, case-insensitive ("Travel" == "travel").
    uniqueIndex("tags_workspace_name_uq").on(t.workspaceId, sql`lower(${t.name})`),
    // Listing a workspace's tags in name order (`listTags`). Not redundant with
    // the unique index above, which orders by `lower(name)` — a sort by `name`
    // can't be read off it, since the two disagree on mixed case ("Zebra" vs
    // "apple"). It is *not* here for the workspace FK cascade: the unique index
    // already leads with `workspace_id` and serves that as a prefix.
    //
    // Honestly marginal at `TAGS_PER_WORKSPACE_MAX` = 100 — the planner will
    // likely scan and sort a list that short anyway. Kept because the cost is a
    // write on the rare tag mutation, and the alternative is a sort that grows
    // if that ceiling is ever raised.
    index("tags_workspace_name_idx").on(t.workspaceId, t.name),
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
    // The tags on this transaction, as ids into `tags` — the many-to-many edge
    // list, stored on the owning row rather than in a join table.
    //
    // That shape is chosen for the read path, not for storage. `tag_ids && $1`
    // is a predicate on `transactions` alone, so it composes into
    // `buildConditions` and every query built from it, and — the reason that
    // matters — it leaves `pageOf`'s per-profile merge-append intact. A join
    // table would put an `EXISTS` semi-join inside each of up to 24 `UNION ALL`
    // branches of the hottest query in the app.
    //
    // The cost is that there is no foreign key here, so deleting a tag has to
    // sweep the column by hand (`array_remove`, in `services/tags.ts`), exactly
    // as the vault does for `files.tag_ids`. Ids are uuidv7 like every other id
    // we mint; nothing puts a v4 in here.
    tagIds: uuid("tag_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    occurredOn: date("occurred_on").notNull(),
    // Millisecond precision, deliberately — this is the only timestamp in the
    // schema that a client sends back to us. It is the middle term of the
    // tracker feed's keyset cursor (`listFeedPage`), and the round trip goes
    // through a JavaScript `Date`, which holds milliseconds and silently drops
    // the microseconds Postgres would otherwise store. The cursor would then
    // name an instant fractionally *before* the row it came from, and every row
    // tied with that row — a bulk import shares `created_at` to the microsecond
    // across the whole batch — would sort after the cursor and be skipped. Rows
    // that exist, that the table shows, that scrolling the feed can never
    // reach. `timestamptz(3)` makes the round trip lossless, so ties stay ties
    // and `id` breaks them. Do not widen it without changing the cursor.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    // Narrowed alongside `created_at`, which it has to stay comparable with:
    // rounding one and not the other would leave rows that were never edited
    // reporting an `updated_at` fractionally *before* their `created_at`.
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    // In the trash since this instant; null = live. Every read excludes trashed
    // rows through `notTrashed(transactions)` (`lib/trash-scope.ts`), which
    // `buildConditions` applies first. Millisecond precision for the same
    // reason as `created_at`: the trash list pages on a `(deleted_at, id)`
    // keyset that round-trips through a JavaScript `Date`, and a bulk delete
    // shares one `deleted_at` across the batch — ties must stay ties so `id`
    // can break them. The row's receipts (`transaction_attachments`) carry no
    // copy of this: their state is always read through this row.
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
    // Who trashed it (attribution only; no foreign key, like `user_id`).
    deletedBy: uuid("deleted_by"),
  },
  (t) => [
    // THE access path. Every read scopes to the profiles the caller can see in
    // the current workspace (`transactions.user_id` is attribution, not access),
    // then orders by the feed's cursor. Leading with `profile_id` lets Postgres
    // merge-append one ordered index scan per accessible profile and stop at the
    // page size, so a page costs the same whether the workspace holds 200 rows
    // or a million. The trailing columns are exactly `listFeedPage`'s keyset
    // cursor `(occurred_on, created_at, id)`, in the same direction, so the feed
    // reads straight off the index with no sort.
    //
    // It no longer covers the `profile_id` FK restrict check: it is partial (see
    // below), so it can't — `transactions_profile_idx` does that now.
    //
    // `nullsFirst()` is load-bearing, not decoration. Drizzle's `.desc()` emits
    // `DESC NULLS LAST`, while SQL's `ORDER BY x DESC` means `DESC NULLS FIRST`.
    // The planner matches an index to a sort on pathkeys, and pathkeys compare
    // `nulls_first` exactly — it does *not* reason "the column is NOT NULL, so
    // the null ordering can't matter". Get this wrong and the index is still
    // built, still used for the `profile_id` lookup, and still shows a
    // `Merge Append` in EXPLAIN — but every branch underneath it becomes a scan
    // of the whole profile plus a top-N sort. Measured on Postgres 18 against
    // 300,000 rows across three profiles, one page of 50: 164 buffer reads with
    // the null ordering below, 31,793 without it.
    //
    // Partial: live rows only. The trash is invisible to every read, so its
    // rows have no business in the hot path's index — without the predicate a
    // "clear transactions" of 50,000 rows would make every feed page walk those
    // 50,000 dead entries for the 30 days they sit in the trash. The planner only
    // uses a partial index when the query *proves* its predicate, so every read
    // must carry the literal `deleted_at is null` (`notTrashed`, via
    // `buildConditions`) in every merge-append branch — never a parameter.
    index("transactions_profile_date_idx")
      .on(
        t.profileId,
        t.occurredOn.desc().nullsFirst(),
        t.createdAt.desc().nullsFirst(),
        t.id.desc().nullsFirst(),
      )
      .where(sql`${t.deletedAt} is null`),
    // Every row of a profile, trash included. The index above used to serve
    // these as its leading-column prefix, and a partial index can't: the
    // `profile_id` FK restrict check when a profile is finally destroyed, and
    // the all-states statements by profile (moving a profile's rows, collecting
    // its stored objects, the purge, account deletion). A plain single-column
    // btree, ~30 bytes a row.
    index("transactions_profile_idx").on(t.profileId),
    // The trash: per profile, most recently deleted first — the trash list
    // (merged per profile like the feed) and the purge (which scans it whole;
    // it only ever holds `TRASH_DAYS` of deletions). `nullsFirst()` for the
    // same pathkey reason as above.
    index("transactions_trash_idx")
      .on(t.profileId, t.deletedAt.desc().nullsFirst(), t.id.desc().nullsFirst())
      .where(sql`${t.deletedAt} is not null`),
    // FK maintenance: category delete → set null. Not a prefix of anything above.
    index("transactions_category_idx").on(t.categoryId),
    // The account-deletion sweep (`deleteAccount` in services/settings.ts) is the
    // one query that filters on `user_id` alone; this serves it as a prefix.
    index("transactions_user_profile_idx").on(t.userId, t.profileId),
    // Tag filtering (`tag_ids && array[…]`), the tag-delete sweep and the
    // per-tag count (both `tag_ids @> array[…]`). GIN is the only index type
    // that serves an array overlap/containment predicate; a btree on a uuid[]
    // would be dead weight.
    //
    // The operator matters as much as the index. GIN's `array_ops` implements
    // `&&`, `@>` and `<@` — and nothing rewrites a `scalar = ANY(column)` into
    // any of them. Measured on Postgres 18.6 with `enable_seqscan = off`, the
    // `= any` form has no index path at all; `@>` takes a Bitmap Index Scan.
    // Write the predicate the wrong way round and this index is never used.
    index("transactions_tag_ids_idx").using("gin", t.tagIds),
  ],
);

/**
 * A monthly spending limit (`src/lib/budgets.ts` holds the rules). It covers
 * the whole workspace, one space (every live profile in it, as they are now —
 * a profile moved to another space takes its spending with it), one profile, or
 * one expense category across every profile — `scope` says which, and exactly
 * one of `space_id` / `profile_id` / `category_id` is set for the last three
 * (the check constraint below). Typed foreign keys rather than one polymorphic
 * id, so deleting a space, a profile (for good) or a category takes its budget
 * with it instead of leaving one that points at nothing. A budget is a
 * setting, not a record of spending — the transactions it measured are
 * untouched — and a space can only be deleted once its profiles have moved,
 * so there's nothing left for its budget to measure.
 *
 * `title` is what people call it ("Groceries this month"); `description` an
 * optional note. The title's empty default only exists so the column could be
 * added to existing rows (the migration back-fills them); every write sets one.
 *
 * One budget per scope (the unique constraint treats the nulls as equal, so a
 * second whole-workspace budget collides too). `amount_minor` is in the
 * workspace's currency, like every amount. `created_by` is attribution and an
 * alert recipient, never the access key — who can see or manage a budget is
 * decided by the profiles it covers (`canSeeBudget` / `canManageBudget`).
 * How many a workspace may have is its plan's `budgets` limit.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scope: budgetScopeEnum("scope").notNull(),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: BUDGET_TITLE_MAX }).notNull().default(""),
    description: varchar("description", { length: BUDGET_DESCRIPTION_MAX }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    period: budgetPeriodEnum("period").notNull().default("monthly"),
    // Email the 80% / 100% alerts (in-app alerts always show). Per budget, set
    // by whoever manages it.
    emailAlerts: boolean("email_alerts").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One budget per scope and period. Leads with `workspace_id`, so it also
    // serves "this workspace's budgets" and the workspace FK cascade.
    unique("budgets_workspace_scope_uq")
      .on(t.workspaceId, t.scope, t.period, t.profileId, t.categoryId, t.spaceId)
      .nullsNotDistinct(),
    // FK maintenance: profile / category / space delete cascades.
    index("budgets_profile_idx").on(t.profileId),
    index("budgets_category_idx").on(t.categoryId),
    index("budgets_space_idx").on(t.spaceId),
    // `scope::text` throughout: `space` was added to the enum in the same
    // migration as this constraint, and Postgres refuses to use a new enum
    // value in the transaction that added it ("unsafe use of new value").
    check(
      "budgets_scope_target_ck",
      sql`(${t.scope}::text = 'workspace' and ${t.profileId} is null and ${t.categoryId} is null and ${t.spaceId} is null)
        or (${t.scope}::text = 'profile' and ${t.profileId} is not null and ${t.categoryId} is null and ${t.spaceId} is null)
        or (${t.scope}::text = 'category' and ${t.categoryId} is not null and ${t.profileId} is null and ${t.spaceId} is null)
        or (${t.scope}::text = 'space' and ${t.spaceId} is not null and ${t.profileId} is null and ${t.categoryId} is null)`,
    ),
    check("budgets_amount_positive_ck", sql`${t.amountMinor} > 0`),
  ],
);

/**
 * The alert log: one row per budget × month × threshold that has fired. The
 * primary key *is* the "once per budget, per threshold, per month" rule — a
 * crossing is claimed with `insert … on conflict … do update … where
 * excluded.amount_minor > budget_alerts.amount_minor returning`, so of two
 * writes that cross 80% at the same moment exactly one gets the row, and the
 * same threshold fires again in a month only if the budget's amount was
 * raised past the one it fired at (`src/services/budget-alerts.ts`).
 *
 * Rows are never deleted while their budget lives — that's what makes
 * raise/lower loops pointless. `notified_at` is null until the claim's email
 * was handed to the mailer (or turned out to be owed to nobody). A claim that
 * didn't fit in the workspace's monthly alert-email pool, or whose check failed
 * before committing, stays null and the next check picks it up. A send that
 * fails after that commit isn't retried — the alert still shows in the app,
 * which doesn't read this table; in-app alerts are computed live.
 *
 * Tiny and bounded (≤ budgets × 2 a month, plus raises), and it goes with its
 * budget.
 */
export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    // The first day of the calendar month the alert is about.
    month: date("month").notNull(),
    // 80 or 100 (`BUDGET_THRESHOLDS`).
    threshold: smallint("threshold").notNull(),
    // The budget's amount when this threshold fired — it fires again this
    // month only for a higher amount.
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    // When its email went out (or nothing was owed); null = still to send.
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.budgetId, t.month, t.threshold] }),
    check("budget_alerts_threshold_ck", sql`${t.threshold} in (80, 100)`),
    check("budget_alerts_month_ck", sql`extract(day from ${t.month}) = 1`),
  ],
);

/**
 * One row per budget-alert email sent — the workspace's own monthly pool
 * (`BUDGET_ALERT_EMAILS_PER_MONTH`, `budgetAlertEmailsLeft` in
 * `email-quota.ts`). Separate from `email_send_log` on purpose: alerts are the
 * workspace's, not the writer's, so they neither eat into a person's invite
 * allowance nor stop when it's spent. Keyed by workspace and kept when a budget
 * is deleted, so deleting and re-creating a budget can't refill it. Stores no
 * recipient.
 */
export const budgetAlertEmails = pgTable(
  "budget_alert_emails",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The pool's count: this workspace's alert emails since the 1st.
    index("budget_alert_emails_workspace_created_idx").on(t.workspaceId, t.createdAt),
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
 *
 * Deliberately **no `deleted_at`**: an attachment is in the trash exactly when
 * its transaction is, and that state is always read through the parent row
 * (`transactions.deleted_at`). A copy here would be a denormalized column used
 * as a predicate — the shape that once deleted a live transaction's receipt.
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
    // The primary read: all attachments for a transaction, oldest first. This
    // is the correlated subquery every transaction row carries.
    index("txn_attachments_txn_idx").on(t.transactionId, t.createdAt),
    // The vault's other half (`listTransactionFilesForVault`), which sits in the
    // same `Promise.all` as `listVaultFiles` and so has to be as fast as it is —
    // a page is only as quick as the slower of the two. Same shape and same
    // reasoning as `files_profile_created_idx`, `nullsFirst()` included. Covers
    // the `profile_id` FK cascade as a leading-column prefix.
    index("txn_attachments_profile_created_idx").on(
      t.profileId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // The storage-quota sum and the workspace FK cascade. It used to carry
    // `created_at` for a "per-workspace listing" that does not exist — nothing
    // pairs `workspace_id` with a date here either.
    index("txn_attachments_workspace_idx").on(t.workspaceId),
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
    // In the trash since this instant (Plus/Pro; Free deletes for good). Trashing
    // a folder stamps it **and every live descendant** folder and file with the
    // same instant, in one transaction, so every vault read stays a plain
    // `deleted_at is null` filter and restoring the folder brings back exactly
    // what went with it (equal `deleted_at`, compared in SQL — never through a
    // JavaScript `Date`). The predefined system folder is never trashed.
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
    deletedBy: uuid("deleted_by"),
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
    // In the trash since this instant (Plus/Pro). Trashed bytes still count
    // toward the workspace's storage until purged (abuse rule C6) — the storage
    // sum deliberately ignores this column. See `folders.deleted_at` for how a
    // folder's subtree is stamped.
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
    deletedBy: uuid("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The vault's listing (`listVaultFiles`), newest first. Access scopes by
    // `profile_id` here just as it does on `transactions` — `workspace_id` is
    // the quota scope, not the read scope — so this leads with `profile_id` and
    // carries the listing's exact order.
    //
    // It pays off when the listing is scoped to one profile, which is what
    // `/files` resolves to unless you ask for `?profile=all`: measured on 60,000
    // files, a page of 500 goes from a sequential scan and a top-N sort at 1,336
    // buffer reads to an index scan with no sort node at 22. The page reads
    // `transaction_attachments` in the same `Promise.all`, so that table carries
    // the twin of this index — fixing one alone would not have moved the page.
    //
    // All profiles — which is what `GET /api/v1/files` takes when the request
    // omits `profile`, so the mobile default — widens to `profile_id in (…)`,
    // which no btree returns in global date order. Both listings answer that
    // with one ordered scan per profile, merged, the way the transactions list
    // and the feed do — up to `MERGE_APPEND_MAX_BRANCHES` profiles. A workspace
    // wider than that falls back to the sorted scan, on the same reasoning the
    // ceiling exists for everywhere else.
    //
    // `nullsFirst()` matters for the same reason it does on
    // `transactions_profile_date_idx`: `.desc()` alone emits `DESC NULLS LAST`,
    // which the planner will not match against `ORDER BY x DESC` — sorted that
    // way this index measures the same 1,336 buffers as having no index at all.
    // Also serves the profile-delete sweep, the tag detach, the file count, and
    // the `profile_id` FK cascade, all as a leading-column prefix. (One query
    // escapes it: the tag merge in `moveProfileData` matches on `tag_ids` alone,
    // with no profile predicate, and full-scans regardless.)
    index("files_profile_created_idx").on(
      t.profileId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // The storage-quota sum (`getWorkspaceStorageUsage`) and the workspace FK
    // cascade. No query pairs `workspace_id` with a date, so it stops here.
    index("files_workspace_idx").on(t.workspaceId),
    // Browsing a folder's subtree + the folder FK cascade.
    index("files_folder_idx").on(t.folderId),
    // The trash, per profile, most recently deleted first (trash list + purge).
    // `files_profile_created_idx` above stays a full index on purpose: unlike the
    // transactions feed it also serves the profile cascade, the tag detach, the
    // vault move and the sweeps — all of which need trashed rows too — and the
    // listing it serves is capped at 500 with trashed files bounded by storage,
    // so `deleted_at is null` costs it a cheap filter, not a walk.
    index("files_trash_idx")
      .on(t.profileId, t.deletedAt.desc().nullsFirst(), t.id.desc().nullsFirst())
      .where(sql`${t.deletedAt} is not null`),
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

/* -------------------------------------------------------------------------- */
/* Split — shared expenses between people, outside every workspace             */
/* -------------------------------------------------------------------------- */

/**
 * Where a person stands in a split group. `left` covers removed, declined and
 * left alike: member rows are never deleted while the group exists, because
 * expenses, shares and settlements point at them and their balance is history
 * the others still need — and because `invite_emailed_at` on the row is what
 * keeps a re-added address from getting a second invite email (abuse rule D1).
 */
export const splitMemberStatusEnum = pgEnum("split_member_status", ["invited", "joined", "left"]);

/** How an expense was divided — the maths lives in `src/lib/split-math.ts`. */
export const splitTypeEnum = pgEnum("split_type", ["equal", "exact", "percent"]);

/**
 * A split group: a trip, a flat, a dinner. **User-scoped, not in any
 * workspace** — it has no plan, no `workspace_id`, and nothing in it is a
 * transaction. The creator manages it (rename, people, delete); every joined
 * member adds expenses and settles up. One currency per group, in which every
 * amount below is stored as integer minor units. `created_by` has no foreign
 * key, like `workspaces.owner_id`.
 */
export const splitGroups = pgTable(
  "split_groups",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    name: varchar("name", { length: SPLIT_GROUP_NAME_MAX }).notNull(),
    icon: varchar("icon", { length: SPLIT_ICON_MAX }),
    currency: text("currency").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The account-deletion sweep: groups this person created go with them.
    index("split_groups_created_by_idx").on(t.createdBy),
  ],
);

/**
 * One person in one group — the creator's own row included (inserted
 * `joined`). Expenses, shares and settlements reference this row, not a user,
 * so someone can be in a split before they have an account.
 *
 * - `user_id` is the bound account: set at add time when the email already
 *   has one, at sign-up otherwise (`lib/split-signup.ts`), and nulled when the
 *   account is deleted. No foreign key, by house convention.
 * - `email` is stored lowercased. Null only after the account behind it was
 *   deleted. Shown to the group's creator and to the member themself — never
 *   to the other members (`lib/split-access.ts`).
 * - `display_name` is the creator's label; null falls back to the account's
 *   name once joined, else the email's local part.
 * - `invite_token` is the secret in the join link (`/invite/split/<token>`),
 *   minted for every pending row and nulled when the person leaves, so an old
 *   link stops working. It binds to `email`, never to whoever holds it.
 * - `invite_emailed_at` is the D1 marker: claimed with
 *   `UPDATE … WHERE invite_emailed_at IS NULL RETURNING`, so a group sends an
 *   address at most one email, ever. Never reset.
 * - `email_key` is the address normalised to its inbox (`lib/email-key.ts`:
 *   no `+tag`, no Gmail dots), so `zoe+trip@gmail.com` and `z.o.e@gmail.com`
 *   are one person: unique per group, and what the per-invitee caps count.
 *   Joining still binds to the exact `email`.
 * - `invite_cooldown_until`: someone who declined or left can't be invited
 *   back into this group before it (30 days). A removal by the creator sets
 *   nothing — that's the creator's own decision to undo.
 */
export const splitMembers = pgTable(
  "split_members",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    groupId: uuid("group_id")
      .notNull()
      .references(() => splitGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    email: text("email"),
    emailKey: text("email_key"),
    displayName: varchar("display_name", { length: SPLIT_MEMBER_NAME_MAX }),
    status: splitMemberStatusEnum("status").notNull().default("invited"),
    invitedBy: uuid("invited_by"),
    inviteToken: text("invite_token"),
    inviteEmailedAt: timestamp("invite_emailed_at", { withTimezone: true }),
    inviteCooldownUntil: timestamp("invite_cooldown_until", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per inbox and per account in a group (nulls are distinct).
    uniqueIndex("split_members_group_email_key_uq").on(t.groupId, t.emailKey),
    uniqueIndex("split_members_group_user_uq").on(t.groupId, t.userId),
    // The join page's lookup.
    uniqueIndex("split_members_invite_token_uq").on(t.inviteToken),
    // "My groups" and "my invitations".
    index("split_members_user_status_idx").on(t.userId, t.status),
    // Invitations still waiting for an account: the sign-up binding and the
    // invitations list's by-email arm. Partial, so it stays small.
    index("split_members_pending_email_idx").on(t.email).where(sql`${t.userId} is null`),
    // The per-invitee cap: one inviter's open invitations to one inbox.
    index("split_members_inviter_pending_idx")
      .on(t.invitedBy, t.emailKey)
      .where(sql`${t.status} = 'invited'`),
  ],
);

/**
 * Append-only counters for Split's anti-abuse caps (abuse rule D1 and the
 * review of PR #96), kept apart from the group tables so deleting a group
 * can't hand the budget back:
 *
 * - `group_created` — groups one person started (daily cap);
 * - `member_added` — addresses one person added to groups (daily cap — also
 *   what bounds probing addresses through any side channel);
 * - `invite_emailed` — invite emails one *inbox* received, from anyone
 *   (`recipient_key`, a SHA-256 of the `email_key` — never the address).
 *
 * `pnpm db:health:*` prunes it past its retention window, never below the
 * longest window a cap reads (7 days).
 */
export const splitRateLog = pgTable(
  "split_rate_log",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    event: text("event").notNull(),
    actorId: uuid("actor_id"),
    recipientKey: text("recipient_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("split_rate_log_actor_idx").on(t.actorId, t.event, t.createdAt),
    index("split_rate_log_recipient_idx")
      .on(t.recipientKey, t.event, t.createdAt)
      .where(sql`${t.recipientKey} is not null`),
  ],
);

/**
 * One shared expense, paid by one member, divided among some of them. The
 * shares are always computed on the server from `split_type` and the input
 * (`lib/split-math.ts`), never taken from the client.
 */
export const splitExpenses = pgTable(
  "split_expenses",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    groupId: uuid("group_id")
      .notNull()
      .references(() => splitGroups.id, { onDelete: "cascade" }),
    // Same width as a transaction title, so "add my share" never truncates.
    title: varchar("title", { length: SPLIT_EXPENSE_TITLE_MAX }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    paidByMemberId: uuid("paid_by_member_id")
      .notNull()
      .references(() => splitMembers.id, { onDelete: "restrict" }),
    splitType: splitTypeEnum("split_type").notNull(),
    occurredOn: date("occurred_on").notNull(),
    // The user who added it — they and the group's creator may edit it.
    createdBy: uuid("created_by").notNull(),
    // Millisecond precision, like `transactions`: the list's order includes it.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("split_expenses_amount_positive", sql`${t.amountMinor} > 0`),
    // The group's expense list, newest first. `.nullsFirst()` so the index
    // matches `ORDER BY … DESC` (Drizzle's `.desc()` alone emits NULLS LAST).
    index("split_expenses_group_date_idx").on(
      t.groupId,
      t.occurredOn.desc().nullsFirst(),
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // FK maintenance + "what did this member pay".
    index("split_expenses_paid_by_idx").on(t.paidByMemberId),
  ],
);

/**
 * A member's part of one expense. `percent_bp` keeps a percent split's input
 * (basis points) so editing shows what was typed; null for equal/exact.
 *
 * `transaction_id` is the "added to my workspace" marker (phase 11): set in
 * the same database transaction that writes the workspace expense, with
 * `WHERE transaction_id IS NULL`, so a share lands in someone's books once.
 * When that transaction is permanently deleted the marker clears itself
 * (set null) and the share can be added again; a trashed one still counts.
 */
export const splitShares = pgTable(
  "split_shares",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => splitExpenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => splitMembers.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    percentBp: integer("percent_bp"),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { withTimezone: true }),
    // The share (group currency) the workspace entry was written or last
    // updated for — when the expense is edited it differs from `amount_minor`
    // and the UI offers "Update my entry".
    addedAmountMinor: bigint("added_amount_minor", { mode: "number" }),
  },
  (t) => [
    check("split_shares_amount_not_negative", sql`${t.amountMinor} >= 0`),
    uniqueIndex("split_shares_expense_member_uq").on(t.expenseId, t.memberId),
    // Balances (owed per member) + FK maintenance.
    index("split_shares_member_idx").on(t.memberId),
    // One workspace transaction backs at most one share; also serves the
    // set-null when a transaction is deleted.
    uniqueIndex("split_shares_transaction_uq")
      .on(t.transactionId)
      .where(sql`${t.transactionId} is not null`),
  ],
);

/**
 * "Mark as paid": `from` paid `to` this much, outside the app. Balances are
 * always computed from expenses, shares and these rows — never stored.
 */
export const splitSettlements = pgTable(
  "split_settlements",
  {
    id: uuid("id").primaryKey().default(uuidV7),
    groupId: uuid("group_id")
      .notNull()
      .references(() => splitGroups.id, { onDelete: "cascade" }),
    fromMemberId: uuid("from_member_id")
      .notNull()
      .references(() => splitMembers.id, { onDelete: "restrict" }),
    toMemberId: uuid("to_member_id")
      .notNull()
      .references(() => splitMembers.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    settledOn: date("settled_on").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("split_settlements_amount_positive", sql`${t.amountMinor} > 0`),
    check("split_settlements_distinct_members", sql`${t.fromMemberId} <> ${t.toMemberId}`),
    index("split_settlements_group_date_idx").on(
      t.groupId,
      t.settledOn.desc().nullsFirst(),
      t.createdAt.desc().nullsFirst(),
    ),
    index("split_settlements_from_idx").on(t.fromMemberId),
    index("split_settlements_to_idx").on(t.toMemberId),
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
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type FileTag = typeof fileTags.$inferSelect;
export type NewFileTag = typeof fileTags.$inferInsert;
// "StoredFile", not "File" — the DOM's global `File` type is live in this app
// (uploads), and shadowing it invites silent type confusion.
export type StoredFile = typeof files.$inferSelect;
export type NewStoredFile = typeof files.$inferInsert;
export type FileShare = typeof fileShares.$inferSelect;
export type NewFileShare = typeof fileShares.$inferInsert;
export type ProfileOverride = typeof profileOverrides.$inferSelect;
export type ProfileAccessLevel = (typeof profileAccessLevelEnum.enumValues)[number];
export type Organization = typeof organizations.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type SpaceMember = typeof spaceMembers.$inferSelect;
export type SpaceRole = (typeof spaceRoleEnum.enumValues)[number];
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type ProfileAccess = typeof profileAccess.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type WorkspaceRole = (typeof workspaceRoleEnum.enumValues)[number];
export type SplitGroup = typeof splitGroups.$inferSelect;
export type SplitMember = typeof splitMembers.$inferSelect;
export type SplitMemberStatus = (typeof splitMemberStatusEnum.enumValues)[number];
export type SplitExpense = typeof splitExpenses.$inferSelect;
export type SplitShare = typeof splitShares.$inferSelect;
export type SplitSettlement = typeof splitSettlements.$inferSelect;
export type SplitType = (typeof splitTypeEnum.enumValues)[number];
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type BudgetAlert = typeof budgetAlerts.$inferSelect;
export type AiChat = typeof aiChats.$inferSelect;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type AiChatRole = (typeof aiChatRoleEnum.enumValues)[number];
