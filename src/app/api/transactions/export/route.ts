import { getCurrentUser, getUserSettings } from "@/lib/auth";
import { listTransactions } from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import { toCsv } from "@/lib/csv";
import { fromMinorUnits, signedMinor } from "@/lib/money";
import { getCurrency } from "@/lib/currencies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const settings = await getUserSettings(user.id);
  const url = new URL(request.url);
  const filters = parseTxnFilters((k) => url.searchParams.get(k));

  const rows = await listTransactions(user.id, { ...filters, limit: 5000, offset: 0 });
  const decimals = getCurrency(settings.currency).decimals;

  const header = ["Date", "Type", "Category", "Note", "Amount", "Currency"];
  const data = rows.map((r) => [
    r.occurredOn,
    r.type,
    r.categoryName ?? "Uncategorized",
    r.note ?? "",
    fromMinorUnits(signedMinor(r.type, r.amountMinor), settings.currency).toFixed(decimals),
    settings.currency,
  ]);

  const csv = toCsv(header, data);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="moneytracker-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
