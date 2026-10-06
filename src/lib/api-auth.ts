import "server-only";
import { ensureBootstrap, getUserSettings, type SessionUser } from "@/lib/auth";
import { getBestPlanForUser } from "@/lib/entitlements";
import { startRateLimit } from "@/lib/rate-limit";
import { rateOfRequest } from "@/lib/rate-limit/classify";
import { listUserWorkspaces, type WorkspaceSummary } from "@/lib/workspaces";
import { forbidden, notFound, unauthorized } from "@/lib/errors";
import { hasVerifiedEmail, verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { resolveUser } from "@/lib/identity";
import { setLogContext } from "@/lib/log-context";

/**
 * Authentication for the mobile REST API (`/api/v1/*`).
 *
 * Mobile clients send a Firebase **ID token** as `Authorization: Bearer
 * <idToken>` (from the `firebase_auth` Flutter SDK). We verify it statelessly
 * with `jose` and map the Firebase UID → our internal user id via `resolveUser`.
 * This mirrors the app's `requireUser()` / `getAppContext()` but returns 401s
 * (never a redirect), which is the correct behaviour for an API.
 *
 * It is also where the API is **rate limited per person** (abuse rule C8,
 * `lib/rate-limit`): `handle()` can't do it — it sees neither the request nor
 * the user — and every authenticated route calls one of the two helpers below
 * inside `handle()`, which turns the 429 into the error envelope plus a
 * `Retry-After` header. The bucket comes from the method and path
 * (`/api/v1/ai/*` → ai, GET/HEAD → read, else create; a CSV export weighs 20
 * reads), so a new route needs no change. A request counts once even if a
 * route calls both helpers.
 */

/** Extract the `Authorization: Bearer <token>` value, or null. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Resolve the authenticated user for a route with **no workspace in context**
 * (the workspace list, creating one, the organisation), or 401 — then
 * rate-limit the request by the best plan among the person's workspaces (only
 * looked up when they're over Free's numbers).
 */
export async function requireApiUser(request: Request): Promise<SessionUser> {
  const user = await authenticate(request);
  const { bucket, weight } = rateOfRequest(request);
  await startRateLimit(user.id, bucket, weight).enforce(() => getBestPlanForUser(user.id));
  return user;
}

/** The bearer token → our user, or 401/403. No rate limiting — the callers add it. */
async function authenticate(request: Request): Promise<SessionUser> {
  const token = getBearerToken(request);
  if (!token) throw unauthorized("Missing bearer token");
  const claims = await verifyFirebaseIdToken(token);
  // Email/password accounts must verify their email first (Google is always
  // verified). Enforced here since Firebase itself lets unverified users sign in.
  if (!hasVerifiedEmail(claims)) throw forbidden("Email not verified");
  const user = await resolveUser(claims);
  setLogContext({ userId: user.id }); // stamp every subsequent log for this request
  return user;
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
  const user = await authenticate(request);
  // Count the request now, so the Durable Object round trip overlaps the
  // workspace resolution below; judge it once the workspace's plan is known.
  const { bucket, weight } = rateOfRequest(request);
  const rateLimit = startRateLimit(user.id, bucket, weight);
  let settings: Awaited<ReturnType<typeof getUserSettings>>;
  let workspace: WorkspaceSummary | undefined;
  try {
    await ensureBootstrap(user.id);
    settings = await getUserSettings(user.id);

    const list = await listUserWorkspaces(user.id);
    const requested = request.headers.get("x-workspace-id");
    if (requested) {
      workspace = list.find((w) => w.id === requested);
      if (!workspace) throw notFound("Workspace not found");
    } else {
      workspace = list.find((w) => w.id === settings.lastWorkspaceId) ?? list[0];
    }
  } catch (err) {
    // A request that fails before it's judged was still counted, so judge it
    // anyway (by the person's best plan): a script sending a junk
    // X-Workspace-Id must get its 429, not an endless stream of 404s. Under
    // the limit, the original error stands.
    await rateLimit.enforce(() => getBestPlanForUser(user.id));
    throw err;
  }
  setLogContext({ workspaceId: workspace!.id });
  await rateLimit.enforce(() => workspace!.plan);
  return { user, settings, workspace: workspace! };
}

/**
 * The authenticated user, bootstrapped, for endpoints that live outside any
 * workspace (Split). `X-Workspace-Id` is ignored here — there is no workspace
 * to resolve — but bootstrap still runs, so a first request from the app
 * creates the account's defaults and binds any split invitations waiting for
 * its email.
 */
export async function getApiUser(request: Request): Promise<SessionUser> {
  const user = await requireApiUser(request);
  await ensureBootstrap(user.id);
  return user;
}
