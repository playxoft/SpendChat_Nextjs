import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { getProfiles, listTransactions } from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import { parseProfileScope, resolveProfileScope, scopeLabel } from "@/lib/profile-scope";
import { transactionsToReportCsv } from "@/lib/transactions-csv";
import { setLogContext } from "@/lib/log-context";
import { rateLimitedResponse } from "@/lib/rate-limit";
import { EXPORT_WEIGHT } from "@/lib/rate-limit/classify";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // This route bypasses the `handle()` seam, so establish the log context here.
  return withRequestContext("web", async () => {
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    setLogContext({ userId: user.id });

    const workspace = await getCurrentWorkspace(user.id);
    // Per-person rate limit (C8): an export is a read — a heavy one, weighing
    // EXPORT_WEIGHT reads (the same as GET /api/v1/transactions/export).
    const limited = await rateLimitedResponse(user.id, "read", () => workspace.plan, EXPORT_WEIGHT);
    if (limited) return limited;
    const url = new URL(request.url);
    const filters = parseTxnFilters((k) => url.searchParams.get(k));
    const profiles = await getProfiles(user.id, workspace.id);
    // `?profile=` as the transactions page writes it: one profile, "all", or
    // the sidebar's selection (profiles and spaces), expanded against the
    // profiles this viewer can see — `listTransactions` intersects it again.
    // No parameter keeps this route's own default, every profile.
    const scope = parseProfileScope(url.searchParams.get("profile"));
    const resolved = scope.kind === "pick" ? resolveProfileScope(scope, profiles) : null;
    if (resolved) {
      filters.profileId = undefined;
      filters.profileIds = resolved.profileIds;
    }
    setLogContext({ workspaceId: workspace.id, profileId: resolved?.single ?? filters.profileId ?? null });

    const rows = await listTransactions(user.id, workspace.id, { ...filters, limit: 5000, offset: 0 });
    const profileName = resolved
      ? scopeLabel(resolved, profiles, Infinity)
      : filters.profileId
        ? (profiles.find((p) => p.id === filters.profileId)?.name ?? "Selected profile")
        : "All profiles";

    const csv = transactionsToReportCsv({
      rows,
      currency: workspace.currency,
      locale: workspace.locale,
      workspaceName: workspace.name,
      profileName,
      from: filters.from,
      to: filters.to,
    });
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="spendchat-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
