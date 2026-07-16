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

/** 429 — the caller hit a rate limit; try again later. */
export function tooManyRequests(message = "Too many requests — try again later"): ApiError {
  return new ApiError(429, "rate_limited", message);
}
