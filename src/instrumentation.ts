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
  const { logger } = await import("@/lib/logger");
  logger.error("request.error", {
    error,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
    renderSource: context.renderSource,
  });
}
