"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/tools/date-math";
import type { InvoiceSummaryDTO } from "@/lib/invoice-queries";
import { dateISOIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { InvoiceKindBadge, InvoiceStatusBadge } from "./invoice-status";

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
  hrefFor = (row) => `/app/invoices/${row.id}`,
  selectedId = null,
  timeZone,
  onOpen,
}: {
  rows: InvoiceSummaryDTO[];
  locale: string;
  today: string;
  /** More than one profile in view — say which each belongs to. */
  showProfile: boolean;
  /** What the empty state offers (the New buttons), when the person can add. */
  emptyAction?: React.ReactNode;
  /** Where a row goes — the list opens it in its side panel. */
  hrefFor?: (row: InvoiceSummaryDTO) => string;
  /** The row open in the side panel. */
  selectedId?: string | null;
  /** The viewer's — what day an edit fell on. */
  timeZone?: string;
  /** Open a row in place (the side panel). A modified click still follows the link. */
  onOpen?: (id: string) => void;
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
    <ul className="divide-y overflow-hidden rounded-xl border">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={hrefFor(row)}
            scroll={false}
            onClick={(e) => {
              if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(row.id);
            }}
            aria-current={row.id === selectedId ? "true" : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
              row.id === selectedId && "bg-muted",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <InvoiceKindBadge kind={row.kind} />
                <span className="truncate font-medium">{row.number ?? (row.kind === "quote" ? "Draft quote" : "Draft invoice")}</span>
                <InvoiceStatusBadge kind={row.kind} status={row.status} dueDate={row.dueDate} today={today} />
                {row.editedAt && (
                  <span className="hidden text-xs text-muted-foreground sm:inline" title={`Edited ${formatDate(dateISOIn(new Date(row.editedAt), timeZone), locale, "medium")}`}>
                    Edited
                  </span>
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

/**
 * "New invoice" / "New quote", or the reason they're off. On the invoices list
 * they open the editor in its side panel (`?new=`, set with the browser's own
 * history like the rest of the panel — `InvoicesBrowser`); a modified click
 * still opens the editor's own page.
 */
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!canAdd) {
    return reason ? <p className="max-w-xs text-right text-sm text-muted-foreground">{reason}</p> : null;
  }
  const q = profileParam ? `&profile=${encodeURIComponent(profileParam)}` : "";
  const openInPanel = (kind: "invoice" | "quote") => (e: React.MouseEvent) => {
    if (pathname !== "/app/invoices" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("edit");
    params.set("new", kind);
    window.history.pushState(null, "", `/app/invoices?${params.toString()}`);
  };
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href={`/app/invoices/new?kind=quote${q}`}
        onClick={openInPanel("quote")}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        <Plus className="size-4" /> New quote
      </Link>
      <Link
        href={`/app/invoices/new?kind=invoice${q}`}
        onClick={openInPanel("invoice")}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        <Plus className="size-4" /> New invoice
      </Link>
    </div>
  );
}
