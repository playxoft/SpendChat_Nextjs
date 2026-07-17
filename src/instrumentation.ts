/**
 * Next.js instrumentation.
 *
 * `onRequestError` is the framework's catch-all for server-side errors —
 * uncaught throws in Server Components, route handlers, and server actions all
 * funnel here. It's the safety net for anything the narrower wrappers
 * (`runAction` / `handleApiError`) didn't already catch, including module
 * evaluation errors during render. The logger is imported lazily so this hook
 * stays cheap when nothing throws.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
  },
): Promise<void> {
  const { logger, describeError } = await import("@/lib/logger");
  logger.error(
    `Unhandled error in ${request.method} ${request.path}: ${describeError(error)}`,
    {
      event: "request.error",
      // Stringify non-Error throws so raw objects never ship to the log vendor.
      error: error instanceof Error ? error : String(error),
      path: request.path,
      method: request.method,
      routeType: context.routeType,
      routePath: context.routePath,
      renderSource: context.renderSource,
    },
  );
}
