import { z } from "zod";

/**
 * The provider's webhook payloads, as far as we read them — validated before a
 * single field is trusted, so a changed or truncated payload fails the
 * delivery (and is retried) instead of writing half a state. Unknown fields
 * pass through untouched; only these must be present and well-typed.
 *
 * Every webhook is `{ business_id, type, timestamp, data }`; `data` is the same
 * object the REST API returns for that resource (a subscription, a payment, a
 * refund, a dispute). Amounts are integer minor units of `currency`.
 */

const metadata = z
  .record(z.string(), z.unknown())
  .nullish()
  .catch(null)
  .transform((m) => m ?? {});
const nullableString = z.string().nullish().transform((v) => v ?? null);
const nullableNumber = z.number().nullish().transform((v) => v ?? null);
/**
 * A field we only display (dates, links, the scheduled change): a missing or
 * malformed value becomes null rather than failing the whole event — what
 * decides money and access must parse strictly, what's shown must never block it.
 */
const displayString = z.string().nullish().catch(null).transform((v) => v ?? null);
const displayNumber = z.number().nullish().catch(null).transform((v) => v ?? null);

export const subscriptionSchema = z.object({
  subscription_id: z.string().min(1),
  status: z.string().min(1),
  product_id: z.string().min(1),
  currency: z.string().min(1),
  customer: z.object({ customer_id: z.string().min(1) }).loose(),
  payment_frequency_count: z.number().int(),
  payment_frequency_interval: z.string(),
  next_billing_date: displayString,
  created_at: z.string(),
  cancel_at_next_billing_date: z.boolean().nullish().catch(null).transform((v) => v ?? false),
  // Decides B1 (a trial nobody granted is refused) — strict.
  trial_period_days: z.number().int().nullish().transform((v) => v ?? 0),
  cancelled_at: displayString,
  expires_at: displayString,
  recurring_pre_tax_amount: displayNumber,
  metadata,
  scheduled_change: z
    .object({ product_id: z.string(), effective_at: displayString })
    .loose()
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
}).loose();
export type DodoSubscription = z.output<typeof subscriptionSchema>;

export const paymentSchema = z.object({
  payment_id: z.string().min(1),
  status: z.string().nullish().transform((v) => v ?? "unknown"),
  total_amount: z.number().int(),
  tax: nullableNumber,
  currency: z.string().min(1),
  created_at: z.string(),
  subscription_id: nullableString,
  checkout_session_id: nullableString,
  invoice_url: displayString,
  metadata,
  customer: z.object({ customer_id: z.string() }).loose().nullish().catch(null),
}).loose();
export type DodoPayment = z.output<typeof paymentSchema>;

export const refundSchema = z.object({
  refund_id: z.string().min(1),
  payment_id: z.string().min(1),
  status: z.string(),
  amount: nullableNumber,
  is_partial: z.boolean().nullish().transform((v) => v ?? false),
}).loose();
export type DodoRefund = z.output<typeof refundSchema>;

export const disputeSchema = z.object({
  dispute_id: z.string().min(1),
  payment_id: z.string().min(1),
  dispute_status: z.string(),
}).loose();
export type DodoDispute = z.output<typeof disputeSchema>;

export const eventSchema = z.object({
  type: z.string().min(1),
  timestamp: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
}).loose();
export type DodoEvent = z.output<typeof eventSchema>;

/** A metadata value as a string, or null — metadata is the client's, never trusted alone. */
export function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
