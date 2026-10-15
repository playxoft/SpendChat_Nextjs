"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Maximize2 } from "lucide-react";
import { loadInvoiceEditorPanel, loadInvoicePanel } from "@/actions/invoices";
import { Skeleton } from "@/components/ui/skeleton";
import type { InvoiceSummaryDTO } from "@/lib/invoice-queries";
import type { InvoiceKind } from "@/lib/invoices";
import type { InvoiceEditorPayload, InvoiceEditorTarget } from "@/services/invoice-editor";
import { InvoiceDetailBody, type InvoiceDetailData } from "./invoice-detail";
import { FinalisedEditNote, InvoiceEditor } from "./invoice-editor";
import { InvoiceList, NewDocumentButtons } from "./invoice-list";
import { PanelClose, PanelEmpty, SplitView } from "./split-view";

/** What the panel shows, read off the URL. */
type PanelState =
  | { mode: "view"; id: string }
  | { mode: "edit"; id: string }
  | { mode: "new"; kind: InvoiceKind; profile: string | null }
  | { mode: "none" };

function panelFrom(params: URLSearchParams): PanelState {
  const fresh = params.get("new");
  if (fresh === "invoice" || fresh === "quote") return { mode: "new", kind: fresh, profile: params.get("profile") };
  const edit = params.get("edit");
  if (edit) return { mode: "edit", id: edit };
  const view = params.get("view");
  if (view) return { mode: "view", id: view };
  return { mode: "none" };
}

/** One key per thing the panel can load, so a fetched copy is matched to what's open. */
function keyOf(p: PanelState): string | null {
  if (p.mode === "view" || p.mode === "edit") return `${p.mode}:${p.id}`;
  if (p.mode === "new") return `new:${p.kind}:${p.profile ?? ""}`;
  return null;
}

type Loaded =
  | { key: string; kind: "detail"; detail: InvoiceDetailData | null }
  | { key: string; kind: "editor"; payload: InvoiceEditorPayload | null };

/**
 * The invoices list with its panel beside it — the section's split view. A row
 * opens the document in the panel; Edit, and New invoice / New quote, open the
 * editor there; saving shows the document. What's open lives in the URL
 * (`?view=`, `?edit=`, `?new=`), set with the browser's own history — which
 * Next keeps in step with `useSearchParams` — so a click doesn't re-render the
 * list on the server (or flash its loading skeleton); only the panel loads
 * (`loadInvoicePanel`, `loadInvoiceEditorPanel`). Back and forward step
 * through what was opened.
 *
 * `initialDetail` is the server's read of the document in `?view=` (a link or
 * a reload, and every refresh — after Finalise or Mark as paid the server
 * sends it again), so it wins over a copy fetched earlier.
 */
export function InvoicesBrowser({
  rows,
  locale,
  today,
  timeZone,
  showProfile,
  canAdd,
  profileParam,
  initialDetail,
  toolbar,
}: {
  /** The filters, the month's count and the New buttons — above the list, out of the way while editing. */
  toolbar: ReactNode;
  rows: InvoiceSummaryDTO[];
  locale: string;
  today: string;
  timeZone: string;
  showProfile: boolean;
  /** New invoices and quotes can be made here (the empty states offer them). */
  canAdd: boolean;
  /** The sidebar's single profile, where a new one goes. */
  profileParam: string | null;
  initialDetail: InvoiceDetailData | null;
}) {
  const searchParams = useSearchParams();
  const panel = panelFrom(searchParams);
  const key = keyOf(panel);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const detail: InvoiceDetailData | null | undefined =
    panel.mode === "view"
      ? initialDetail && initialDetail.invoice.id === panel.id
        ? initialDetail
        : loaded?.key === key && loaded.kind === "detail"
          ? loaded.detail
          : undefined
      : undefined;
  const payload: InvoiceEditorPayload | null | undefined =
    panel.mode === "edit" || panel.mode === "new"
      ? loaded?.key === key && loaded.kind === "editor"
        ? loaded.payload
        : undefined
      : undefined;
  // `undefined` = still to load; `null` = not there.
  const needed = key !== null && detail === undefined && payload === undefined;

  useEffect(() => {
    if (!needed || key === null) return;
    let cancelled = false;
    const target: InvoiceEditorTarget | null =
      panel.mode === "edit"
        ? { mode: "edit", id: panel.id }
        : panel.mode === "new"
          ? { mode: "new", kind: panel.kind, profile: panel.profile }
          : null;
    if (target) {
      void loadInvoiceEditorPanel(target).then((res) => {
        if (!cancelled) setLoaded({ key, kind: "editor", payload: res.ok ? res.payload : null });
      });
    } else if (panel.mode === "view") {
      void loadInvoicePanel(panel.id).then((res) => {
        if (!cancelled) setLoaded({ key, kind: "detail", detail: res.ok ? res.detail : null });
      });
    }
    return () => {
      cancelled = true;
    };
    // `panel` is read from the URL each render; `key` stands for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needed]);

  const go = (next: { view?: string; edit?: string; new?: InvoiceKind } = {}) => {
    // A copy loaded earlier may be out of date by now (a save, a payment): read afresh.
    setLoaded(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("edit");
    params.delete("new");
    if (next.view) params.set("view", next.view);
    if (next.edit) params.set("edit", next.edit);
    if (next.new) params.set("new", next.new);
    const q = params.toString();
    window.history.pushState(null, "", q ? `/app/invoices?${q}` : "/app/invoices");
  };
  const hrefFor = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("edit");
    params.delete("new");
    params.set("view", id);
    return `/app/invoices?${params.toString()}`;
  };
  const newButtons = <NewDocumentButtons canAdd={canAdd} reason={null} profileParam={profileParam} />;

  const list = (
    <InvoiceList
      rows={rows}
      locale={locale}
      today={today}
      timeZone={timeZone}
      showProfile={showProfile}
      emptyAction={canAdd ? newButtons : undefined}
      hrefFor={(row) => hrefFor(row.id)}
      selectedId={panel.mode === "view" || panel.mode === "edit" ? panel.id : null}
      onOpen={(id) => go({ view: id })}
    />
  );

  let content: ReactNode;
  if (panel.mode === "none") {
    content = (
      <PanelEmpty icon={<FileText className="size-5" />} action={canAdd ? newButtons : null}>
        Pick an invoice or quote to see it here{canAdd ? ", or start a new one" : ""}.
      </PanelEmpty>
    );
  } else if (panel.mode === "view") {
    content =
      detail === undefined ? (
        <PanelSkeleton onClose={() => go()} />
      ) : detail === null ? (
        <Gone onClose={() => go()} />
      ) : (
        <InvoiceDetailBody
          key={detail.invoice.id}
          data={detail}
          onEdit={(id) => go({ edit: id })}
          onDeleted={() => go()}
          trailing={
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={`/app/invoices/${detail.invoice.id}`}
                aria-label="Open on its own page"
                title="Open on its own page"
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Maximize2 className="size-4" />
              </Link>
              <PanelClose onClose={() => go()} />
            </div>
          }
        />
      );
  } else {
    // The editor takes the whole area — the form on the left, the document on
    // the right, each scrolling on its own. Closing it goes back to the
    // document it was opened on (the list, for a new one).
    const close = () => (panel.mode === "edit" ? go({ view: panel.id }) : go());
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {payload === undefined ? (
          <PanelSkeleton onClose={close} />
        ) : payload === null ? (
          <Gone onClose={() => go()} editing />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> {panel.mode === "edit" ? "Back to the document" : "Back to the list"}
              </button>
              <span aria-hidden className="text-muted-foreground/50">/</span>
              <h2 className="min-w-0 truncate text-base font-semibold">
                {payload.invoiceId === null
                  ? payload.kind === "quote"
                    ? "New quote"
                    : "New invoice"
                  : payload.number
                    ? `Edit ${payload.kind} ${payload.number}`
                    : `Edit draft ${payload.kind}`}
              </h2>
              <div className="ml-auto">
                <PanelClose onClose={close} />
              </div>
            </div>
            {payload.number && (
              <div className="shrink-0">
                <FinalisedEditNote kind={payload.kind} number={payload.number} />
              </div>
            )}
            {payload.blocked ? (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {payload.blocked}
              </p>
            ) : (
              <InvoiceEditor key={key} payload={payload} onSaved={(id) => go({ view: id })} fill />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">{toolbar}</div>
      <SplitView list={list} panel={content} open={panel.mode !== "none"} label="Invoice or quote" />
    </div>
  );
}

function Gone({ onClose, editing = false }: { onClose: () => void; editing?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
      <p>
        {editing
          ? "That document can't be edited — it may be paid or void, or in a profile you can't change."
          : "That document isn't here — it may have been deleted, or it's in a profile you can't see."}
      </p>
      <button type="button" onClick={onClose} className="underline underline-offset-2">
        Back to the list
      </button>
    </div>
  );
}

function PanelSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-5" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <PanelClose onClose={onClose} />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="aspect-[1/1.414] w-full rounded-xl" />
    </div>
  );
}
