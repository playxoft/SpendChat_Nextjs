"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlan } from "@/components/app/upgrade-dialog";
import { INVOICE_LIMITS } from "@/lib/plans";
import { formatAmount, invoiceAddonPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Invoicing's own limits, shown up front. No plan lifts them — Free, Plus and
 * Pro all get the free tier — so instead of the plan upgrade dialog they point
 * to the invoicing add-on (`INVOICE_LIMITS.addon`), and past the add-on's
 * allowance to a Business plan that's coming soon.
 *
 * Every meter here reads the free tier's numbers: it's the only tier a
 * workspace can be on until the add-on is sold (`invoiceTierOf`).
 */

const FREE = INVOICE_LIMITS.free;
const ADDON = INVOICE_LIMITS.addon;

export type InvoiceLimitKind = "invoices" | "clients" | "sellers";

const NOUN: Record<InvoiceLimitKind, string> = {
  invoices: "made this month",
  clients: "saved",
  sellers: "saved",
};

function reasonFor(kind: InvoiceLimitKind, max: number): string {
  switch (kind) {
    case "invoices":
      return `Free invoicing includes ${max} invoices and quotes a month. To increase the limit, upgrade to the invoicing add-on — ${ADDON.perMonth} a month.`;
    case "clients":
      return `Free invoicing includes ${max} saved clients. To increase the limit, upgrade to the invoicing add-on — no limit on clients.`;
    case "sellers":
      return `Free invoicing includes ${max} sets of business details. To increase the limit, upgrade to the invoicing add-on — ${ADDON.sellerDetails} sets.`;
  }
}

/**
 * "3 of 20 saved", with an info button: hovering shows why there's a limit and
 * an Upgrade button; clicking (or the Upgrade button) opens the add-on dialog,
 * so keyboard users get there too.
 */
export function InvoiceLimitMeter({
  kind,
  used,
  max,
  className,
}: {
  kind: InvoiceLimitKind;
  used: number;
  max: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={cn("tabular-nums", used >= max && "font-medium text-foreground")}>
        {used} of {max} {NOUN[kind]}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About this limit"
            onClick={() => setOpen(true)}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Info aria-hidden className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          variant="surface"
          className="max-w-72 flex-col items-start gap-2 text-left text-sm"
        >
          <span>{reasonFor(kind, max)}</span>
          <Button type="button" size="sm" className="h-7 px-3" onClick={() => setOpen(true)}>
            Upgrade
          </Button>
        </TooltipContent>
      </Tooltip>
      <InvoiceAddonDialog open={open} onOpenChange={setOpen} />
    </span>
  );
}

/**
 * What the invoicing add-on adds, side by side with the free tier, and its
 * price in the currency checkout would charge. It isn't on sale yet, so the
 * buy button says so rather than leading nowhere.
 */
export function InvoiceAddonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currency = usePlan().currency ?? "USD";
  const monthly = formatAmount(invoiceAddonPrice("monthly", currency), currency);
  const yearly = formatAmount(invoiceAddonPrice("yearly", currency), currency);
  const rows: { label: string; free: string; addon: string }[] = [
    {
      label: "Invoices and quotes a month",
      free: FREE.perMonth.toLocaleString("en-US"),
      addon: ADDON.perMonth.toLocaleString("en-US"),
    },
    {
      label: "Saved clients",
      free: FREE.clients === null ? "No limit" : FREE.clients.toLocaleString("en-US"),
      addon: ADDON.clients === null ? "No limit" : ADDON.clients.toLocaleString("en-US"),
    },
    {
      label: "Sets of business details",
      free: String(FREE.sellerDetails),
      addon: String(ADDON.sellerDetails),
    },
    {
      label: "“Made with SpendChat” on documents",
      free: FREE.footer ? "Shown" : "Off",
      addon: ADDON.footer ? "Shown" : "Off",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" closeOnOutsideClick>
        <DialogHeader>
          <DialogTitle>Invoicing add-on</DialogTitle>
          <DialogDescription>
            More room for invoices and quotes in this workspace, on any plan — {monthly} a month, or {yearly} a
            year.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-normal">
                <span className="sr-only">Limit</span>
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Free
              </th>
              <th scope="col" className="pb-2 text-right font-medium text-foreground">
                Add-on
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {r.label}
                </th>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{r.free}</td>
                <td className="py-2 pl-3 text-right font-medium tabular-nums">{r.addon}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Need more than {ADDON.perMonth.toLocaleString("en-US")} a month? A Business plan is coming soon.
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled>
            Coming soon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
