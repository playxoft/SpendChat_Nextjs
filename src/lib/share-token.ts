/**
 * Public share-link tokens — one helper for every kind of link (vault files
 * and folders, invoices), so they're minted and checked the same way.
 *
 * The token IS the capability: 256 random bits, base64url, never derived from
 * an id. Anyone holding the URL can view what it points at, so it must be
 * unguessable.
 */
export function mintShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A string that could be a token we minted — checked before any lookup. */
export function isShareTokenShape(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= 64 && /^[A-Za-z0-9_-]+$/.test(token);
}
