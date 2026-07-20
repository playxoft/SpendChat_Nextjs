import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

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
});
// `input` type accounts for fields with defaults being optional for callers.
export type TransactionInput = z.input<typeof transactionInputSchema>;

export const updateTransactionSchema = transactionInputSchema.extend({
  id: z.string().uuid(),
});

export const bulkTransactionsSchema = z.object({
  items: z.array(transactionInputSchema).min(1).max(500),
});

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
 * Partial user-settings update for the REST API's `PATCH /settings`. These
 * settings follow the user across workspaces (theme, input mode). Currency and
 * number format are per-workspace and live on a separate endpoint. Any subset
 * may be supplied; at least one is required.
 */
export const patchSettingsSchema = z
  .object({
    theme: themeSchema,
    inputMode: inputModeSchema,
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

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(20, "Name is too long (max 20 characters)"),
  kind: txnTypeSchema,
  icon: z.string().trim().max(16).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(20, "Name is too long (max 20 characters)").optional(),
  icon: z.string().trim().max(16).nullish(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(20, "Name is too long (max 20 characters)"),
  icon: z.string().trim().max(16).optional(),
  color: z.string().trim().max(32).optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const updateProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(20, "Name is too long (max 20 characters)").optional(),
  icon: z.string().trim().max(16).nullish(),
  color: z.string().trim().max(32).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const reorderProfilesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const workspaceRoleSchema = z.enum(["viewer", "editor", "admin"]);

/** Shared so the bootstrap auto-name generator (`defaultWorkspaceName`) can keep
 *  generated names within the same limit the schema enforces. */
export const WORKSPACE_NAME_MAX = 30;

/** Emoji a new/blank workspace gets by default (like a profile's `👤`). */
export const DEFAULT_WORKSPACE_ICON = "🏢";

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

const inviteEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(100, "Email is too long (max 100 characters)")
  .email("Enter a valid email address");

/** Max profiles a single grant/invite may target at once. */
export const ACCESS_PROFILES_MAX = 50;

/**
 * How much of a workspace a person can reach. `all` = workspace-wide membership
 * (one role). `profiles` = per-profile grants, each carrying its own role, so a
 * user can be an editor on one profile and a viewer on another.
 */
export const accessGrantSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all"), role: workspaceRoleSchema }),
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
