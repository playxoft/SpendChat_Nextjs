"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requestCountry } from "@/lib/geo.server";
import * as billing from "@/services/billing";
import type { ChangePlanInput, StartCheckoutInput } from "@/lib/validation";

/**
 * Buying and managing a workspace's plan. Each action re-checks the role and
 * prices on the server (`services/billing.ts`); ids and items from the client
 * are only a request, never a price. None of them changes a plan — the payment
 * provider's webhook does that once the money is confirmed.
 */

/**
 * Start buying a plan or a top-up for `workspaceId` — the checkout page's buy
 * button. Returns the provider's checkout URL; the page sends the browser there.
 */
export async function startCheckout(
  workspaceId: string,
  input: StartCheckoutInput,
): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  const country = await requestCountry();
  return runAction("startCheckout", () => billing.startCheckout(user.id, workspaceId, input, { country }), {
    userId: user.id,
    workspaceId,
  });
}

/** Move a paid workspace to another plan or period: up now (prorated), down at renewal. */
export async function changePlan(
  workspaceId: string,
  input: ChangePlanInput,
): Promise<ActionResult<{ change: billing.PlanChangeResult }>> {
  const user = await requireUser();
  return runAction(
    "changePlan",
    async () => {
      const change = await billing.changePlan(user.id, workspaceId, input);
      revalidatePath("/app/settings/billing");
      return { change };
    },
    { userId: user.id, workspaceId },
  );
}

/** Drop a downgrade that's waiting for the renewal. */
export async function undoScheduledPlanChange(workspaceId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "undoScheduledPlanChange",
    async () => {
      await billing.undoScheduledChange(user.id, workspaceId);
      revalidatePath("/app/settings/billing");
      return {};
    },
    { userId: user.id, workspaceId },
  );
}

/** Cancel at the end of the period already paid for. */
export async function cancelPlan(workspaceId: string): Promise<ActionResult<{ endsAt: string | null }>> {
  const user = await requireUser();
  return runAction(
    "cancelPlan",
    async () => {
      const res = await billing.cancelPlan(user.id, workspaceId);
      revalidatePath("/app/settings/billing");
      return res;
    },
    { userId: user.id, workspaceId },
  );
}

/** Keep a plan that was set to cancel. */
export async function resumePlan(workspaceId: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "resumePlan",
    async () => {
      await billing.resumePlan(user.id, workspaceId);
      revalidatePath("/app/settings/billing");
      return {};
    },
    { userId: user.id, workspaceId },
  );
}

/** A link to the provider's portal: payment method, recovering a failed renewal, invoices. */
export async function openBillingPortal(workspaceId: string): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  return runAction("openBillingPortal", () => billing.billingPortalUrl(user.id, workspaceId), {
    userId: user.id,
    workspaceId,
  });
}

/** Has the purchase landed yet? Polled by the return page — reads our database only. */
export async function checkoutReturnStatus(
  workspaceId: string,
  expect?: { plan?: string; period?: string },
): Promise<ActionResult<{ status: billing.CheckoutReturnStatus }>> {
  const user = await requireUser();
  return runAction(
    "checkoutReturnStatus",
    async () => ({ status: await billing.checkoutReturnStatus(user.id, workspaceId, expect) }),
    { userId: user.id, workspaceId, rateLimit: "read" },
  );
}
