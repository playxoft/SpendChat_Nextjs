/**
 * Share links for the invoice and quotation generators: the whole document,
 * deflated and base64url-encoded into the URL's `#fragment`.
 *
 * The fragment is the point. Browsers never send it to the server, so a shared
 * invoice travels only between the two people holding the link — nothing is
 * uploaded or stored, which keeps the tools' "nothing leaves your browser"
 * promise. Opening the link loads a copy into the recipient's own editor.
 */

export const SHARE_PARAM = "share";

/** Longest fragment we'll try to decode — a real document compresses to a few KB. */
const MAX_TOKEN = 32_000;
/** Largest document text we'll accept after inflating (guards against a zip bomb in a link). */
const MAX_TEXT = 200_000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const binary = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Text → the compact token that goes after `#share=`. */
export async function encodeShareToken(text: string): Promise<string> {
  const compressed = await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return toBase64Url(compressed);
}

/** The token back to text, or null for anything malformed, truncated or oversized. */
export async function decodeShareToken(token: string): Promise<string | null> {
  if (!token || token.length > MAX_TOKEN) return null;
  const bytes = fromBase64Url(token);
  if (!bytes) return null;
  try {
    const inflated = await pipe(bytes, new DecompressionStream("deflate-raw"));
    if (inflated.length > MAX_TEXT) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(inflated);
  } catch {
    return null;
  }
}

/** The token in a `#share=…` fragment, or null when the fragment isn't a share link. */
export function shareTokenFromHash(hash: string): string | null {
  const prefix = `#${SHARE_PARAM}=`;
  return hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
}
