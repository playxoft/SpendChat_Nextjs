import { z } from "zod";
import { ApiError, validationError } from "@/lib/errors";

/**
 * JSON response conventions for the mobile REST API (`/api/v1/*`).
 *
 *   success → { "data": <payload>, "meta"?: <object> }
 *   failure → { "error": { "code": string, "message": string, "details"?: unknown } }
 *
 * A single envelope means the Flutter client can decode every response the same
 * way and branch on `error`. HTTP status still carries the coarse outcome.
 */

const JSON_HEADERS = { "Cache-Control": "no-store" } as const;

/** Success envelope. `meta` is for pagination/counters when useful. */
export function apiOk(
  data: unknown,
  status = 200,
  meta?: Record<string, unknown>,
): Response {
  const body = meta ? { data, meta } : { data };
  return Response.json(body, { status, headers: JSON_HEADERS });
}

/** Error envelope built directly from parts. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status, headers: JSON_HEADERS },
  );
}

/** Flatten a ZodError into `{ field: message }` pairs for the client. */
function zodDetails(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_";
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/**
 * Turn any thrown value into an error response. Route handlers funnel every
 * failure through here so the envelope and status codes stay consistent.
 */
export function handleApiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return apiError(err.status, err.code, err.message, err.details);
  }
  if (err instanceof z.ZodError) {
    const first = err.issues[0]?.message ?? "Invalid request";
    return apiError(422, "validation_error", first, zodDetails(err));
  }
  // Unknown/unexpected: don't leak internals to the client.
  console.error("[api] unhandled error:", err);
  return apiError(500, "internal_error", "Something went wrong");
}

/**
 * Run a route handler body, converting any thrown `ApiError`/`ZodError`/other
 * into the standard error envelope. Usage:
 *
 *   export async function GET(req: NextRequest) {
 *     return handle(async () => { ...; return apiOk(data); });
 *   }
 */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch(handleApiError);
}

/** Parse a JSON request body, throwing a 400 when it isn't valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be valid JSON");
  }
}

/**
 * Merge a path-derived `id` into an (untyped) request body so the combined
 * object can be validated by a schema that expects `id`. Non-object bodies
 * become `{ id }` and fail the rest of validation as expected.
 */
export function withId(input: unknown, id: string): Record<string, unknown> {
  return input && typeof input === "object"
    ? { ...(input as Record<string, unknown>), id }
    : { id };
}

/**
 * Validate `input` against a Zod schema, throwing a 422 `ApiError` with
 * per-field details on failure. Both routes and services use this so the web
 * app and the API reject the same inputs with the same messages.
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0]?.message ?? "Invalid input";
    throw validationError(first, zodDetails(result.error));
  }
  return result.data;
}
