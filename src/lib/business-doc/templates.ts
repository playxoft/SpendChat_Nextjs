import { DEFAULT_INVOICE_TEMPLATE, isInvoiceTemplateId, type InvoiceTemplateId } from "@/lib/invoices";

/**
 * How each invoice template looks — read by both renderers, the on-screen
 * paper (`components/business-doc/doc-paper.tsx`) and the PDF
 * (`invoice-pdf.ts`), so the file always matches the preview. Which templates
 * a workspace may pick is `templatesFor` in `lib/invoices.ts`.
 *
 * Every template stays a plain document — black text on white, one accent
 * colour at most — because it's the client's copy, printed in black and white
 * as often as not.
 */
export type DocTheme = {
  id: InvoiceTemplateId;
  /** The title, and the table header's rule (or band), as `#rrggbb`. */
  accent: string;
  /** The column headings sit on a solid band of the accent, in white. */
  headerBand: boolean;
  /** A thin rule between item rows. */
  rowRules: boolean;
  /** Smaller type and tighter rows, for long item lists. */
  compact: boolean;
};

export const DOC_THEMES: Record<InvoiceTemplateId, DocTheme> = {
  classic: { id: "classic", accent: "#171717", headerBand: false, rowRules: true, compact: false },
  modern: { id: "modern", accent: "#1d4ed8", headerBand: false, rowRules: true, compact: false },
  bold: { id: "bold", accent: "#171717", headerBand: true, rowRules: true, compact: false },
  minimal: { id: "minimal", accent: "#525252", headerBand: false, rowRules: false, compact: false },
  compact: { id: "compact", accent: "#171717", headerBand: false, rowRules: true, compact: true },
};

/** The theme for a stored template id — the default for anything unknown. */
export function docTheme(template: string | null | undefined): DocTheme {
  return DOC_THEMES[isInvoiceTemplateId(template) ? template : DEFAULT_INVOICE_TEMPLATE];
}

/** `#rrggbb` → 0–1 channels, for pdf-lib's `rgb()`. */
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.09, 0.09, 0.09];
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255];
}
