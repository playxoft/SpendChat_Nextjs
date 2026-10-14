"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, UserPlus } from "lucide-react";
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
import { docToInvoiceInput, sellerLogoUrl } from "@/lib/invoice-doc";
import type { InvoiceClientDTO, InvoiceSellerDTO } from "@/lib/invoice-queries";
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
  invoiceId,
  kind,
  initialDoc,
  initial,
  profiles,
  clients,
  sellers,
  locale,
  today,
  footer,
}: {
  invoiceId: string | null;
  kind: InvoiceKind;
  initialDoc: BusinessDoc;
  initial: {
    profileId: string;
    clientId: string | null;
    sellerId: string | null;
    upiId: string;
    template: InvoiceTemplateId;
    currency: string;
  };
  /** Profiles the person can add invoices to (only offered for a new one). */
  profiles: { id: string; name: string; icon: string | null }[];
  clients: InvoiceClientDTO[];
  sellers: InvoiceSellerDTO[];
  locale: string;
  today: string;
  /** "Made with SpendChat" goes on this workspace's documents. */
  footer: boolean;
}) {
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
      setFrom({ name: seller.name, address: seller.address ?? "", contact: seller.contact ?? "", taxId: seller.taxId ?? "" });
      setUpiId(seller.upiId ?? "");
      update({ logo: sellerLogoUrl(seller) });
    } else {
      update({ logo: null });
    }
  };

  const pickClient = (id: string) => {
    const client = profileClients.find((c) => c.id === id);
    setClientId(client?.id ?? null);
    if (client) {
      setTo({ name: client.name, address: client.address ?? "", email: client.email ?? "", taxId: client.taxId ?? "" });
    }
  };

  const pickProfile = (id: string) => {
    setProfileId(id);
    // Saved clients and details belong to a profile — the picks don't carry over.
    if (clientId && !clientList.some((c) => c.id === clientId && c.profileId === id)) setClientId(null);
    const sellerHere = sellers.find((s) => s.profileId === id);
    if (sellerId && !sellers.some((s) => s.id === sellerId && s.profileId === id)) {
      setSellerId(null);
      update({ logo: null });
    }
    if (!sellerId && sellerHere && !doc.from.name.trim()) pickSellerFrom(sellerHere);
  };
  const pickSellerFrom = (seller: InvoiceSellerDTO) => {
    setSellerId(seller.id);
    setFrom({ name: seller.name, address: seller.address ?? "", contact: seller.contact ?? "", taxId: seller.taxId ?? "" });
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
      toast.success(invoiceId ? "Draft saved." : `Draft ${labels.noun} saved.`);
      router.push(`/app/invoices/${res.id}`);
      router.refresh();
    });
  };

  const dueError = dueBeforeIssue(dates.issue, dates.due) ? `This is before the ${labels.issue.toLowerCase()}.` : null;
  const summary = evaluation.totals ? money(evaluation.totals.total) : "—";
  const templates = templatesFor("free");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="space-y-8 [&_:is(input,select,textarea,button)]:scroll-mb-24">
        {!invoiceId && profiles.length > 1 && (
          <SelectField
            label="Profile"
            value={profileId}
            onChange={pickProfile}
            options={profiles.map((p) => ({ value: p.id, label: `${p.icon ? `${p.icon} ` : ""}${p.name}` }))}
            hint={`Who can see this ${labels.noun} follows the profile.`}
          />
        )}

        <Section title={`${labels.title} details`}>
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
            <TextField
              label="Email or phone"
              value={doc.from.contact}
              maxLength={DOC_FIELD_LIMITS.contact}
              onChange={(v) => setFrom({ contact: v })}
            />
            <TextField
              label="Tax ID (optional)"
              placeholder="VAT, GST or EIN number"
              value={doc.from.taxId}
              maxLength={DOC_FIELD_LIMITS.taxId}
              onChange={(v) => setFrom({ taxId: v })}
            />
          </div>
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
        </Section>

        <Section
          title={labels.to}
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
          <TextField
            label="Client name"
            value={doc.to.name}
            maxLength={DOC_FIELD_LIMITS.name}
            onChange={(v) => setTo({ name: v })}
          />
          <TextAreaField
            label="Client address"
            value={doc.to.address}
            maxLength={DOC_FIELD_LIMITS.address}
            onChange={(v) => setTo({ address: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Client email (optional)"
              value={doc.to.email}
              maxLength={DOC_FIELD_LIMITS.email}
              onChange={(v) => setTo({ email: v })}
            />
            <TextField
              label="Client tax ID (optional)"
              value={doc.to.taxId ?? ""}
              maxLength={DOC_FIELD_LIMITS.taxId}
              onChange={(v) => setTo({ taxId: v })}
            />
          </div>
        </Section>

        <Section title="Items">
          <LineItems
            items={doc.items}
            results={evaluation.items}
            onChange={(items) => update({ items })}
            money={money}
            symbol={symbol}
          />
        </Section>

        <Section title="Discount and tax">
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

        <Section title={kind === "invoice" ? "Notes" : "Notes and terms"}>
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
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save draft
          </Button>
          <Button type="button" variant="ghost" className="h-9 rounded-lg" asChild>
            <Link href={invoiceId ? `/app/invoices/${invoiceId}` : "/app/invoices"}>Cancel</Link>
          </Button>
          <span className="ml-auto pr-2 text-sm text-muted-foreground tabular-nums">Total {summary}</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]">
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
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className={cn("flex items-center justify-between gap-3")}>
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
