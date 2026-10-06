/**
 * A single error currency shared by the service layer and the REST API.
 *
 * Services throw `ApiError` for validation, ownership, and business-rule
 * failures. Route handlers map it straight to an HTTP response
 * (`handleApiError` in `api-response.ts`); server actions map it to their
 * `{ ok: false, error }` result. Keeping one error type means the mobile API
 * and the web app enforce identical rules from the same code.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 400 — the request body/params were malformed (bad JSON, wrong shape). */
export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "bad_request", message, details);
}

/** 401 — missing or invalid credentials. */
export function unauthorized(message = "Authentication required"): ApiError {
  return new ApiError(401, "unauthorized", message);
}

/** 403 — authenticated, but the caller's role doesn't permit this. */
export function forbidden(message = "You don't have permission to do that"): ApiError {
  return new ApiError(403, "forbidden", message);
}

/** 404 — the resource does not exist or is not owned by the caller. */
export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, "not_found", message);
}

/** 409 — the request conflicts with current state (e.g. duplicate name). */
export function conflict(message: string): ApiError {
  return new ApiError(409, "conflict", message);
}

/** 422 — the input failed validation. `details` carries per-field issues. */
export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError(422, "validation_error", message, details);
}

/** What a `plan_limit` error is about — the client picks its upgrade copy from it. */
export type PlanLimitKey =
  | "members"
  | "spaces"
  | "profilesPerSpace"
  | "categories"
  | "tags"
  | "storage"
  | "aiActions"
  | "voice"
  | "profileLevelAccess"
  | "freeWorkspaces";

/** `details` of a `plan_limit` error. */
export type PlanLimitDetails = {
  limit: PlanLimitKey;
  /** The workspace's plan right now. */
  plan: string;
  /** The cap that was hit, when it's a number. */
  max?: number;
  /** How much is in use, when it's a number. */
  used?: number;
  /** The cheapest plan that lifts this limit; null when none does ("contact us"). */
  upgradeTo: string | null;
};

/**
 * 403 `plan_limit` — the workspace's plan doesn't allow this (a cap is reached,
 * or the feature belongs to a higher plan). Stable code + `details` so a client
 * can show an upgrade prompt instead of a generic "not allowed".
 */
export function planLimit(message: string, details: PlanLimitDetails): ApiError {
  return new ApiError(403, "plan_limit", message, details);
}

/** 429 — the caller hit a rate limit; try again later. */
export function tooManyRequests(message = "Too many requests — try again later"): ApiError {
  return new ApiError(429, "rate_limited", message);
}

/** `details` of a `rate_limited` error that knows when a retry will pass. */
export type RateLimitedDetails = {
  /** What the request counted against: entries, views, or AI. */
  bucket: "create" | "read" | "ai";
  /**
   * The per-person window that's full (`lib/rate-limit`). Absent when the
   * refusal isn't about a full window: a second AI call while the previous one
   * is still being charged, or AI paused because the limiter can't be reached.
   */
  window?: "1m" | "5m" | "1h";
  /** Whole seconds until a retry would pass — also sent as the `Retry-After` header. */
  retryAfterSeconds: number;
};

/**
 * 429 `rate_limited` with a known wait (abuse rule C8). The REST API turns
 * `retryAfterSeconds` into a `Retry-After` header; a server action returns it
 * in `details`.
 */
export function rateLimited(message: string, details: RateLimitedDetails): ApiError {
  return new ApiError(429, "rate_limited", message, details);
}

/** A 429's `Retry-After` in seconds, when its details carry one. */
export function retryAfterSecondsOf(err: ApiError): number | null {
  if (err.status !== 429 || !err.details || typeof err.details !== "object") return null;
  const value = (err.details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

/** `{ "Retry-After": "<seconds>" }` for a 429 that knows its wait, else undefined. */
export function retryAfterHeaders(err: ApiError): Record<string, string> | undefined {
  const seconds = retryAfterSecondsOf(err);
  return seconds ? { "Retry-After": String(seconds) } : undefined;
}

/**
 * A rate-limiting refusal (`rateLimited()` — it names a bucket): the
 * per-person limiter, or the AI charge lock refusing a second concurrent call.
 * The limiter logs each block, and each failure to reach it, once (throttled),
 * so the entry seams log these at debug — a script looping on a valid token
 * can't flood the logs. (The invite-email cap's 429 names no bucket and is
 * logged as usual.)
 */
export function isRateLimitRefusal(err: ApiError): boolean {
  return (
    err.code === "rate_limited" &&
    typeof (err.details as { bucket?: unknown } | undefined)?.bucket === "string"
  );
}

/**
 * A Postgres foreign-key violation (SQLSTATE 23503), unwrapped through however
 * many layers the driver has wrapped it in.
 *
 * Shared by the two paths that delete profiles wholesale: both empty a profile
 * and then delete it as separate statements (`transactions.profile_id` is ON
 * DELETE restrict), so a row written in between makes the delete fail. Inside a
 * transaction that rolls back cleanly, which makes it a retry rather than a
 * 500 — but only if the caller can recognise it.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e != null && depth < 5; depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23503") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * A Postgres unique-constraint violation (SQLSTATE 23505), unwrapped the same
 * way.
 *
 * For the writes whose *only* expected failure is "that name is taken", and
 * which want to report it as a 409 rather than a 500. Catching the violation
 * rather than catching everything matters: a dropped Hyperdrive connection, a
 * statement timeout or a value the column can't hold would otherwise be
 * reported to the user as a duplicate name, and would never reach the logs as
 * the error it actually was.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e != null && depth < 5; depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
