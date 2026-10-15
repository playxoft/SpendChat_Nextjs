import type { Metadata } from "next";
import Link from "next/link";
import { getAppContext } from "@/lib/auth";
import { getAddLimits } from "@/lib/entitlements";
import { todayISO } from "@/lib/dates";
import { INVOICE_KINDS, INVOICE_STATUSES, STATUS_LABEL, type InvoiceKind, type InvoiceStatus } from "@/lib/invoices";
import { parseProfileScope, resolveProfileScope } from "@/lib/profile-scope";
import { getProfiles } from "@/lib/queries";
import { getTimeZone } from "@/lib/timezone.server";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { cn } from "@/lib/utils";
import { listInvoices } from "@/services/invoices";
import { NewDocumentButtons } from "@/components/app/invoices/invoice-list";
import { InvoicesBrowser } from "@/components/app/invoices/invoices-browser";
import { InvoiceLimitMeter } from "@/components/app/invoices/invoice-limits";
import { loadInvoiceDetail } from "@/services/invoice-detail";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed under /app) — a title is all it needs.
export const metadata: Metadata = { title: "Invoices", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Invoices and quotes in the current workspace — the ones the person can
 * read, newest first, filtered by kind and state. `?profile=` (the sidebar's
 * selection) narrows it to those profiles.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { user, workspace } = await getAppContext();
  const kindParam = one(sp.kind);
  const statusParam = one(sp.status);
  const kind = (INVOICE_KINDS as readonly string[]).includes(kindParam ?? "") ? (kindParam as InvoiceKind) : undefined;
  const status = (INVOICE_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as InvoiceStatus)
    : undefined;
  const profileParam = one(sp.profile) ?? null;
  // The document open in the side panel.
  const viewParam = one(sp.view) ?? null;

  const [rows, profiles, limits, canWrite, timeZone, detail] = await Promise.all([
    listInvoices(user.id, workspace.id, { kind, status }),
    getProfiles(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
    canWriteInWorkspace(user.id, workspace.id),
    getTimeZone(),
    viewParam ? loadInvoiceDetail(user.id, workspace, viewParam) : null,
  ]);
  const scope = profileParam ? resolveProfileScope(parseProfileScope(profileParam), profiles) : null;
  const inView = scope ? new Set(scope.profileIds) : null;
  const shown = inView ? rows.filter((r) => inView.has(r.profileId)) : rows;
  const today = todayISO(timeZone);

  const reached = limits.invoices.reached;
  const reason = limits.readOnly
    ? "This workspace is view-only."
    : reached
      ? `You've made ${limits.invoices.limit} invoices and quotes this month — you can make more next month.`
      : null;
  const canAdd = canWrite && !limits.readOnly && !reached;

  // A filter shows a new list, so it closes the side panel (`view`).
  const filterHref = (next: { kind?: string | null; status?: string | null }) => {
    const params = new URLSearchParams();
    const k = next.kind === undefined ? kind : next.kind;
    const s = next.status === undefined ? status : next.status;
    if (k) params.set("kind", k);
    if (s) params.set("status", s);
    if (profileParam) params.set("profile", profileParam);
    const q = params.toString();
    return q ? `/app/invoices?${q}` : "/app/invoices";
  };

  // Above the list; the browser sets it aside while the editor is open.
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Type">
          <SegmentLink href={filterHref({ kind: null })} active={!kind}>
            All
          </SegmentLink>
          <SegmentLink href={filterHref({ kind: "invoice" })} active={kind === "invoice"}>
            Invoices
          </SegmentLink>
          <SegmentLink href={filterHref({ kind: "quote" })} active={kind === "quote"}>
            Quotes
          </SegmentLink>
        </Segmented>
        {/* Picking the state on view again clears it — any state. */}
        <Segmented label="State">
          {INVOICE_STATUSES.map((s) => (
            <SegmentLink key={s} href={filterHref({ status: status === s ? null : s })} active={status === s}>
              {STATUS_LABEL[s]}
            </SegmentLink>
          ))}
        </Segmented>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <InvoiceLimitMeter
          kind="invoices"
          used={limits.invoices.used}
          max={limits.invoices.limit}
          className="text-sm text-muted-foreground"
        />
        {canWrite && <NewDocumentButtons canAdd={canAdd} reason={reason} profileParam={scope?.single ?? null} />}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InvoicesBrowser
        toolbar={toolbar}
        rows={shown}
        locale={workspace.locale}
        today={today}
        timeZone={timeZone}
        showProfile={profiles.length > 1}
        canAdd={canAdd}
        profileParam={scope?.single ?? null}
        initialDetail={detail}
      />
    </div>
  );
}

/** One "bubble" toggle: its options share a pill, the picked one raised inside it. */
function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full border bg-muted/50 p-0.5">
      {children}
    </div>
  );
}

function SegmentLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
