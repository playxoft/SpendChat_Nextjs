"use server";

import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as billing from "@/services/billing";
import type { StartCheckoutInput } from "@/lib/validation";

/**
 * Start buying a plan or a top-up for `workspaceId` — the checkout page's one
 * action. Returns the provider's checkout URL; the page sends the browser
 * there. The service re-checks the role and prices the order itself, so the
 * workspace id and item are only a request, never a price.
 */
export async function startCheckout(
  workspaceId: string,
  input: StartCheckoutInput,
): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  const country = requestCountry((await headers()).get("cf-ipcountry"));
  return runAction("startCheckout", () => billing.startCheckout(user.id, workspaceId, input, { country }), {
    userId: user.id,
    workspaceId,
  });
}

/** Cloudflare's country for the request; its "unknown" (XX) and Tor (T1) codes count as none. */
function requestCountry(value: string | null): string | null {
  if (!value || value === "XX" || value === "T1") return null;
  return value.toUpperCase();
}
