import Link from "next/link";
import { BusinessDocTool } from "@/components/tools/business-doc/business-doc-tool";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";

const SLUG = "invoice-generator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "Is this invoice generator free?",
    a: "Yes. There's no signup, no watermark and no limit on how many invoices you make. A small “Made with SpendChat” line sits at the foot of the page; untick it under Notes and it's gone.",
  },
  {
    q: "Can I add my logo?",
    a: "Yes. Add a PNG, JPG, WebP or SVG up to 300 KB under Your details. Your browser reads it and keeps it with your draft on this device — it's never uploaded.",
  },
  {
    q: "How do I save the invoice as a PDF?",
    a: "Press Download. You get a PDF file named after the invoice number, made in your browser — nothing is uploaded. To print on paper, use the printer icon; only the invoice prints, not the rest of this page.",
  },
  {
    q: "Is my data stored anywhere?",
    a: "Only in your browser. The draft is saved in this device's local storage so it's still there when you come back; nothing is sent to SpendChat. The Save copy (.json) icon keeps a file you can reopen on another device with Open, and Reset deletes the draft.",
  },
  {
    q: "Can I add GST or VAT?",
    a: "Yes. Type the tax name (GST, VAT, sales tax) and the rate. It's charged on the subtotal after any discount and shown on its own line, and your tax number goes under Your details. One rate applies to the whole invoice, which suits most small businesses.",
  },
  {
    q: "Which currencies can I invoice in?",
    a: "About 60, including USD, EUR, GBP, INR, AED, JPY and KWD. Amounts use each currency's own decimals — none for yen, three for Kuwaiti dinar — and the amount in words follows the currency, in lakh and crore for rupees.",
  },
];

export default function InvoiceGeneratorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Track this income in SpendChat once it's paid."
      faqs={faqs}
      category="BusinessApplication"
      intro={
        <p>
          Fill in the form and your invoice builds itself alongside it, ready to print or save as
          a PDF. No signup, and what you type stays in your browser.
        </p>
      }
      tool={<BusinessDocTool kind="invoice" />}
    >
      <ToolSection title="How to make an invoice">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Add your details once — name, address, contact, tax number and logo. They&apos;re
            saved in your browser for next time.
          </li>
          <li>Fill in who you&apos;re billing, then pick the payment terms (Net 30 means due 30 days after the issue date).</li>
          <li>
            List what you did or sold: a description, a quantity and a unit price per line. Press
            Enter in the price box to start the next line.
          </li>
          <li>Add a discount or tax if they apply, and your payment details in Notes.</li>
          <li>
            Press Download to get the PDF. For the next one, press New invoice — your details stay and
            INV-0007 becomes INV-0008.
          </li>
        </ol>
      </ToolSection>

      <ToolSection title="What to include on an invoice">
        <p>
          Rules differ from country to country, but almost everywhere a proper invoice shows:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>your name or business name and address, and the client&apos;s;</li>
          <li>a unique invoice number, in sequence, so each one can be traced;</li>
          <li>the issue date, and when payment is due;</li>
          <li>what was supplied — a description, quantity and price for each line;</li>
          <li>
            the tax rate and amount shown separately, with your tax registration number if
            you&apos;re registered for VAT, GST or sales tax;
          </li>
          <li>the total due and how to pay it.</li>
        </ul>
        <p>
          If you&apos;re registered for tax, your tax authority publishes exactly what a tax
          invoice must show — check it once, and this template will cover the rest.
        </p>
      </ToolSection>

      <ToolSection title="Invoice, quotation, proforma or receipt?">
        <p>
          A <strong className="font-medium text-foreground">quotation</strong> (or estimate) is a
          price offered before the work — make one with the{" "}
          <Link href={toolPath("quotation-generator")} className="font-medium text-foreground underline underline-offset-4">
            quotation generator
          </Link>{" "}
          and convert it here when it&apos;s accepted. An{" "}
          <strong className="font-medium text-foreground">invoice</strong> asks for payment for work
          done or goods delivered. A <strong className="font-medium text-foreground">proforma invoice</strong>{" "}
          is a preview of an invoice sent before delivery, often so the buyer can arrange payment
          or customs; it isn&apos;t a demand for payment. A{" "}
          <strong className="font-medium text-foreground">receipt</strong> confirms that payment
          was received, after the fact.
        </p>
      </ToolSection>

      <ToolSection title="How the totals are worked out">
        <p>
          Each line is quantity × unit price. The discount comes off the subtotal, tax is charged on
          what&apos;s left, and every step is rounded to the cent, so the lines add up exactly.
          Three items at 19.99 with a 10% discount and 18% tax:
        </p>
        <Formula>
          Line: 3 × 19.99 = 59.97
          <br />
          Discount: 10% × 59.97 = 6.00
          <br />
          Taxable: 59.97 − 6.00 = 53.97
          <br />
          Tax: 18% × 53.97 = 9.71
          <br />
          Total: 53.97 + 9.71 = 63.68
        </Formula>
        <p>
          The amount is also written out in words under the total, the way many clients and
          banks expect it — the{" "}
          <Link href={toolPath("amount-in-words")} className="font-medium text-foreground underline underline-offset-4">
            amount in words converter
          </Link>{" "}
          does the same for any figure.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
