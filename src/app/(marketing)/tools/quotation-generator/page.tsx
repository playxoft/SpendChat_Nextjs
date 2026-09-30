import Link from "next/link";
import { BusinessDocTool } from "@/components/tools/business-doc/business-doc-tool";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";

const SLUG = "quotation-generator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "Is this quotation generator free?",
    a: "Yes. There's no signup, no watermark and no limit on how many quotes you make. A small “Made with SpendChat” line sits at the foot of the page; untick it under Notes and terms and it's gone.",
  },
  {
    q: "How long should a quote be valid?",
    a: "Long enough for the client to decide, short enough that your costs haven't moved. 15 to 30 days is common for services; go shorter when material prices change quickly. Pick 15, 30, 60 or 90 days, or set any date — once it passes, you're free to re-quote.",
  },
  {
    q: "Can I turn a quote into an invoice?",
    a: "Yes. Press Invoice and the client, items, discount and tax are copied into the invoice generator with the next invoice number and today's date. The quote itself stays here, unchanged.",
  },
  {
    q: "What's the difference between a quotation and an estimate?",
    a: "A quotation is generally a fixed price for the work described: once the client accepts, that's what you charge. An estimate is your best guess, and the final bill can differ if the job does. Switch the title between Quotation and Estimate at the top of the form.",
  },
  {
    q: "Is my data stored anywhere?",
    a: "Only in your browser. The draft is saved in this device's local storage so it's there when you come back; nothing is sent to SpendChat. Download saves a copy you can open elsewhere with Open, and Reset deletes it.",
  },
  {
    q: "How do I save the quote as a PDF?",
    a: "Press Print / Save as PDF and choose “Save as PDF” as the printer. Turn off “Headers and footers” in the print dialog for a clean page. Only the quotation prints — not the rest of this page.",
  },
];

export default function QuotationGeneratorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Won the job? Track the income in SpendChat when it's paid."
      faqs={faqs}
      category="BusinessApplication"
      intro={
        <p>
          Price a job in a few minutes: list the work, add tax and a validity date, and save it as a
          PDF. When the client says yes, turn it into an invoice in one click.
        </p>
      }
      tool={<BusinessDocTool kind="quotation" />}
    >
      <ToolSection title="How to write a quotation">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Add your business details and logo once — they&apos;re saved in your browser.</li>
          <li>Fill in who the quote is for, and choose how long the price stands.</li>
          <li>
            Break the job into lines — labour, materials, delivery — each with a quantity and unit
            price. Press Enter in the price box to start the next line.
          </li>
          <li>Add a discount or tax if they apply, then your terms: deposit, schedule, what&apos;s not included.</li>
          <li>Press Print / Save as PDF and send it. When it&apos;s accepted, press Invoice to turn it into an invoice.</li>
        </ol>
      </ToolSection>

      <ToolSection title="What to put on a quotation">
        <ul className="list-disc space-y-2 pl-5">
          <li>your business name, contact details and tax number if you&apos;re registered;</li>
          <li>the client&apos;s name and address;</li>
          <li>a quote number and date, so both sides can refer to it later;</li>
          <li>an itemised list of what&apos;s included, with a price for each line;</li>
          <li>tax shown separately, and the total;</li>
          <li>how long the price is valid;</li>
          <li>your terms — deposit, payment stages, exclusions, and how to accept.</li>
        </ul>
        <p>
          Itemising matters more on a quote than anywhere else: when the client asks to drop
          something, you can see what it&apos;s worth, and when the job grows, it&apos;s clear what
          wasn&apos;t in the original price.
        </p>
      </ToolSection>

      <ToolSection title="Quotation, estimate, proforma or invoice?">
        <p>
          A <strong className="font-medium text-foreground">quotation</strong> offers a price for
          defined work before it starts. An <strong className="font-medium text-foreground">estimate</strong>{" "}
          is an approximate price when the scope isn&apos;t fixed yet. A{" "}
          <strong className="font-medium text-foreground">proforma invoice</strong> previews the
          final invoice for a confirmed order, often so the buyer can arrange payment. An{" "}
          <strong className="font-medium text-foreground">invoice</strong> asks for payment once the
          work is done — make it with the{" "}
          <Link href={toolPath("invoice-generator")} className="font-medium text-foreground underline underline-offset-4">
            invoice generator
          </Link>
          .
        </p>
      </ToolSection>

      <ToolSection title="A worked example: repainting two rooms">
        <p>
          Two rooms at 450 each plus 180 of materials, with a 5% discount and 20% VAT. The discount
          comes off first, VAT is charged on what&apos;s left, and each step is rounded to the cent:
        </p>
        <Formula>
          Lines: 2 × 450.00 + 1 × 180.00 = 1,080.00
          <br />
          Discount: 5% × 1,080.00 = 54.00
          <br />
          Taxable: 1,080.00 − 54.00 = 1,026.00
          <br />
          VAT: 20% × 1,026.00 = 205.20
          <br />
          Total: 1,026.00 + 205.20 = 1,231.20
        </Formula>
        <p>
          Not sure what rate applies? The{" "}
          <Link href={toolPath("vat-calculator")} className="font-medium text-foreground underline underline-offset-4">
            VAT calculator
          </Link>{" "}
          lists standard rates by country.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
