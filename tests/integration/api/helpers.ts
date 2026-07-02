import type { NextRequest } from "next/server";

/**
 * Build a Request for the /api/v1 handlers. By default it carries a bearer
 * token so the (mocked) `verifyAccessToken` resolves to the signed-in test
 * user; pass `{ auth: false }` to exercise the unauthenticated 401 path.
 */
export function apiReq(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): NextRequest {
  const { auth = true, headers, ...rest } = init;
  const h = new Headers(headers);
  if (auth) h.set("authorization", "Bearer test-token");
  if (rest.body && !h.has("content-type")) h.set("content-type", "application/json");
  return new Request(`http://localhost${path}`, { ...rest, headers: h }) as NextRequest;
}

/** JSON-encode a body for a mutating request. */
export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

/** Route context with async params, matching Next 16's RouteContext shape. */
export function ctx(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}
