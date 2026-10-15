"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  Lock,
  Pencil,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  convertQuoteToInvoice,
  deleteInvoiceDraft,
  finaliseInvoice,
  listInvoiceShareLinks,
  markInvoicePaid,
  revokeInvoiceShareLink,
  sendInvoiceLink,
  voidInvoice,
} from "@/actions/invoices";
import { DateField, NumberField, SelectField } from "@/components/tools/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlan } from "@/components/app/upgrade-dialog";
import type { InvoiceShareDTO } from "@/lib/invoice-doc";
import {
  canConvert,
  canDelete,
  canEdit as canEditStatus,
  canFinalise,
  canMarkPaid,
  canShare,
  canVoid,
  type InvoiceKind,
  type InvoiceStatus,
} from "@/lib/invoices";
import { formatMoney, fromMinorUnits, minorToInputString } from "@/lib/money";
import { currencySymbol, parseNumber } from "@/lib/tools/format";

type Doc = {
  id: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  number: string | null;
  currency: string;
  totalMinor: number;
};

/**
 * Everything you can do to a document, by its state: a draft is edited,
 * finalised or deleted; a sent one is downloaded, shared, marked paid or
 * voided; a quote becomes an invoice. Only the buttons the state allows are
 * shown, and the server checks them all again.
 */
export function InvoiceActions({
  doc,
  canEdit,
  workspaceCurrency,
  locale,
  today,
  incomeCategories,
  onEdit,
  onDeleted,
}: {
  doc: Doc;
  /** Edit access to the document's profile (viewers only download). */
  canEdit: boolean;
  workspaceCurrency: string;
  locale: string;
  today: string;
  incomeCategories: { id: string; name: string; icon: string | null }[];
  /**
   * Open a document in the editor in place (the invoices list's panel) —
   * Edit, and the draft a quote turns into. Without it they go to the edit page.
   */
  onEdit?: (id: string) => void;
  /** After a draft is deleted (the panel closes); without it, back to the list. */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [confirm, setConfirm] = useState<"finalise" | "void" | "delete" | null>(null);
  const { pending, done, startTransition, finish } = useDoneThenClose(() => setConfirm(null));
  const [paying, setPaying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const noun = doc.kind === "quote" ? "quote" : "invoice";
  const pdfHref = `/api/invoices/${doc.id}/pdf`;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; code?: string; details?: unknown }>, doneMessage: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success(doneMessage);
      finish(() => router.refresh());
    });

  const convert = () =>
    startTransition(async () => {
      const res = await convertQuoteToInvoice(doc.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Made a draft invoice from this quote.");
      if (onEdit) {
        onEdit(res.id);
        startTransition(() => router.refresh());
      } else {
        // In the transition, so the button keeps spinning until the editor is up.
        startTransition(() => router.push(`/app/invoices/${res.id}/edit`));
      }
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteInvoiceDraft(doc.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success("Draft deleted.");
      if (onDeleted) {
        setConfirm(null);
        onDeleted();
        startTransition(() => router.refresh());
      } else {
        startTransition(() => router.push("/app/invoices"));
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {canEdit && canEditStatus(doc.status) &&
        (onEdit ? (
          <Button variant="outline" onClick={() => onEdit(doc.id)}>
            <Pencil /> Edit
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={`/app/invoices/${doc.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        ))}
      {canEdit && canFinalise(doc.status) && (
        <Button onClick={() => setConfirm("finalise")} disabled={pending}>
          <Lock /> Finalise
        </Button>
      )}
      {canEdit && canMarkPaid(doc.kind, doc.status) && (
        <Button onClick={() => setPaying(true)} disabled={pending}>
          <BadgeCheck /> Mark as paid
        </Button>
      )}
      {canEdit && canConvert(doc.kind, doc.status) && (
        <Button onClick={convert} disabled={pending} variant={doc.status === "draft" ? "outline" : "default"}>
          <ArrowRight /> Turn into invoice
        </Button>
      )}
      <Button asChild variant="outline">
        <a href={`${pdfHref}?download=1`} download>
          <Download /> {doc.status === "draft" ? "Draft PDF" : "PDF"}
        </a>
      </Button>
      <Button variant="outline" onClick={() => window.open(pdfHref, "_blank", "noopener")} title="Open the PDF to print">
        <Printer /> <span className="max-sm:sr-only">Print</span>
      </Button>
      {canEdit && (canShare(doc.status) || canFinalise(doc.status)) && doc.status !== "void" && (
        <Button variant="outline" onClick={() => setSharing(true)} disabled={pending}>
          <Link2 /> Share link
        </Button>
      )}
      {canEdit && canVoid(doc.status) && (
        <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirm("void")} disabled={pending}>
          <Ban /> Void
        </Button>
      )}
      {canEdit && canDelete(doc.status) && (
        <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirm("delete")} disabled={pending}>
          <Trash2 /> Delete draft
        </Button>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !pending && !done && !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "finalise"
                ? `Finalise this ${noun}?`
                : confirm === "void"
                  ? `Void ${doc.number}?`
                  : "Delete this draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "finalise"
                ? `It gets the next ${noun} number, and its PDF is saved to your workspace's storage. You can still edit it until it's paid — it keeps its number, and the date of the edit is recorded.`
                : confirm === "void"
                  ? `It stays on record with its number, marked void. Nothing is deleted.`
                  : "It has no number yet, so nothing is skipped in your series."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending || done}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "finalise" ? undefined : buttonVariants({ variant: "destructive" })}
              disabled={pending || done}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "finalise") run(() => finaliseInvoice(doc.id), `Finalised — it's ready to send.`);
                else if (confirm === "void") run(() => voidInvoice(doc.id), `${doc.number} is void.`);
                else remove();
              }}
            >
              <ProgressLabel
                pending={pending}
                done={done}
                idle={confirm === "finalise" ? "Finalise" : confirm === "void" ? "Void" : "Delete"}
                working={confirm === "finalise" ? "Finalising…" : confirm === "void" ? "Voiding…" : "Deleting…"}
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {paying && (
        <MarkPaidDialog
          doc={doc}
          workspaceCurrency={workspaceCurrency}
          locale={locale}
          today={today}
          incomeCategories={incomeCategories}
          onClose={() => setPaying(false)}
        />
      )}
      {sharing && <ShareDialog doc={doc} onClose={() => setSharing(false)} />}
    </div>
  );
}

/**
 * "Mark as paid": the income entry, in the workspace's currency. Same currency
 * — the invoice total, which can be changed (a part payment, a bank fee). Another
 * currency — what arrived, typed in the workspace's currency.
 */
function MarkPaidDialog({
  doc,
  workspaceCurrency,
  locale,
  today,
  incomeCategories,
  onClose,
}: {
  doc: Doc;
  workspaceCurrency: string;
  locale: string;
  today: string;
  incomeCategories: { id: string; name: string; icon: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const same = doc.currency === workspaceCurrency;
  const [amount, setAmount] = useState(same ? minorToInputString(doc.totalMinor, workspaceCurrency, locale) : "");
  const [paidOn, setPaidOn] = useState(today);
  // Invoice income is usually freelance or business income — preselect that if the workspace has it.
  const [categoryId, setCategoryId] = useState(
    incomeCategories.find((c) => /freelanc|business|invoice|sales/i.test(c.name))?.id ?? "",
  );
  const { pending, done, startTransition, finish } = useDoneThenClose(onClose);
  const parsed = amount.trim() ? parseNumber(amount, locale) : null;
  const error = amount.trim() && (parsed === null || parsed <= 0) ? "Enter the amount you received." : null;

  const submit = () => {
    if (parsed === null || parsed <= 0) {
      toast.error("Enter the amount you received.");
      return;
    }
    startTransition(async () => {
      const res = await markInvoicePaid(doc.id, { amount: parsed, paidOn, categoryId: categoryId || null });
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      toast.success(res.alreadyPaid ? "It was already marked paid." : "Marked paid — the income is in your tracker.");
      finish(() => router.refresh());
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !pending && !done && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {doc.number} as paid</DialogTitle>
          <DialogDescription>
            {same
              ? `An income entry for what you received goes into this invoice's profile.`
              : `This invoice is ${formatMoney(doc.totalMinor, doc.currency, locale)}. Your workspace keeps its books in ${workspaceCurrency} — enter what reached you, in ${workspaceCurrency}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <NumberField
            label={`Amount received (${workspaceCurrency})`}
            value={amount}
            onChange={setAmount}
            prefix={currencySymbol(workspaceCurrency, locale)}
            placeholder={same ? undefined : String(fromMinorUnits(0, workspaceCurrency))}
            error={error}
          />
          <DateField label="Paid on" value={paidOn} onChange={setPaidOn} max={today} />
          {incomeCategories.length > 0 && (
            <SelectField
              label="Category"
              value={categoryId}
              onChange={setCategoryId}
              options={[
                ...incomeCategories.map((c) => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ""}${c.name}` })),
                { value: "", label: "No category" },
              ]}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending || done}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || done}>
            <ProgressLabel pending={pending} done={done} idle="Mark as paid" working="Marking as paid…" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The document's public links: copy one to send, make another, or revoke. A
 * draft is finalised first ("Finalise and get a link") — a link must never show
 * something that can still change.
 */
function ShareDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [shares, setShares] = useState<InvoiceShareDTO[] | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = doc.status === "draft";

  useEffect(() => {
    if (draft) return;
    let cancelled = false;
    (async () => {
      const res = await listInvoiceShareLinks(doc.id);
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setShares([]);
        return;
      }
      setShares(res.shares);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, draft]);

  const url = (s: InvoiceShareDTO) => `${window.location.origin}${s.path}`;
  const copy = async (s: InvoiceShareDTO) => {
    try {
      await navigator.clipboard.writeText(url(s));
      toast.success("Link copied — anyone with it can view and download this document.");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const make = () =>
    startTransition(async () => {
      const res = await sendInvoiceLink(doc.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      setShares((list) => [res.share, ...(list ?? []).filter((s) => s.id !== res.share.id)]);
      await copy(res.share);
      if (draft) router.refresh();
    });

  const revoke = (s: InvoiceShareDTO) =>
    startTransition(async () => {
      const res = await revokeInvoiceShareLink(doc.id, s.id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      setShares((list) => (list ?? []).filter((x) => x.id !== s.id));
      toast.success("Link revoked — it stops working now.");
    });

  return (
    <Dialog open onOpenChange={(o) => !pending && !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {doc.number ?? `this ${doc.kind}`}</DialogTitle>
          <DialogDescription>
            {draft
              ? `A link can only show a finalised document. Finalising gives it its number and locks it.`
              : "Anyone with the link can view the document and download its PDF. Revoke a link to stop it."}
          </DialogDescription>
        </DialogHeader>
        {!draft && (
          <ul className="space-y-2">
            {shares === null ? (
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading links…
              </li>
            ) : shares.length === 0 ? (
              <li className="text-sm text-muted-foreground">No links yet.</li>
            ) : (
              shares.map((s) => (
                <li key={s.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <code className="min-w-0 flex-1 truncate text-xs">{url(s)}</code>
                  <Button size="sm" variant="outline" onClick={() => void copy(s)}>
                    <Copy /> Copy
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Revoke this link" onClick={() => revoke(s)} disabled={pending}>
                    <X />
                  </Button>
                </li>
              ))
            )}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Close
          </Button>
          {(draft || (shares !== null && shares.length === 0)) && (
            <Button onClick={make} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {draft ? "Finalise and get a link" : "Get a link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A confirm button's whole story: a spinner while the action — and the page
 * refresh after it — run, then a check and "Done" once the refreshed page is
 * in, then `close`. Before, the dialog shut the moment the server answered and
 * the page sat on the old state until the refresh landed, which read as if
 * nothing had happened. `finish(refresh)` marks the action done and runs the
 * refresh inside the transition, so `pending` holds until it has rendered.
 */
function useDoneThenClose(close: () => void) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!done || pending) return;
    const t = window.setTimeout(() => {
      setDone(false);
      closeRef.current();
    }, 700);
    return () => window.clearTimeout(t);
  }, [done, pending]);
  const finish = (refresh: () => void) => {
    setDone(true);
    startTransition(refresh);
  };
  return { pending, done, startTransition, finish };
}

function ProgressLabel({
  pending,
  done,
  idle,
  working,
}: {
  pending: boolean;
  done: boolean;
  idle: string;
  working: string;
}) {
  if (pending) {
    return (
      <>
        <Loader2 className="animate-spin" /> {working}
      </>
    );
  }
  if (done) {
    return (
      <>
        <Check /> Done
      </>
    );
  }
  return <>{idle}</>;
}
