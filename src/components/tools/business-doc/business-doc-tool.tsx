"use client";

import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, FilePlus2, ImagePlus, Printer, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ChoiceChips,
  CurrencyField,
  DateField,
  Field,
  NumberField,
  Segmented,
  TextField,
} from "@/components/tools/fields";
import { ResultRows, ToolCta, ToolPanel, type ResultRow } from "@/components/tools/result";
import { useToolCurrency, useToolLocale } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { regionFromLocale } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { toolPath } from "@/lib/tools";
import { findTaxRate } from "@/lib/tools/data/tax-rates";
import { currencySymbol, formatNumber } from "@/lib/tools/format";
import {
  DEFAULT_DUE_DAYS,
  LIMITS,
  MAX_DOC_FILE_CHARS,
  MAX_LOGO_BYTES,
  docFileName,
  dueBeforeIssue,
  evaluateDoc,
  exportDoc,
  hasContent,
  isValidLogo,
  nextDocNumber,
  parseDocFile,
  quotationToInvoice,
  resolveDocDates,
  startNextDoc,
  type BusinessDoc,
  type Buyer,
  type DocKind,
  type Seller,
} from "@/lib/tools/invoice";
import { cn } from "@/lib/utils";
import { clearDraft, getDraft, setDraft, useDraft } from "./draft-store";
import { DocPaper } from "./doc-paper";
import { CUSTOM_TERMS, docLabels } from "./labels";
import { LineItems } from "./line-items";

/**
 * Print only the document. Everything else on the page is hidden twice over:
 * `visibility: hidden` (so nothing else can show through), and `display: none`
 * on every element that neither is the paper nor contains it — otherwise the
 * invisible nav, FAQ and footer would still take up room and print as blank
 * pages after the invoice. The paper's ancestors lose their padding and
 * borders so the document starts at the page's top-left margin, and the paper
 * drops its on-screen A4 aspect ratio to paginate naturally at 10pt.
 * Browsers without `:has()` fall back to lifting the paper to the top-left.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .bd-paper, .bd-paper * { visibility: visible !important; }
  .bd-paper .bd-ph { visibility: hidden !important; }
  body *:not(:has(.bd-paper)):not(.bd-paper):not(.bd-paper *) { display: none !important; }
  body *:has(.bd-paper) {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    background: none !important;
    box-shadow: none !important;
    transform: none !important;
  }
  .bd-paper {
    display: block !important;
    position: static !important;
    width: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    aspect-ratio: auto !important;
    min-height: 0 !important;
    font-size: 10pt !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bd-paper tr, .bd-paper .bd-keep { break-inside: avoid; }
  .bd-paper a { color: inherit !important; text-decoration: none !important; }
}
@supports not selector(:has(*)) {
  @media print {
    .bd-paper { position: absolute !important; top: 0; left: 0; right: 0; }
  }
}
`;

const VIEW_OPTIONS = [
  { value: "edit", label: "Edit" },
  { value: "preview", label: "Preview" },
] as const;

const QUOTE_TITLE_OPTIONS = [
  { value: "quotation", label: "Quotation" },
  { value: "estimate", label: "Estimate" },
] as const;

const LOGO_TYPES = /^image\/(?:png|jpeg|gif|webp|svg\+xml)$/;

const noopSubscribe = () => () => {};

/** The visitor's country from their browser language — null on the server. */
function useRegion(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => regionFromLocale(navigator.language || ""),
    () => null,
  );
}

/**
 * The invoice and quotation generators: one editor, one document, two pages.
 *
 * Desktop shows the form and the document side by side; a phone shows one at
 * a time with an Edit / Preview switch pinned under the nav, because a
 * shrunken A4 page next to a form is unreadable at 360px. The preview is the
 * printed document — not a lookalike — so what you see is what the client
 * gets.
 */
export function BusinessDocTool({ kind }: { kind: DocKind }) {
  const doc = useDraft(kind);
  const today = useToday();
  const locale = useToolLocale();
  const [currency, setCurrency] = useToolCurrency();
  const region = useRegion();
  const router = useRouter();
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [dueOpen, setDueOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const labels = docLabels(kind, doc.quoteTitle);
  const evaluation = evaluateDoc(doc, currency, locale);
  const dates = resolveDocDates(doc, today);
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const symbol = currencySymbol(currency, locale);
  const { totals } = evaluation;

  const update = (patch: Partial<BusinessDoc>) => {
    const next = { ...getDraft(kind), ...patch };
    // The first edit pins today as the issue date, so a draft reopened next
    // week still carries the day it was written rather than drifting.
    if (!next.issueDate && patch.issueDate === undefined && today) next.issueDate = today;
    setDraft(kind, next);
  };
  const setFrom = (patch: Partial<Seller>) => update({ from: { ...getDraft(kind).from, ...patch } });
  const setTo = (patch: Partial<Buyer>) => update({ to: { ...getDraft(kind).to, ...patch } });

  /** Swap in a whole document, with an Undo on the toast. */
  const replaceWithUndo = (next: BusinessDoc, message: string) => {
    const previous = getDraft(kind);
    setDraft(kind, next, { immediate: true });
    toast.success(message, {
      action: { label: "Undo", onClick: () => setDraft(kind, previous, { immediate: true }) },
    });
  };

  const showView = (value: string) => {
    setView(value === "preview" ? "preview" : "edit");
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: "start" });
  };

  const print = () => {
    // The browser names the PDF after the page title: "Invoice INV-0007.pdf".
    const previous = document.title;
    document.title = `${labels.title} ${doc.number}`.trim();
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previous;
      },
      { once: true },
    );
    window.print();
  };

  const startNew = () => {
    const next = startNextDoc(getDraft(kind));
    replaceWithUndo(next, `Started ${labels.noun} ${next.number}. Your details are kept.`);
    setView("edit");
  };

  const clearAll = () => {
    const previous = getDraft(kind);
    clearDraft(kind);
    toast.success(`Cleared the ${labels.noun} and your saved details.`, {
      action: { label: "Undo", onClick: () => setDraft(kind, previous, { immediate: true }) },
    });
  };

  const convertToInvoice = () => {
    const quote = getDraft("quotation");
    const existing = getDraft("invoice");
    const replacing = hasContent(existing);
    // The invoice you were writing already used its number; the quote gets the next one.
    const number = replacing ? nextDocNumber(existing.number, "invoice") : existing.number;
    const invoice = quotationToInvoice(quote, number, existing.dueDays ?? DEFAULT_DUE_DAYS.invoice);
    setDraft("invoice", invoice, { immediate: true });
    router.push(toolPath("invoice-generator"));
    toast.success(`${labels.title} ${quote.number} is now invoice ${number}.`, {
      description: replacing ? `It replaced the invoice draft you had open (${existing.number}).` : undefined,
      action: replacing
        ? { label: "Undo", onClick: () => setDraft("invoice", existing, { immediate: true }) }
        : undefined,
    });
  };

  const exportJson = () => {
    const current = getDraft(kind);
    const url = URL.createObjectURL(new Blob([exportDoc(current, currency)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = docFileName(current);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DOC_FILE_CHARS * 2) {
      toast.error("That file is too big to be an exported invoice or quotation.");
      return;
    }
    let parsed: ReturnType<typeof parseDocFile> = null;
    try {
      parsed = parseDocFile(await file.text(), kind);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      toast.error("That file isn't an invoice or quotation exported from SpendChat's generator.");
      return;
    }
    if (parsed.currency) setCurrency(parsed.currency);
    replaceWithUndo(parsed.doc, `Opened ${parsed.doc.number || labels.noun}.`);
  };

  const readLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.test(file.type)) {
      toast.error("Choose a PNG, JPG, WebP, GIF or SVG image for your logo.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("That image is over 300 KB — try a smaller or compressed version.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (isValidLogo(reader.result)) update({ logo: reader.result });
      else toast.error("Couldn't read that image — try saving it as a PNG.");
    };
    reader.onerror = () => toast.error("Couldn't read that image — try saving it as a PNG.");
    reader.readAsDataURL(file);
  };

  const dueError = dueBeforeIssue(dates.issue, dates.due)
    ? `This is before the ${labels.issue.toLowerCase()}.`
    : null;

  const taxPreset = findTaxRate(region);
  const taxSuggestion =
    taxPreset && taxPreset.standard !== null && !doc.taxRate.trim()
      ? {
          name: taxPreset.taxName === "VAT" || taxPreset.taxName === "GST" || taxPreset.taxName === "SST"
            ? taxPreset.taxName
            : taxPreset.taxName.charAt(0).toUpperCase() + taxPreset.taxName.slice(1),
          rate: formatNumber(taxPreset.standard, locale, 4),
          country: taxPreset.name,
        }
      : null;

  const summaryRows: ResultRow[] = totals
    ? [
        { label: "Subtotal", value: money(totals.subtotal) },
        ...(totals.discount > 0 ? [{ label: "Discount", value: `−${money(totals.discount)}` }] : []),
        ...(evaluation.taxRate > 0
          ? [{ label: doc.taxLabel.trim() || "Tax", value: money(totals.tax) }]
          : []),
        { label: "Total", value: money(totals.total), strong: true },
      ]
    : [{ label: "Total", value: "Too large to total exactly" }];

  return (
    <div ref={rootRef} className="scroll-mt-24">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Phone: the document is one tap away, and printing is always in reach. */}
      <div className="sticky top-[4.75rem] z-30 -mx-4 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur-md sm:top-20 lg:hidden">
        <div className="flex items-center gap-2">
          <Segmented
            label="Show"
            hideLabel
            value={view}
            onChange={showView}
            options={VIEW_OPTIONS}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-xl"
            aria-label="Print or save as PDF"
            onClick={print}
          >
            <Printer />
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-6">
        {/* ---------------- Editor ---------------- */}
        <ToolPanel className={cn("space-y-8", view === "preview" && "max-lg:hidden")}>
          <EditorSection title={`${labels.title} details`}>
            {kind === "quotation" && (
              <Segmented
                label="Document title"
                value={doc.quoteTitle}
                onChange={(v) => update({ quoteTitle: v === "estimate" ? "estimate" : "quotation" })}
                options={QUOTE_TITLE_OPTIONS}
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={labels.numberLabel}
                value={doc.number}
                maxLength={LIMITS.number}
                onChange={(v) => update({ number: v })}
              />
              <CurrencyField />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField
                label={labels.issue}
                value={dates.issue ?? ""}
                onChange={(v) => update({ issueDate: v })}
              />
              <DateField
                label={labels.due}
                value={dates.due ?? ""}
                min={dates.issue ?? undefined}
                error={dueError}
                open={dueOpen}
                onOpenChange={setDueOpen}
                // A date picked by hand is "Custom" terms: it stays put when the
                // issue date moves, where Net 30 would follow it.
                onChange={(v) => update({ dueDate: v, dueDays: null })}
              />
            </div>
            <ChoiceChips
              label={labels.termsPicker}
              value={doc.dueDays === null ? CUSTOM_TERMS : String(doc.dueDays)}
              onChange={(v) => {
                if (v === CUSTOM_TERMS) {
                  // Keep the date on screen as the starting point, then open the calendar.
                  update({ dueDays: null, dueDate: dates.due ?? "" });
                  setDueOpen(true);
                } else {
                  update({ dueDays: Number(v), dueDate: "" });
                }
              }}
              options={labels.termOptions}
            />
          </EditorSection>

          <EditorSection title="Your details">
            <TextField
              label="Business or your name"
              value={doc.from.name}
              maxLength={LIMITS.name}
              onChange={(v) => setFrom({ name: v })}
            />
            <TextAreaField
              label="Address"
              value={doc.from.address}
              maxLength={LIMITS.address}
              onChange={(v) => setFrom({ address: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Email or phone"
                value={doc.from.contact}
                maxLength={LIMITS.contact}
                onChange={(v) => setFrom({ contact: v })}
              />
              <TextField
                label="Tax ID (optional)"
                placeholder="VAT, GST or EIN number"
                value={doc.from.taxId}
                maxLength={LIMITS.taxId}
                onChange={(v) => setFrom({ taxId: v })}
              />
            </div>

            <div>
              <p className="text-sm font-medium">Logo (optional)</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {doc.logo && (
                  // eslint-disable-next-line @next/next/no-img-element -- a local data URL; nothing to optimise
                  <img
                    src={doc.logo}
                    alt="Your logo"
                    className="h-11 max-w-32 rounded-lg border bg-white object-contain p-1"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => logoInput.current?.click()}
                >
                  <ImagePlus /> {doc.logo ? "Change logo" : "Add logo"}
                </Button>
                {doc.logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-xl text-muted-foreground"
                    onClick={() => update({ logo: null })}
                  >
                    <X /> Remove logo
                  </Button>
                )}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    readLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                PNG, JPG, WebP or SVG up to 300 KB. It stays in your browser — nothing is uploaded.
              </p>
            </div>
          </EditorSection>

          <EditorSection title={labels.to}>
            <TextField
              label="Client name"
              value={doc.to.name}
              maxLength={LIMITS.name}
              onChange={(v) => setTo({ name: v })}
            />
            <TextAreaField
              label="Client address"
              value={doc.to.address}
              maxLength={LIMITS.address}
              onChange={(v) => setTo({ address: v })}
            />
            <TextField
              label="Client email (optional)"
              value={doc.to.email}
              maxLength={LIMITS.email}
              onChange={(v) => setTo({ email: v })}
            />
          </EditorSection>

          <EditorSection title="Items">
            <LineItems
              items={doc.items}
              results={evaluation.items}
              onChange={(items) => update({ items })}
              money={money}
              symbol={symbol}
            />
          </EditorSection>

          <EditorSection title="Discount and tax">
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
                maxLength={LIMITS.taxLabel}
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
            {taxSuggestion && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() =>
                  update({
                    taxLabel: getDraft(kind).taxLabel.trim() || taxSuggestion.name,
                    taxRate: taxSuggestion.rate,
                  })
                }
              >
                Use {taxSuggestion.name} {taxSuggestion.rate}% ({taxSuggestion.country} standard rate)
              </Button>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tax is charged on the subtotal after the discount. Leave the rate empty if you
              aren&apos;t registered to charge tax.
            </p>
            <div aria-live="polite">
              <ResultRows rows={summaryRows} />
            </div>
          </EditorSection>

          <EditorSection title={kind === "invoice" ? "Notes" : "Notes and terms"}>
            <TextAreaField
              label={labels.notes}
              placeholder={labels.notesPlaceholder}
              value={doc.notes}
              maxLength={LIMITS.notes}
              onChange={(v) => update({ notes: v })}
            />
            {kind === "quotation" && (
              <TextAreaField
                label="Terms"
                placeholder="e.g. 50% deposit to start; balance on completion. Prices valid until the date above."
                value={doc.terms}
                maxLength={LIMITS.terms}
                onChange={(v) => update({ terms: v })}
              />
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={doc.credit}
                onChange={(e) => update({ credit: e.target.checked })}
                className="size-5 shrink-0 accent-primary"
              />
              <span>Show &lsquo;Made with SpendChat&rsquo; on the document</span>
            </label>
          </EditorSection>
        </ToolPanel>

        {/* ---------------- Document ---------------- */}
        <div
          className={cn(
            "min-w-0 space-y-4 lg:sticky lg:top-24 lg:-m-1 lg:max-h-[calc(100svh-7rem)] lg:overflow-y-auto lg:p-1",
            view === "edit" && "max-lg:hidden",
          )}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-10 rounded-lg" onClick={print}>
                <Printer /> Print / Save as PDF
              </Button>
              {kind === "quotation" && (
                <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={convertToInvoice}>
                  Convert to invoice <ArrowRight />
                </Button>
              )}
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={startNew}>
                <FilePlus2 /> {labels.newDoc}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="ghost" className="h-9 rounded-lg text-muted-foreground" onClick={exportJson}>
                <Download /> Export JSON
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-lg text-muted-foreground"
                onClick={() => importInput.current?.click()}
              >
                <Upload /> Import JSON
              </Button>
              <Button type="button" variant="ghost" className="h-9 rounded-lg text-muted-foreground" onClick={clearAll}>
                <RotateCcw /> Clear all
              </Button>
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  void importJson(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              To save a PDF, pick &ldquo;Save as PDF&rdquo; as the printer, and turn off
              &ldquo;Headers and footers&rdquo; for a clean page.
            </p>
          </div>

          <div className="@container rounded-2xl border bg-muted/50 p-3 sm:p-5">
            <DocPaper
              doc={doc}
              labels={labels}
              evaluation={evaluation}
              dates={dates}
              currency={currency}
              locale={locale}
            />
          </div>

          <ToolCta
            slug={labels.slug}
            message={
              kind === "invoice"
                ? "Track this income in SpendChat once it's paid."
                : "Won the job? Track the income in SpendChat when it's paid."
            }
          />
        </div>
      </div>
    </div>
  );
}

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A multi-line field with the same shape as the shared text fields. */
function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
}) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <textarea
        id={id}
        value={value}
        rows={3}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field-sizing-content min-h-24 w-full min-w-0 resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-base leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
      />
    </Field>
  );
}
