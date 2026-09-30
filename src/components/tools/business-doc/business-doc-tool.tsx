"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, Expand, FilePlus2, ImagePlus, Printer, RotateCcw, Share2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ChoiceChips,
  CurrencyField,
  DateField,
  Field,
  NumberField,
  Segmented,
  TextField,
} from "@/components/tools/fields";
import { ResultRows, ToolPanel, type ResultRow } from "@/components/tools/result";
import { getToolCurrency, setToolCurrency, useToolCurrency, useToolLocale } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { regionFromLocale } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { toolPath } from "@/lib/tools";
import { findTaxRate } from "@/lib/tools/data/tax-rates";
import { currencySymbol, formatNumber } from "@/lib/tools/format";
import { MAX_SHARE_TOKEN, SHARE_PARAM, decodeShareToken, encodeShareToken, shareTokenFromHash } from "@/lib/tools/share-link";
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
import { FitPaper } from "./fit-paper";
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
  @page { margin: 14mm; }
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
/**
 * Swap in a whole document (and, from a file or link, its currency), with an
 * Undo that puts both back. Always offered: "is there anything worth undoing"
 * is harder to judge than it looks (seller details, logo and bank notes all
 * live in the draft), and one stray click shouldn't cost them.
 */
function swapDoc(
  kind: DocKind,
  next: BusinessDoc,
  message: string,
  { currency, description }: { currency?: string | null; description?: string } = {},
) {
  const previous = getDraft(kind);
  const previousCurrency = getToolCurrency();
  if (currency) setToolCurrency(currency);
  setDraft(kind, next, { immediate: true });
  toast.success(message, {
    description,
    action: {
      label: "Undo",
      onClick: () => {
        setDraft(kind, previous, { immediate: true });
        setToolCurrency(previousCurrency);
      },
    },
  });
}

export function BusinessDocTool({ kind }: { kind: DocKind }) {
  const doc = useDraft(kind);
  const today = useToday();
  const locale = useToolLocale();
  const [currency] = useToolCurrency();
  const region = useRegion();
  const router = useRouter();
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [dueOpen, setDueOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  // A share link (`#share=…`) opens as the visitor's own copy, with an Undo —
  // on load, and when one is pasted over this page (a fragment-only
  // navigation, which doesn't remount anything).
  useEffect(() => {
    const openShared = () => {
      const token = shareTokenFromHash(window.location.hash);
      if (!token) return;
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      void decodeShareToken(token).then((text) => {
        const parsed = text ? parseDocFile(text, kind, navigator.language || "en-US") : null;
        if (!parsed) {
          toast.error("That share link is incomplete or damaged — ask for it to be sent again.");
          return;
        }
        swapDoc(kind, parsed.doc, `Opened the shared ${docLabels(kind, parsed.doc.quoteTitle).noun} ${parsed.doc.number}.`, {
          currency: parsed.currency,
          description: "It's your copy now — edits stay in this browser.",
        });
      });
    };
    openShared();
    window.addEventListener("hashchange", openShared);
    return () => window.removeEventListener("hashchange", openShared);
  }, [kind]);

  // The draft remembers its currency: another tool changing the site-wide
  // currency (picking a country on the VAT calculator, say) must not turn a
  // saved ₹ invoice into £. On arrival the draft's currency wins; after that,
  // changing the currency here is saved into the draft.
  const currencyRestored = useRef(false);
  useEffect(() => {
    const draft = getDraft(kind);
    const live = getToolCurrency();
    if (!currencyRestored.current) {
      currencyRestored.current = true;
      if (draft.currency && draft.currency !== live) {
        setToolCurrency(draft.currency);
        return;
      }
    }
    if (draft.currency !== live) setDraft(kind, { ...draft, currency: live });
  }, [kind, currency]);

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
    swapDoc(kind, next, `Started ${labels.noun} ${next.number}. Your details are kept.`);
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
      action: { label: "Undo", onClick: () => setDraft("invoice", existing, { immediate: true }) },
    });
  };

  const exportJson = () => {
    const current = getDraft(kind);
    const url = URL.createObjectURL(new Blob([exportDoc(current, currency, locale)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = docFileName(current);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * Share as a link: the document rides in the URL's `#fragment`, which the
   * browser never sends to a server. The logo stays behind — it would make the
   * link too long for most chat apps.
   */
  const share = async () => {
    const current = { ...getDraft(kind), logo: null };
    let token: string;
    try {
      token = await encodeShareToken(exportDoc(current, currency, locale));
    } catch {
      toast.error("This browser can't make share links — use Download to send a copy instead.");
      return;
    }
    if (token.length > MAX_SHARE_TOKEN) {
      toast.error(`This ${labels.noun} is too long to fit in a link — use Download to send a copy instead.`);
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}#${SHARE_PARAM}=${token}`;
    const title = `${labels.title} ${current.number}`.trim();
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", {
        description: `Whoever opens it gets their own copy of this ${labels.noun} to view, edit or print (your logo isn't included).`,
      });
    } catch {
      toast.error("Couldn't copy the link — your browser blocked clipboard access.");
    }
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DOC_FILE_CHARS * 2) {
      toast.error("That file is too big to be an exported invoice or quotation.");
      return;
    }
    let parsed: ReturnType<typeof parseDocFile> = null;
    try {
      parsed = parseDocFile(await file.text(), kind, locale);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      toast.error("That file isn't an invoice or quotation exported from SpendChat's generator.");
      return;
    }
    swapDoc(kind, parsed.doc, `Opened ${parsed.doc.number || labels.noun}.`, { currency: parsed.currency });
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

        {/* ---------------- Document ----------------
            Desktop: pinned beside the editor at exactly the screen's height,
            with the sheet scaled to fit — the whole document stays in view
            while the form scrolls. */}
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 lg:sticky lg:top-20 lg:h-[calc(100svh-5.75rem)]",
            view === "edit" && "max-lg:hidden",
          )}
        >
          {/* One thin row, whatever the width: labels fold down to icons before
              anything wraps. The icon-only buttons carry their name in
              `aria-label` and a tooltip. */}
          <div className="flex h-9 shrink-0 flex-nowrap items-center gap-1 overflow-x-auto">
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2"
              onClick={print}
              title="Pick “Save as PDF” as the printer, and turn off “Headers and footers” for a clean page."
            >
              <Printer /> <span className="max-sm:sr-only">Print / PDF</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2"
              onClick={() => setFullScreen(true)}
              title="See the whole page full screen"
            >
              <Expand /> <span className="max-sm:sr-only">Preview</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2"
              onClick={startNew}
              title={labels.newDoc}
              aria-label={labels.newDoc}
            >
              <FilePlus2 /> <span className="max-sm:sr-only">New</span>
            </Button>
            {kind === "quotation" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-lg px-2"
                onClick={convertToInvoice}
                title="Turn this quotation into an invoice"
              >
                <ArrowRight /> <span className="max-sm:sr-only">Invoice</span>
              </Button>
            )}
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
            <IconAction label="Download a copy (.json) you can open again later" onClick={exportJson}>
              <Download />
            </IconAction>
            <IconAction label="Open a downloaded copy" onClick={() => importInput.current?.click()}>
              <Upload />
            </IconAction>
            <IconAction label={`Share this ${labels.noun} as a link`} onClick={() => void share()}>
              <Share2 />
            </IconAction>
            <IconAction label="Reset — clear everything" onClick={clearAll}>
              <RotateCcw />
            </IconAction>
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

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-muted/50 p-2 sm:p-3">
            <FitPaper>
              <DocPaper
                doc={doc}
                labels={labels}
                evaluation={evaluation}
                dates={dates}
                currency={currency}
                locale={locale}
              />
            </FitPaper>
          </div>

          {/* Full screen: the same document at a readable size, with the few
              things you'd do from a finished page. Not printable itself — the
              print stylesheet prints the copy above. */}
          <Dialog open={fullScreen} onOpenChange={setFullScreen}>
            <DialogContent
              showCloseButton={false}
              aria-describedby={undefined}
              // Session-replay tools must not record the document's contents.
              data-clarity-mask="true"
              className="top-0 left-0 flex h-svh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 ring-0 sm:max-w-none"
            >
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
                <DialogTitle className="min-w-0 truncate text-sm font-semibold">
                  {`${labels.title} ${doc.number}`.trim()}
                </DialogTitle>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button type="button" size="sm" className="h-8 rounded-lg" onClick={print}>
                    <Printer /> <span className="max-sm:sr-only">Print / PDF</span>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={exportJson}>
                    <Download /> <span className="max-sm:sr-only">Download</span>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => void share()}>
                    <Share2 /> <span className="max-sm:sr-only">Share</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-1 size-9 rounded-lg"
                    onClick={() => setFullScreen(false)}
                    aria-label="Close preview"
                    title="Close (Esc)"
                  >
                    <X className="size-5" />
                  </Button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-auto bg-muted/50 px-3 py-6 sm:px-8 sm:py-10">
                <div className="@container mx-auto w-full max-w-[860px]">
                  <DocPaper
                    doc={doc}
                    labels={labels}
                    evaluation={evaluation}
                    dates={dates}
                    currency={currency}
                    locale={locale}
                    printable={false}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

/** A toolbar button that is only an icon; its name lives in `aria-label` and the tooltip. */
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
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
