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
  note: z.string().trim().max(280).optional().default(""),
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

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  kind: txnTypeSchema,
  icon: z.string().trim().max(8).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
