import "server-only";
import { ensureBootstrap, getUserSettings, type SessionUser } from "@/lib/auth";
import { listUserWorkspaces, type WorkspaceSummary } from "@/lib/workspaces";
import { forbidden, notFound, unauthorized } from "@/lib/errors";
import { verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { resolveUser } from "@/lib/identity";

/**
 * Authentication for the mobile REST API (`/api/v1/*`).
 *
 * Mobile clients send a Firebase **ID token** as `Authorization: Bearer
 * <idToken>` (from the `firebase_auth` Flutter SDK). We verify it statelessly
 * with `jose` and map the Firebase UID → our internal user id via `resolveUser`.
 * This mirrors the app's `requireUser()` / `getAppContext()` but returns 401s
 * (never a redirect), which is the correct behaviour for an API.
 */

/** Extract the `Authorization: Bearer <token>` value, or null. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Resolve the authenticated user from the bearer token, or 401. */
export async function requireApiUser(request: Request): Promise<SessionUser> {
  const token = getBearerToken(request);
  if (!token) throw unauthorized("Missing bearer token");
  const claims = await verifyFirebaseIdToken(token);
  // Email/password accounts must verify their email first (Google is always
  // verified). Enforced here since Firebase itself lets unverified users sign in.
  if (claims.email_verified === false) throw forbidden("Email not verified");
  return resolveUser(claims);
}

/**
 * Resolve the authenticated user + settings + current workspace, bootstrapping
 * defaults on first use. The API analogue of `getAppContext()`. Mobile clients
 * pick a workspace with the `X-Workspace-Id` header; without it the user's
 * last-opened workspace (or their own) is used.
 */
export async function getApiContext(request: Request): Promise<{
  user: SessionUser;
  settings: Awaited<ReturnType<typeof getUserSettings>>;
  workspace: WorkspaceSummary;
}> {
  const user = await requireApiUser(request);
  await ensureBootstrap(user.id);
  const settings = await getUserSettings(user.id);

  const list = await listUserWorkspaces(user.id);
  const requested = request.headers.get("x-workspace-id");
  let workspace: WorkspaceSummary | undefined;
  if (requested) {
    workspace = list.find((w) => w.id === requested);
    if (!workspace) throw notFound("Workspace not found");
  } else {
    workspace = list.find((w) => w.id === settings.lastWorkspaceId) ?? list[0];
  }
  return { user, settings, workspace: workspace! };
}
