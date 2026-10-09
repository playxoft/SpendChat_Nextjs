import { withRequestContext } from "@/lib/request-context";
import { handleDodoWebhook } from "@/services/billing-webhook";

export const dynamic = "force-dynamic";

/** Several times a real delivery (a few KB); a bigger body isn't from the provider. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/webhooks/dodo — the payment provider's webhooks (Dodo Payments,
 * "Developer → Webhooks" in its dashboard). Not part of the mobile API: no
 * bearer token and no per-person rate limit — the caller is the provider, and
 * the Standard Webhooks signature is what authenticates it
 * (`services/billing-webhook.ts` verifies it, de-duplicates and applies).
 *
 * Answers with a status only — never a reason — so a forged request learns
 * nothing. Wrapped in `withRequestContext` so every log it writes carries a
 * request id.
 */
export async function POST(request: Request): Promise<Response> {
  return withRequestContext("webhook", async () => {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    return handleDodoWebhook(raw, request.headers);
  });
}
