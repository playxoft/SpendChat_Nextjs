import { CRON_TOKEN_HEADER, isValidCronToken } from "@/lib/cron-token";
import { describeError, logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import { purgeExpiredTrash } from "@/lib/trash-purge";

/**
 * POST /api/internal/cron/trash-purge — the daily trash purge, reached only by
 * the Worker's own cron, in-process (`lib/cron-dispatch.ts`). Not linked
 * anywhere and under `/api/` (disallowed in robots.txt).
 *
 * It answers **404 to everything** — every method, any header — unless the
 * request carries the token of a cron run in flight in this isolate
 * (`lib/cron-token.ts`), compared in constant time. With no run in flight there
 * is no token and nothing is accepted, so `next dev`, tests and the public
 * internet always see a route that doesn't exist.
 */
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not Found", { status: 404 });
}

export async function POST(request: Request): Promise<Response> {
  if (!isValidCronToken(request.headers.get(CRON_TOKEN_HEADER))) return notFound();
  return withRequestContext("cron", async () => {
    try {
      const report = await purgeExpiredTrash();
      return Response.json({ ok: true, ...report });
    } catch (err) {
      logger.error(`Trash purge failed: ${describeError(err)}`, {
        event: "trash.purge_failed",
        error: err,
      });
      return Response.json({ ok: false }, { status: 500 });
    }
  });
}

// Every other method looks exactly like a missing route — not a 405 that would
// confirm one exists.
export const GET = notFound;
export const HEAD = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;
