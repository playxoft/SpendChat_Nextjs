import "server-only";
import type { PdfLogo } from "@/lib/business-doc/invoice-pdf";
import { invoiceDocView, type InvoiceDTO } from "@/lib/invoice-doc";
import { loadPdfFonts } from "@/lib/pdf-fonts.server";

/**
 * An invoice or quote as a PDF, drawn on the server with the free generator's
 * renderer (`lib/business-doc/invoice-pdf.ts`) and fonts, so the stored copy,
 * the download and the generator's file look alike.
 *
 * The font covers Latin, Greek, Cyrillic and the currency signs. A character
 * outside it (Devanagari, Arabic, CJK…) is drawn as "?" rather than as an
 * empty box — in the browser, Print covers those (its fonts are the device's).
 * pdf-lib loads only when a PDF is drawn.
 */
export async function renderInvoicePdf(
  invoice: InvoiceDTO,
  { locale, logo = null }: { locale: string; logo?: PdfLogo | null },
): Promise<Uint8Array> {
  const [pdf, fonts] = await Promise.all([import("@/lib/business-doc/invoice-pdf"), loadPdfFonts()]);
  const view = invoiceDocView(invoice, locale);
  const missing = new Set(pdf.unsupportedCharacters(view, fonts.regular));
  const drawable =
    missing.size === 0
      ? view
      : pdf.mapViewText(view, (text) => [...text.normalize("NFC")].map((ch) => (missing.has(ch) ? "?" : ch)).join(""));
  return pdf.renderDocPdf(drawable, fonts, logo);
}
