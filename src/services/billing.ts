import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users, workspaces } from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { badRequest, notFound } from "@/lib/errors";
import { checkoutQuote, checkoutRefusal, topUpQuote, trialDaysFor } from "@/lib/checkout";
import { createCheckoutSession, type CheckoutOrder } from "@/lib/payments";
import { checkoutDescription, checkoutRefusalMessage, pricingCurrencyFor } from "@/lib/plan-copy";
import { startCheckoutSchema } from "@/lib/validation";
import { requireWorkspaceRole } from "@/lib/workspaces";

/**
 * Buying a plan or a top-up for a workspace — the server half of checkout.
 * The checkout page (`app/app/upgrade/checkout`) calls it through the
 * `startCheckout` action; a mobile route can call it the same way.
 *
 * It decides everything that matters about the order here, never from the
 * client: who may buy (a workspace admin), what (a plan above the current one,
 * or a top-up on a paid plan), the trial, and the price (`lib/checkout.ts` →
 * `lib/pricing.ts`). Then it hands the order to `createCheckoutSession`
 * (`lib/payments.ts`) and returns the provider's URL. The plan itself only
 * changes when the provider confirms the payment, not here.
 */

const workspaceIdSchema = z.string().uuid("That workspace isn't valid");

export async function startCheckout(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<{ url: string }> {
  const order = await buildCheckoutOrder(userId, workspaceId, input);
  return createCheckoutSession(order);
}

/**
 * Everything `startCheckout` checks and prices, up to the provider call —
 * split out so the order it would send can be tested without one.
 */
export async function buildCheckoutOrder(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<CheckoutOrder> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const item = parseOrThrow(startCheckoutSchema, input);
  await requireWorkspaceRole(userId, id, "admin");

  const db = getDb();
  const [[ws], [buyer]] = await Promise.all([
    db
      .select({ id: workspaces.id, name: workspaces.name, plan: workspaces.plan, currency: workspaces.currency })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1),
    db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);
  if (!ws) throw notFound("Workspace not found");

  const refusal = checkoutRefusal(ws.plan, item);
  if (refusal) {
    throw badRequest(checkoutRefusalMessage(refusal, ws.plan, item.item === "plan" ? item.plan : undefined));
  }

  const currency = item.currency ?? pricingCurrencyFor(ws.currency);
  const base = {
    workspace: { id: ws.id, name: ws.name },
    buyer: { userId, email: buyer?.email ?? null, name: buyer?.name ?? null },
    currency,
    returnPath: "/app/upgrade",
  };

  if (item.item === "topup") {
    const q = topUpQuote(currency);
    return {
      ...base,
      line: { kind: "topup", actions: q.actions, validityMonths: q.validityMonths },
      amountMinor: q.amountMinor,
      description: checkoutDescription({ kind: "topup" }, ws.name),
    };
  }

  const q = checkoutQuote(item.plan, item.period, currency);
  return {
    ...base,
    line: { kind: "plan", plan: item.plan, period: item.period, trialDays: trialDaysFor(ws.plan) },
    amountMinor: q.amountMinor,
    description: checkoutDescription({ kind: "plan", plan: item.plan, period: item.period }, ws.name),
  };
}
