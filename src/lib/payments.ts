import "server-only";
import { ApiError } from "@/lib/errors";
import type { PaidPersonalPlan, Period, Currency } from "@/lib/pricing";

/**
 * The payment provider, behind one function. `startCheckout`
 * (`services/billing.ts`) has already checked who is buying, what, and for
 * which workspace, and priced it from `lib/pricing.ts`; this only turns that
 * order into a hosted checkout page and returns its URL. Nothing above this
 * file knows which provider it is.
 */

export type CheckoutOrder = {
  workspace: { id: string; name: string };
  /** The admin buying it — the provider's customer. */
  buyer: { userId: string; email: string | null; name: string | null };
  line:
    | { kind: "plan"; plan: PaidPersonalPlan; period: Period; trialDays: number }
    | { kind: "topup"; actions: number; validityMonths: number };
  /** Minor units of `currency`, computed on the server — charged as-is. */
  amountMinor: number;
  currency: Currency;
  /** The invoice line: "SpendChat Plus · 1 year · Workspace: Home". */
  description: string;
  /** Where the provider sends the buyer back to, as an app path. */
  returnPath: string;
};

export type CheckoutSession = { url: string };

/**
 * Create a hosted checkout session for `order` and return where to send the
 * buyer. Throws `billing_unavailable` on a server with no payment keys, so a
 * self-hosted copy fails cleanly instead of half-way through a purchase.
 */
export async function createCheckoutSession(order: CheckoutOrder): Promise<CheckoutSession> {
  // Personal phase 9: Dodo Payments checkout session
  void order;
  throw new ApiError(503, "billing_unavailable", "Payments aren't configured on this server.");
}
