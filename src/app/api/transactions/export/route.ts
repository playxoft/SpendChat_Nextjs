import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { getProfiles, listTransactions } from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import { transactionsToReportCsv } from "@/lib/transactions-csv";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // This route bypasses the `handle()` seam, so establish the log context here.
  return withRequestContext("web", async () => {
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    setLogContext({ userId: user.id });

    const workspace = await getCurrentWorkspace(user.id);
    const url = new URL(request.url);
    const filters = parseTxnFilters((k) => url.searchParams.get(k));
    setLogContext({ workspaceId: workspace.id, profileId: filters.profileId ?? null });

    const [rows, profiles] = await Promise.all([
      listTransactions(user.id, workspace.id, { ...filters, limit: 5000, offset: 0 }),
      getProfiles(user.id, workspace.id),
    ]);
    const profileName = filters.profileId
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
