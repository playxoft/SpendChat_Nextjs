import { withNext } from "@/lib/next-path";
import type { InvoiceKind } from "@/lib/invoices";

/**
 * The hand-off from the free invoice and quotation generators
 * (`/tools/invoice-generator`, `/tools/quotation-generator`) to the app's
 * invoices: the draft stays in the browser (the generator's `draft-store`),
 * the visitor signs up (or in), and `/app/invoices/import` brings it in as a
 * draft invoice or quote. Pure and client-safe.
 */

/** Where the app reads a generator draft back. */
export function invoiceImportPath(kind: InvoiceKind): string {
  return `/app/invoices/import?kind=${kind}`;
}

/** "Save to SpendChat": sign up (a signed-in visitor goes straight on) and come back to the import. */
export function invoiceSaveHref(kind: InvoiceKind): string {
  return withNext("/sign-up", invoiceImportPath(kind));
}
