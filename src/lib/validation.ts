import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

export const txnTypeSchema = z.enum(["income", "expense"]);

/** Positive amount in major units, up to 2dp tolerance handled at conversion.
 *  Capped at a 9-digit whole-number part (999,999,999.99). */
export const amountSchema = z.coerce
  .number()
  .positive("Amount must be greater than 0")
  .finite()
  .max(999_999_999.99, "Amount is too large (max 9 digits)");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const transactionInputSchema = z.object({
  type: txnTypeSchema,
  amount: amountSchema,
  categoryId: z.string().uuid().nullish(),
  profileId: z.string().uuid().nullish(),
  title: z.string().trim().max(40, "Title is too long (max 40 characters)").optional().default(""),
  description: z
    .string()
    .trim()
    .max(150, "Description is too long (max 150 characters)")
    .optional()
    .default(""),
  // Deprecated alias for `title`; accepted until every caller passes `title`.
  note: z.string().trim().max(40).optional(),
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

export const settingsSchema = z.object({
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  locale: z.string().trim().min(2).max(20),
  theme: z.enum(["light", "dark", "system"]),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/** Layout of the transaction composer inputs. Stored on `user_settings`. */
export const INPUT_MODES = ["amount_title", "title_amount", "combined"] as const;
export const inputModeSchema = z.enum(INPUT_MODES);
export type InputMode = (typeof INPUT_MODES)[number];

/**
 * Partial settings update for the REST API's `PATCH /settings`. Any subset of
 * fields may be supplied; at least one is required.
 */
export const patchSettingsSchema = z
  .object({
    currency: settingsSchema.shape.currency,
    locale: settingsSchema.shape.locale,
    theme: settingsSchema.shape.theme,
    inputMode: inputModeSchema,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Provide at least one setting to update",
  });
export type PatchSettingsInput = z.infer<typeof patchSettingsSchema>;

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
export const WORKSPACE_NAME_MAX = 20;

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Workspace name is required")
  .max(WORKSPACE_NAME_MAX, `Workspace name is too long (max ${WORKSPACE_NAME_MAX} characters)`);

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const renameWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: workspaceNameSchema,
});

/** Add a user to a workspace (or to a single profile when `profileId` is set). */
export const addMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(100, "Email is too long (max 100 characters)")
    .email("Enter a valid email address"),
  role: workspaceRoleSchema,
  profileId: z.string().uuid().nullish(),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: workspaceRoleSchema,
});
