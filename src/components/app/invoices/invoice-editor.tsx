"use client";

import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { saveInvoiceClient, saveInvoiceDraft } from "@/actions/invoices";
import { DocPaper } from "@/components/business-doc/doc-paper";
import { FitPaper } from "@/components/business-doc/fit-paper";
import { LineItems } from "@/components/business-doc/line-items";
import { ChoiceChips, DateField, NumberField, Segmented, SelectField, TextAreaField, TextField } from "@/components/tools/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyCombobox } from "@/components/app/currency-combobox";
import { usePlan } from "@/components/app/upgrade-dialog";
import {
  dueBeforeIssue,
  evaluateDoc,
  resolveDocDates,
  type BusinessDoc,
  type Buyer,
  type Seller,
} from "@/lib/business-doc/invoice";
import { CUSTOM_TERMS, docLabels } from "@/lib/business-doc/labels";
import { qrMatrix } from "@/lib/business-doc/qr";
import { docTheme } from "@/lib/business-doc/templates";
import { clientToDocTo, docToInvoiceInput, sellerLogoUrl, sellerToDocFrom } from "@/lib/invoice-doc";
import { EmailField, PhoneField, contactProblem } from "./contact-inputs";
import type { InvoiceSellerDTO } from "@/lib/invoice-queries";
import type { InvoiceEditorPayload } from "@/services/invoice-editor";
import {
  DOC_FIELD_LIMITS,
  UPI_ID_MAX,
  isValidUpiId,
  templatesFor,
  upiPayLink,
  type InvoiceKind,
  type InvoiceTemplateId,
} from "@/lib/invoices";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/tools/date-math";
import { currencySymbol } from "@/lib/tools/format";
import { cn } from "@/lib/utils";

const NEW_CLIENT = "";
const TYPED_SELLER = "";

/**
 * The invoice and quote editor — the free generator's own pieces (line items,
 * the paper, its labels and totals engine) around the app's records: a
 * profile, a saved client, saved business details with their logo, a template.
 * The paper beside the form is exactly what the PDF will be.
 *
 * It saves the whole document as a draft; the server re-totals it and keeps
 * nothing typed it didn't check. A draft has no number until it's finalised.
 */
export function InvoiceEditor({
  payload,
  onSaved,
  fill = false,
}: {
  /** What it opens on (`loadInvoiceEditor`): the document, where it can go, what's saved there. */
  payload: InvoiceEditorPayload;
  /**
   * After a save. Without it the editor goes to the document's own page; the
   * invoices list's panel passes one to show the document in the panel instead.
   */
  onSaved?: (id: string) => void;
  /**
   * Fill the height it's given (the invoices tab, which fits the screen): the
   * form and the preview each scroll on their own. Without it the page scrolls
   * and the preview stays in view beside the form.
   */
  fill?: boolean;
}) {
  const { invoiceId, kind, initialDoc, initial, profiles, clients, sellers, locale, today, footer } = payload;
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [doc, setDoc] = useState<BusinessDoc>({ ...initialDoc, credit: footer });
  const [profileId, setProfileId] = useState(initial.profileId);
  const [clientId, setClientId] = useState<string | null>(initial.clientId);
  const [sellerId, setSellerId] = useState<string | null>(initial.sellerId);
  const [upiId, setUpiId] = useState(initial.upiId);
  const [template, setTemplate] = useState<InvoiceTemplateId>(initial.template);
  const [currency, setCurrency] = useState(initial.currency);
  const [clientList, setClientList] = useState(clients);
  const [dueOpen, setDueOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  // A finalised document being edited (it has its number): saving keeps it and records the edit.
  const finalised = Boolean(invoiceId && initialDoc.number);
  const [savingClient, startSavingClient] = useTransition();

  const labels = docLabels(doc.kind, doc.quoteTitle);
  const evaluation = evaluateDoc(doc, currency, locale);
  const dates = resolveDocDates(doc, today);
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const symbol = currencySymbol(currency, locale);
  const profileClients = clientList.filter((c) => c.profileId === profileId);
  const profileSellers = sellers.filter((s) => s.profileId === profileId);
  const upiError = upiId.trim() && !isValidUpiId(upiId.trim()) ? "Enter a UPI ID like name@bank" : null;

  const update = (patch: Partial<BusinessDoc>) => setDoc((d) => ({ ...d, ...patch }));
  const setFrom = (patch: Partial<Seller>) => setDoc((d) => ({ ...d, from: { ...d.from, ...patch } }));
  const setTo = (patch: Partial<Buyer>) => {
    setDoc((d) => ({ ...d, to: { ...d.to, ...patch } }));
  };

  // The pay-by-UPI code the paper shows, from what's typed right now.
  const payment = useMemo(() => {
    const total = evaluation.totals?.total ?? 0;
    if (kind !== "invoice" || !upiId.trim()) return null;
    const link = upiPayLink({
      upiId: upiId.trim(),
      payeeName: doc.from.name,
      amountMinor: total,
      currency,
      note: doc.number ? `Invoice ${doc.number}` : "Invoice",
    });
    return link ? { label: "Pay by UPI", upiId: upiId.trim(), qr: qrMatrix(link) } : null;
  }, [kind, upiId, doc.from.name, doc.number, evaluation.totals?.total, currency]);

  const pickSeller = (id: string) => {
    const seller = profileSellers.find((s) => s.id === id);
    setSellerId(seller?.id ?? null);
    if (seller) {
      setFrom(sellerToDocFrom(seller));
      setUpiId(seller.upiId ?? "");
      update({ logo: sellerLogoUrl(seller) });
    } else {
      update({ logo: null });
    }
  };

  const pickClient = (id: string) => {
    const client = profileClients.find((c) => c.id === id);
    setClientId(client?.id ?? null);
    if (client) setTo(clientToDocTo(client));
  };

  const pickProfile = (id: string) => {
    setProfileId(id);
    // Saved clients and details belong to a profile — a pick from another one doesn't carry over.
    if (clientId && !clientList.some((c) => c.id === clientId && c.profileId === id)) setClientId(null);
    const sellerStays = sellerId !== null && sellers.some((s) => s.id === sellerId && s.profileId === id);
    if (!sellerStays) {
      const here = sellers.find((s) => s.profileId === id);
      if (here) {
        pickSellerFrom(here);
      } else {
        setSellerId(null);
        update({ logo: null });
      }
    }
  };
  const pickSellerFrom = (seller: InvoiceSellerDTO) => {
    setSellerId(seller.id);
    setFrom(sellerToDocFrom(seller));
    setUpiId(seller.upiId ?? "");
    update({ logo: sellerLogoUrl(seller) });
  };

  const saveClient = () => {
    if (!doc.to.name.trim()) {
      toast.error("Type the client's name first.");
      return;
    }
    startSavingClient(async () => {
      const res = await saveInvoiceClient({
        profileId,
        name: doc.to.name,
        email: doc.to.email || null,
        address: doc.to.address || null,
        taxId: doc.to.taxId || null,
        phone: doc.to.phone || null,
        contactPerson: doc.to.contactPerson || null,
      });
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      setClientList((list) => [...list, res.client].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(res.client.id);
      toast.success(`Saved ${res.client.name} to your clients.`);
    });
  };

  const save = () => {
    if (upiError) {
      toast.error(upiError);
      return;
    }
    // The fields say what's wrong under themselves; this says why nothing saved.
    const contactError = contactProblem({
      email: [doc.from.contact, doc.to.email],
      phone: [doc.from.phone ?? "", doc.to.phone ?? ""],
    });
    if (contactError) {
      toast.error(`Check the highlighted email and phone fields — ${contactError.toLowerCase()}.`);
      return;
    }
    const built = docToInvoiceInput(doc, {
      currency,
      locale,
      dates,
      extra: { profileId, clientId, sellerId, upiId: upiId.trim() || null, template },
    });
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    startSaving(async () => {
      const res = await saveInvoiceDraft(invoiceId, { kind, ...built.input, profileId });
      if (!res.ok) {
        reportFailure(res, "Couldn't save the draft");
        return;
      }
      toast.success(
        finalised ? `Saved — ${initialDoc.number} shows the change.` : invoiceId ? "Draft saved." : `Draft ${labels.noun} saved.`,
      );
      if (onSaved) {
        onSaved(res.id);
      } else {
        router.push(`/app/invoices/${res.id}`);
      }
      router.refresh();
    });
  };

  const dueError = dueBeforeIssue(dates.issue, dates.due) ? `This is before the ${labels.issue.toLowerCase()}.` : null;
  const summary = evaluation.totals ? money(evaluation.totals.total) : "—";
  const filledLines = doc.items.filter((i) => i.description.trim() || i.price.trim()).length;
  const templates = templatesFor("free");

  return (
    // Side by side when the editor has the room (its own page), stacked when it
    // doesn't (the invoices list's panel, a phone) — by its container, not the window.
    <div className={cn("@container", fill && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col")}>
    <div
      className={cn(
        "grid items-start gap-6 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]",
        fill && "lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch",
      )}
    >
      <div
        className={cn(
          "space-y-8 [&_:is(input,select,textarea,button)]:scroll-mb-24",
          fill && "scrollbar-slim lg:h-full lg:overflow-y-auto lg:pr-2",
        )}
      >
        {!invoiceId && profiles.length > 1 && (
          <SelectField
            label="Profile"
            value={profileId}
            onChange={pickProfile}
            options={profiles.map((p) => ({ value: p.id, label: `${p.icon ? `${p.icon} ` : ""}${p.name}` }))}
            hint={`Who can see this ${labels.noun} follows the profile.`}
          />
        )}

        <Section
          title={`${labels.title} details`}
          summary={[dates.issue ? formatDate(dates.issue, locale, "medium") : null, currency].filter(Boolean).join(" · ")}
        >
          {kind === "quote" && (
            <Segmented
              label="Document title"
              value={doc.quoteTitle}
              onChange={(v) => update({ quoteTitle: v === "estimate" ? "estimate" : "quotation" })}
              options={[
                { value: "quotation", label: "Quotation" },
                { value: "estimate", label: "Estimate" },
              ]}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-sm font-medium">Number</Label>
              <p className="flex h-11 items-center rounded-xl border border-dashed px-3 text-sm text-muted-foreground">
                {doc.number || `Given when you finalise`}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-sm font-medium">Currency</Label>
              <CurrencyCombobox value={currency} onValueChange={setCurrency} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label={labels.issue} value={dates.issue ?? ""} onChange={(v) => update({ issueDate: v })} />
            <DateField
              label={labels.due}
              value={dates.due ?? ""}
              min={dates.issue ?? undefined}
              error={dueError}
              open={dueOpen}
              onOpenChange={setDueOpen}
              onChange={(v) => update({ dueDate: v, dueDays: null })}
            />
          </div>
          <ChoiceChips
            label={labels.termsPicker}
            value={doc.dueDays === null ? CUSTOM_TERMS : String(doc.dueDays)}
            onChange={(v) => {
              if (v === CUSTOM_TERMS) {
                update({ dueDays: null, dueDate: dates.due ?? "" });
                setDueOpen(true);
              } else {
                update({ dueDays: Number(v), dueDate: "" });
              }
            }}
            options={labels.termOptions}
          />
          <ChoiceChips
            label="Template"
            value={template}
            onChange={(v) => setTemplate(templates.find((t) => t.id === v)?.id ?? "classic")}
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Section>

        <Section
          title="Your details"
          summary={doc.from.name.trim() || "Not filled in yet"}
          aside={
            <Link href="/app/invoices/details" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
              {profileSellers.length > 0 ? "Edit saved details" : "Save them for next time"}
            </Link>
          }
        >
          {profileSellers.length > 0 && (
            <SelectField
              label="Saved details"
              value={sellerId ?? TYPED_SELLER}
              onChange={pickSeller}
              options={[
                ...profileSellers.map((s) => ({ value: s.id, label: s.name })),
                { value: TYPED_SELLER, label: "Type them for this one only" },
              ]}
              hint={sellerId ? (doc.logo ? "Its logo goes on the document." : "No logo saved with these details.") : undefined}
            />
          )}
          <TextField
            label="Business or your name"
            value={doc.from.name}
            maxLength={DOC_FIELD_LIMITS.name}
            onChange={(v) => setFrom({ name: v })}
          />
          <TextAreaField
            label="Address"
            value={doc.from.address}
            maxLength={DOC_FIELD_LIMITS.address}
            onChange={(v) => setFrom({ address: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <EmailField
              label="Email (optional)"
              value={doc.from.contact}
              maxLength={DOC_FIELD_LIMITS.contact}
              onChange={(v) => setFrom({ contact: v })}
            />
            <PhoneField
              label="Phone (optional)"
              value={doc.from.phone ?? ""}
              maxLength={DOC_FIELD_LIMITS.phone}
              onChange={(v) => setFrom({ phone: v })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Tax ID (optional)"
              placeholder="VAT, GST or EIN number"
              value={doc.from.taxId}
              maxLength={DOC_FIELD_LIMITS.taxId}
              onChange={(v) => setFrom({ taxId: v })}
            />
            <TextField
              label="Registration no. (optional)"
              placeholder="CIN, CRN or ABN"
              value={doc.from.registrationNumber ?? ""}
              maxLength={DOC_FIELD_LIMITS.registration}
              onChange={(v) => setFrom({ registrationNumber: v })}
            />
          </div>
          <TextField
            label="Website (optional)"
            placeholder="yourstudio.com"
            value={doc.from.website ?? ""}
            maxLength={DOC_FIELD_LIMITS.website}
            onChange={(v) => setFrom({ website: v })}
          />
          {kind === "invoice" && (
            <TextField
              label="UPI ID (optional)"
              placeholder="name@bank"
              value={upiId}
              maxLength={UPI_ID_MAX}
              onChange={setUpiId}
              error={upiError}
              hint={
                currency === "INR"
                  ? "A pay-by-UPI QR code for the total goes on the invoice."
                  : "A pay-by-UPI QR code goes on rupee invoices."
              }
            />
          )}
          {kind === "invoice" && (
            <TextAreaField
              label="Bank details (optional)"
              placeholder="Account name, account number, bank, IFSC / SWIFT / IBAN"
              value={doc.from.bankDetails ?? ""}
              maxLength={DOC_FIELD_LIMITS.bankDetails}
              onChange={(v) => setFrom({ bankDetails: v })}
            />
          )}
        </Section>

        <Section
          title={labels.to}
          summary={doc.to.name.trim() || "Not filled in yet"}
          aside={
            !clientId && doc.to.name.trim() ? (
              <Button type="button" variant="ghost" size="sm" onClick={saveClient} disabled={savingClient}>
                {savingClient ? <Loader2 className="animate-spin" /> : <UserPlus />} Save to clients
              </Button>
            ) : null
          }
        >
          {profileClients.length > 0 && (
            <SelectField
              label="Saved client"
              value={clientId ?? NEW_CLIENT}
              onChange={pickClient}
              options={[
                { value: NEW_CLIENT, label: "Someone new" },
                ...profileClients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Client name"
              value={doc.to.name}
              maxLength={DOC_FIELD_LIMITS.name}
              onChange={(v) => setTo({ name: v })}
            />
            <TextField
              label="Contact person (optional)"
              hint="Printed as “Attn:”"
              value={doc.to.contactPerson ?? ""}
              maxLength={DOC_FIELD_LIMITS.contactPerson}
              onChange={(v) => setTo({ contactPerson: v })}
            />
          </div>
          <TextAreaField
            label="Client address"
            value={doc.to.address}
            maxLength={DOC_FIELD_LIMITS.address}
            onChange={(v) => setTo({ address: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <EmailField
              label="Client email (optional)"
              value={doc.to.email}
              maxLength={DOC_FIELD_LIMITS.email}
              onChange={(v) => setTo({ email: v })}
            />
            <PhoneField
              label="Client phone (optional)"
              value={doc.to.phone ?? ""}
              maxLength={DOC_FIELD_LIMITS.phone}
              onChange={(v) => setTo({ phone: v })}
            />
          </div>
          <TextField
            label="Client tax ID (optional)"
            value={doc.to.taxId ?? ""}
            maxLength={DOC_FIELD_LIMITS.taxId}
            onChange={(v) => setTo({ taxId: v })}
          />
        </Section>

        <Section
          title="Items"
          summary={`${filledLines === 1 ? "1 line" : `${filledLines} lines`} · ${summary}`}
        >
          <LineItems
            items={doc.items}
            results={evaluation.items}
            onChange={(items) => update({ items })}
            money={money}
            symbol={symbol}
          />
        </Section>

        <Section
          title="Discount and tax"
          summary={
            [
              doc.discount.trim() && doc.discount.trim() !== "0"
                ? `${doc.discount.trim()}${doc.discountType === "percent" ? "%" : ` ${symbol}`} off`
                : null,
              doc.taxRate.trim() && doc.taxRate.trim() !== "0" ? `${doc.taxLabel.trim() || "Tax"} ${doc.taxRate.trim()}%` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "None"
          }
        >
          <div className="grid grid-cols-2 items-start gap-3">
            <NumberField
              label="Discount"
              value={doc.discount}
              placeholder="0"
              prefix={doc.discountType === "fixed" ? symbol : undefined}
              suffix={doc.discountType === "percent" ? "%" : undefined}
              error={evaluation.discountError}
              onChange={(v) => update({ discount: v })}
            />
            <Segmented
              label="Discount as"
              value={doc.discountType}
              onChange={(v) => update({ discountType: v === "fixed" ? "fixed" : "percent" })}
              options={[
                { value: "percent", label: "%" },
                { value: "fixed", label: symbol },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 items-start gap-3">
            <TextField
              label="Tax name"
              placeholder="VAT, GST, Tax"
              value={doc.taxLabel}
              maxLength={DOC_FIELD_LIMITS.taxLabel}
              onChange={(v) => update({ taxLabel: v })}
            />
            <NumberField
              label="Tax rate"
              value={doc.taxRate}
              placeholder="0"
              suffix="%"
              error={evaluation.taxError}
              onChange={(v) => update({ taxRate: v })}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tax is charged on the subtotal after the discount.
          </p>
        </Section>

        <Section
          title={kind === "invoice" ? "Notes" : "Notes and terms"}
          summary={doc.notes.trim() ? doc.notes.trim().split("\n")[0] : "None"}
        >
          <TextAreaField
            label={labels.notes}
            placeholder={labels.notesPlaceholder}
            value={doc.notes}
            maxLength={DOC_FIELD_LIMITS.notes}
            onChange={(v) => update({ notes: v })}
          />
          {kind === "quote" && (
            <TextAreaField
              label="Terms"
              placeholder="e.g. 50% deposit to start; balance on completion."
              value={doc.terms}
              maxLength={DOC_FIELD_LIMITS.terms}
              onChange={(v) => update({ terms: v })}
            />
          )}
          {footer && (
            <p className="text-xs text-muted-foreground">
              &lsquo;Made with SpendChat&rsquo; appears at the foot of the document.
            </p>
          )}
        </Section>

        <div className="sticky bottom-20 z-20 flex items-center gap-2 rounded-2xl border bg-background/90 p-1.5 shadow-lg backdrop-blur-md md:bottom-3">
          <Button type="button" onClick={save} disabled={saving} className="h-9 rounded-lg px-3">
            {saving ? <Loader2 className="animate-spin" /> : <Save />} {finalised ? "Save changes" : "Save draft"}
          </Button>
          <Button type="button" variant="ghost" className="h-9 rounded-lg" asChild>
            <Link href={invoiceId ? `/app/invoices/${invoiceId}` : "/app/invoices"}>Cancel</Link>
          </Button>
          <span className="ml-auto pr-2 text-sm text-muted-foreground tabular-nums">Total {summary}</span>
        </div>
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-col gap-2",
          fill ? "lg:h-full" : "@4xl:sticky @4xl:top-6 @4xl:h-[calc(100svh-3rem)]",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-muted/50 p-2 sm:p-3">
          <FitPaper>
            <DocPaper
              doc={doc}
              labels={labels}
              evaluation={evaluation}
              dates={dates}
              currency={currency}
              locale={locale}
              printable={false}
              theme={docTheme(template)}
              payment={payment}
              creditHref="/"
            />
          </FitPaper>
        </div>
      </div>
    </div>
    </div>
  );
}

/** Said above the editor when a finalised document is open in it. */
export function FinalisedEditNote({ kind, number }: { kind: InvoiceKind; number: string }) {
  return (
    <p role="note" className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      This {kind} is finalised. Saving keeps {number}, redraws its PDF and records today as the date it was edited —
      if it&apos;s already gone out, let your client know it changed.
    </p>
  );
}

/**
 * One part of the form, foldable from its heading. Folded, the heading carries
 * a one-line `summary` of what's inside; the fields stay mounted (only
 * hidden), so nothing typed is lost and the paper beside keeps showing them.
 */
function Section({
  title,
  aside,
  summary,
  children,
}: {
  title: string;
  aside?: ReactNode;
  /** What the section holds, shown while it's folded. */
  summary?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="group flex w-full min-w-0 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground",
                !open && "-rotate-90",
              )}
            />
            <span className="shrink-0">{title}</span>
            {!open && summary ? (
              <span className="truncate text-sm font-normal text-muted-foreground">· {summary}</span>
            ) : null}
          </button>
        </h2>
        {open ? aside : null}
      </div>
      <div id={bodyId} hidden={!open} className="space-y-4">
        {children}
      </div>
    </section>
  );
}
