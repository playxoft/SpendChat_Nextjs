import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { checkoutCurrency, parseCheckoutParams } from "@/lib/checkout";
import { requestCountry } from "@/lib/geo.server";
import { pricingCurrencyFor } from "@/lib/plan-copy";
import { getAccountProfile } from "@/lib/queries";
import { DEFAULT_WORKSPACE_ICON } from "@/lib/validation";
import { CheckoutForm } from "./_components/checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * The order summary every buy button lands on (`checkoutPath` /
 * `topUpCheckoutPath` in `lib/checkout.ts`): what the current workspace is
 * buying, for which period, at what price, and what changes the moment it
 * does. The button calls `startCheckout`, which re-checks all of it on the
 * server and returns the payment provider's page. Only an admin can buy; a
 * member sees who to ask instead.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = parseCheckoutParams(await searchParams);
  if (!item) redirect("/app/upgrade");

  const [{ workspace }, country] = await Promise.all([getAppContext(), requestCountry()]);
  const canBuy = workspace.role === "admin";
  const owner = canBuy ? null : await getAccountProfile(workspace.ownerId);

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
    />
  );
}
