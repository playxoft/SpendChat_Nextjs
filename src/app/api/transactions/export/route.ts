import { getCurrentUser, getCurrentWorkspace, getUserSettings } from "@/lib/auth";
import { listTransactions } from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import { transactionsToCsv } from "@/lib/transactions-csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const settings = await getUserSettings(user.id);
  const workspace = await getCurrentWorkspace(user.id);
  const url = new URL(request.url);
  const filters = parseTxnFilters((k) => url.searchParams.get(k));

  const rows = await listTransactions(user.id, workspace.id, { ...filters, limit: 5000, offset: 0 });
  const csv = transactionsToCsv(rows, settings.currency);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spendchat-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
