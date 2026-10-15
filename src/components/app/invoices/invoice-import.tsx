"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importInvoiceDraft } from "@/actions/invoices";
import { redrawLogo } from "@/components/business-doc/logo-image";
import { useDraft } from "@/components/tools/business-doc/draft-store";
import { getToolCurrency } from "@/components/tools/tool-state";
import { SelectField } from "@/components/tools/fields";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlan } from "@/components/app/upgrade-dialog";
import { evaluateDoc, hasContent, resolveDocDates } from "@/lib/business-doc/invoice";
import { docToInvoiceInput } from "@/lib/invoice-doc";
import type { InvoiceKind } from "@/lib/invoices";
import { formatMoney } from "@/lib/money";
import { toolPath } from "@/lib/tools";

const noop = () => () => {};

/**
 * `/app/invoices/import`: the draft from the free generator (kept in this
 * browser), brought in as a draft invoice or quote in a profile you pick. The
 * figures are read in the format they were typed in (this browser's), the
 * "from" details become your saved business details when there's room, and
 * the same draft brought in twice is still one invoice.
 */
export function InvoiceImport({
  kind,
  profiles,
  today,
  blocked,
}: {
  kind: InvoiceKind;
  profiles: { id: string; name: string; icon: string | null }[];
  today: string;
  /** Why nothing can be brought in right now, or null. */
  blocked: string | null;
}) {
  const doc = useDraft(kind === "quote" ? "quotation" : "invoice");
  // The draft lives in the browser: until hydration the store holds the blank server copy.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const noun = kind === "quote" ? "quote" : "invoice";
  const generator = toolPath(kind === "quote" ? "quotation-generator" : "invoice-generator");

  if (!hydrated) return <Skeleton className="h-40 w-full rounded-xl" />;

  if (!hasContent(doc)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">
          There&apos;s no {noun} from the free generator in this browser to bring in.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={generator}>Open the generator</Link>
          </Button>
          <Button asChild>
            <Link href={`/app/invoices/new?kind=${kind}`}>New {noun}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const locale = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US";
  const currency = doc.currency ?? getToolCurrency();
  const evaluation = evaluateDoc(doc, currency, locale);
  const dates = resolveDocDates(doc, today);

  const bringIn = () =>
    startTransition(async () => {
      const built = docToInvoiceInput(doc, { currency, locale, dates, extra: {} });
      if (!built.ok) {
        toast.error(`${built.error} Fix it in the generator and try again.`);
        return;
      }
      let logo: { contentType: "image/png" | "image/jpeg"; base64: string } | null = null;
      if (doc.logo) {
        const drawn = await redrawLogo(doc.logo).catch(() => null);
        if (drawn) {
          let bin = "";
          for (const b of drawn.bytes) bin += String.fromCharCode(b);
          logo = { contentType: drawn.kind === "png" ? "image/png" : "image/jpeg", base64: btoa(bin) };
        }
      }
      const res = await importInvoiceDraft({ kind, profileId, saveSeller: true, logo, ...built.input });
      if (!res.ok) {
        reportFailure(res, "Couldn't bring it in");
        return;
      }
      toast.success(
        res.created
          ? `Your ${noun} is here as a draft${res.sellerSaved ? ", and your details are saved for next time" : ""}.`
          : `You'd already brought this ${noun} in — here it is.`,
      );
      router.push(`/app/invoices/${res.id}`);
    });

  return (
    <div className="space-y-5">
      <div className="rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">From the free generator</p>
        <p className="mt-1 font-medium">
          {doc.to.name.trim() ? `${noun === "quote" ? "Quote" : "Invoice"} for ${doc.to.name.trim()}` : `Your ${noun}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {doc.items.filter((i) => i.description.trim() || i.price.trim()).length} line(s) ·{" "}
          {evaluation.totals ? formatMoney(evaluation.totals.total, currency, locale) : "—"}
          {doc.from.name.trim() && ` · from ${doc.from.name.trim()}`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          It comes in as a draft and gets its own number when you finalise it.
        </p>
      </div>

      {blocked ? (
        <p className="text-sm text-muted-foreground">{blocked}</p>
      ) : (
        <>
          {profiles.length > 1 && (
            <SelectField
              label="Profile"
              value={profileId}
              onChange={setProfileId}
              options={profiles.map((p) => ({ value: p.id, label: `${p.icon ? `${p.icon} ` : ""}${p.name}` }))}
            />
          )}
          <Button onClick={bringIn} disabled={pending || !profileId}>
            {pending && <Loader2 className="animate-spin" />} Bring it in as a draft
          </Button>
        </>
      )}
    </div>
  );
}
