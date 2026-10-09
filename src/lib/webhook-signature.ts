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
 * `crypto.subtle.verify` compares in constant time, which is why this verifies
 * each candidate rather than computing a signature and comparing strings.
 * A timestamp more than `toleranceSeconds` from now is refused, so a captured
 * delivery can't be replayed later (the event-id table stops it inside the
 * window). Every failure is the same `false` — the caller answers with no
 * detail.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

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

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
      "verify",
    ]);
  } catch {
    return false;
  }
  const data = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);

  for (const part of signatures.split(" ")) {
    const comma = part.indexOf(",");
    if (comma < 0) continue;
    const version = part.slice(0, comma);
    const signature = base64ToBytes(part.slice(comma + 1));
    if (version !== "v1" || !signature) continue;
    try {
      if (await crypto.subtle.verify("HMAC", key, signature, data)) return true;
    } catch {
      // A malformed candidate is just not a match.
    }
  }
  return false;
}
