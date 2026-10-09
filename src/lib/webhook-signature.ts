/**
 * Standard Webhooks signature verification (https://www.standardwebhooks.com),
 * the scheme the payment provider signs its webhooks with — on Web Crypto
 * only, so it runs the same in the Worker, in `next dev` and in tests.
 *
 *  - headers: `webhook-id`, `webhook-timestamp` (Unix seconds) and
 *    `webhook-signature`, a space-separated list of `v1,<base64>`;
 *  - signed content: `${id}.${timestamp}.${rawBody}` — the raw bytes, before
 *    any JSON parse;
 *  - key: the secret with its `whsec_` prefix removed, base64-decoded;
 *  - HMAC-SHA256, base64. Any one `v1` signature matching is enough.
 *
 * The HMAC is computed **once** and each candidate compared to it in constant
 * time (`timingSafeEqual` below); a candidate that isn't exactly 32 bytes is
 * skipped before any comparison, and at most `MAX_SIGNATURE_CANDIDATES` are
 * looked at — so a request stuffed with thousands of fake signatures costs one
 * HMAC, not thousands. A timestamp more than `toleranceSeconds` from now is
 * refused, so a captured delivery can't be replayed later (the event-id table
 * stops it inside the window). Every failure is the same `false` — the caller
 * answers with no detail.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** Signatures looked at per delivery: secret rotation sends two; nobody needs more. */
export const MAX_SIGNATURE_CANDIDATES = 5;

/** HMAC-SHA256 is 32 bytes. */
const SIGNATURE_BYTES = 32;

type HeaderSource = Pick<Headers, "get">;

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function verifyStandardWebhook(
  rawBody: string,
  headers: HeaderSource,
  secret: string,
  opts: { nowSeconds?: number; toleranceSeconds?: number } = {},
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures || !secret) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;

  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(timestamp)) > tolerance) return false;

  const keyBytes = base64ToBytes(secret.trim().replace(/^whsec_/, ""));
  if (!keyBytes || keyBytes.length === 0) return false;

  let expected: Uint8Array;
  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const data = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
    expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  } catch {
    return false;
  }

  let matched = false;
  for (const part of signatures.split(" ").filter(Boolean).slice(0, MAX_SIGNATURE_CANDIDATES)) {
    const comma = part.indexOf(",");
    if (comma < 0 || part.slice(0, comma) !== "v1") continue;
    const signature = base64ToBytes(part.slice(comma + 1));
    if (!signature || signature.length !== SIGNATURE_BYTES) continue;
    // No early exit on a match either: every candidate costs the same.
    if (timingSafeEqual(signature, expected)) matched = true;
  }
  return matched;
}

/** Equal-length byte arrays compared without branching on their contents. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
