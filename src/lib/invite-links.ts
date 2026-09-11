/**
 * The two links an invite/access email carries, and the token format behind
 * one of them. Pure so the templates, the services, the join page and the auth
 * redirects can all agree on a URL without importing each other.
 */

/**
 * 32 characters from the base64url alphabet, 6 bits each = 192 bits of
 * entropy. Long enough that guessing is not a strategy, short enough to
 * survive an email client's line wrapping.
 */
export const INVITE_TOKEN_LENGTH = 32;
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A fresh invite token from the platform CSPRNG (Node and Workers alike). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b & 63]).join("");
}

/** The join page for a pending invite. */
export function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

/** Query param the tracker reads to switch the current workspace on arrival. */
export const OPEN_WORKSPACE_PARAM = "workspace";

/** The tracker, switched to `workspaceId` — what an "access granted" email links to. */
export function openWorkspacePath(workspaceId: string): string {
  return `/app?${OPEN_WORKSPACE_PARAM}=${encodeURIComponent(workspaceId)}`;
}
