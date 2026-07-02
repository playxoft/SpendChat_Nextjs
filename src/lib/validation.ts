import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

export const txnTypeSchema = z.enum(["income", "expense"]);

/** Positive amount in major units, up to 2dp tolerance handled at conversion. */
export const amountSchema = z.coerce
  .number()
  .positive("Amount must be greater than 0")
  .finite()
  .max(1_000_000_000, "Amount is too large");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const transactionInputSchema = z.object({
  type: txnTypeSchema,
  amount: amountSchema,
  categoryId: z.string().uuid().nullish(),
  profileId: z.string().uuid().nullish(),
  title: z.string().trim().max(100, "Title is too long (max 100 characters)").optional().default(""),
  description: z
    .string()
    .trim()
    .max(250, "Description is too long (max 250 characters)")
    .optional()
    .default(""),
  // Deprecated alias for `title`; accepted until every caller passes `title`.
  note: z.string().trim().max(100).optional(),
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
  name: z.string().trim().min(1, "Name is required").max(40),
  kind: txnTypeSchema,
  icon: z.string().trim().max(16).optional(),
  color: z.string().trim().max(32).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(40).optional(),
  icon: z.string().trim().max(16).nullish(),
  color: z.string().trim().max(32).nullish(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  icon: z.string().trim().max(16).optional(),
  color: z.string().trim().max(32).optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const updateProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(40).optional(),
  icon: z.string().trim().max(16).nullish(),
  color: z.string().trim().max(32).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const reorderProfilesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const workspaceRoleSchema = z.enum(["viewer", "editor", "admin"]);

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Workspace name is required")
  .max(60, "Workspace name is too long (max 60 characters)");

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const renameWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: workspaceNameSchema,
});

/** Add a user to a workspace (or to a single profile when `profileId` is set). */
export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: workspaceRoleSchema,
  profileId: z.string().uuid().nullish(),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: workspaceRoleSchema,
});
