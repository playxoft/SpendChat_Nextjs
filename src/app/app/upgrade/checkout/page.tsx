import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { billingAvailable } from "@/lib/billing-config";
import { planChangeKind } from "@/lib/billing-rules";
import { checkoutCurrency, parseCheckoutParams } from "@/lib/checkout";
import { requestCountry } from "@/lib/geo.server";
import { pricingCurrencyFor } from "@/lib/plan-copy";
import type { PaidPersonalPlan } from "@/lib/pricing";
import { getAccountProfile } from "@/lib/queries";
import { DEFAULT_WORKSPACE_ICON } from "@/lib/validation";
import { getLiveSubscription, inTrialNow, trialDaysForPurchase } from "@/services/billing";
import { CheckoutForm, type LivePlan } from "./_components/checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * The order summary every buy button lands on (`checkoutPath` /
 * `topUpCheckoutPath` in `lib/checkout.ts`): what the current workspace is
 * buying, for which period, at what price, and what changes the moment it
 * does. A workspace with a plan already running sees a plan *change* instead
 * (up now and prorated, down at renewal) — a checkout would start a second
 * subscription. The button calls `startCheckout` / `changePlan`, which
 * re-check all of it on the server. Only an admin can buy; a member sees who
 * to ask instead.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = parseCheckoutParams(await searchParams);
  if (!item) redirect("/app/upgrade");

  const [{ user, workspace }, country] = await Promise.all([getAppContext(), requestCountry()]);
  const canBuy = workspace.role === "admin";
  const [owner, live, trialDays] = await Promise.all([
    canBuy ? null : getAccountProfile(workspace.ownerId),
    getLiveSubscription(workspace.id),
    // The trial this purchase would really get (B1) — the server decides it again at checkout.
    canBuy ? trialDaysForPurchase(user.id, workspace.id, workspace.plan) : Promise.resolve(0),
  ]);
  const livePlan: LivePlan | null = live
    ? {
        plan: live.plan as PaidPersonalPlan,
        period: live.period,
        status: live.status,
        inTrial: inTrialNow(live),
        nextBillingDate: live.nextBillingDate?.toISOString() ?? null,
        change: item.item === "plan" ? planChangeKind({ plan: live.plan as PaidPersonalPlan, period: live.period }, item) : null,
      }
    : null;

  return (
    <CheckoutForm
      workspace={{
        id: workspace.id,
        name: workspace.name,
        icon: workspace.icon ?? DEFAULT_WORKSPACE_ICON,
      }}
      currentPlan={workspace.plan}
      item={item}
      // The same rule the server charges by, so the page shows what's charged.
      currency={checkoutCurrency(item.currency ?? pricingCurrencyFor(workspace.currency), country)}
      canBuy={canBuy}
      ownerName={owner?.name?.trim() || null}
      trialDays={trialDays}
      live={livePlan}
      billingReady={billingAvailable()}
    />
  );
}
