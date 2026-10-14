import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/tools/date-math";
import type { InvoiceSummaryDTO } from "@/lib/invoice-queries";
import { InvoiceStatusBadge } from "./invoice-status";

/**
 * The invoices list: number (or "Draft"), who it's for, dates, total and
 * state — newest first. Every row opens the document.
 */
export function InvoiceList({
  rows,
  locale,
  today,
  showProfile,
  emptyAction,
}: {
  rows: InvoiceSummaryDTO[];
  locale: string;
  today: string;
  /** More than one profile in view — say which each belongs to. */
  showProfile: boolean;
  /** What the empty state offers (the New buttons), when the person can add. */
  emptyAction?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Nothing here yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Make an invoice or a quote, download it as a PDF or send a link, and mark it paid when the
            money arrives — it lands in your tracker as income.
          </p>
        </div>
        {emptyAction}
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/app/invoices/${row.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{row.number ?? (row.kind === "quote" ? "Draft quote" : "Draft invoice")}</span>
                <InvoiceStatusBadge kind={row.kind} status={row.status} dueDate={row.dueDate} today={today} />
                {row.kind === "quote" && row.number && (
                  <span className="text-xs text-muted-foreground">Quote</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {row.clientName || "No client yet"}
                {" · "}
                {formatDate(row.issueDate, locale, "medium")}
                {row.dueDate && row.status === "sent" && ` · due ${formatDate(row.dueDate, locale, "medium")}`}
                {showProfile && row.profileName && ` · ${row.profileIcon ? `${row.profileIcon} ` : ""}${row.profileName}`}
              </p>
            </div>
            <span className="shrink-0 text-right font-medium tabular-nums">
              {formatMoney(row.totalMinor, row.currency, locale)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "New invoice" / "New quote", or the reason they're off. */
export function NewDocumentButtons({
  canAdd,
  reason,
  profileParam,
}: {
  canAdd: boolean;
  /** Why nothing can be added — shown instead of the buttons. */
  reason: string | null;
  profileParam: string | null;
}) {
  if (!canAdd) {
    return reason ? <p className="max-w-xs text-right text-sm text-muted-foreground">{reason}</p> : null;
  }
  const q = profileParam ? `&profile=${encodeURIComponent(profileParam)}` : "";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href={`/app/invoices/new?kind=quote${q}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        <Plus className="size-4" /> New quote
      </Link>
      <Link
        href={`/app/invoices/new?kind=invoice${q}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        <Plus className="size-4" /> New invoice
      </Link>
    </div>
  );
}
