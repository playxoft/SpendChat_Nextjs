import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { TAX_RATES, TAX_RATES_SOURCE, TAX_RATES_VERIFIED_ON } from "@/lib/tools/data/tax-rates";
import { VatTool } from "./_components/vat-tool";

const SLUG = "vat-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

/** "28 September 2026" — fixed format and time zone, so the build is deterministic. */
const verifiedOn = new Date(`${TAX_RATES_VERIFIED_ON}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const faqs = [
  {
    q: "How do I remove VAT from a price?",
    a: "Divide the price by 1 plus the rate as a decimal. At 20% VAT, divide by 1.2: £240 ÷ 1.2 = £200 before VAT, so the VAT was £40. Don't take 20% off the total — £240 × 0.8 gives £192, which is wrong, because the 20% was added to the smaller, pre-tax price.",
  },
  {
    q: "What is reverse VAT?",
    a: "Reverse VAT (or a reverse GST calculation) means working backwards from a price that already includes tax to find the price before tax and the tax inside it. Choose Remove above. The formula is net = gross ÷ (1 + rate ÷ 100). It's not the same as the reverse charge, a rule where a business buyer accounts for the VAT instead of the seller.",
  },
  {
    q: "What's the difference between VAT and GST?",
    a: "Mostly the name. Both are taxes added at each stage of the supply chain, where every business claims back the tax it paid on its own purchases, so the end customer carries the cost. Europe, the UK and the Gulf call it VAT; India, Australia, New Zealand, Singapore and Canada call it GST. The maths in this calculator is the same for both.",
  },
  {
    q: "Is sales tax the same as VAT?",
    a: "No. US sales tax is charged once, at the final sale to the consumer, and businesses don't claim it back along the chain. There's also no national rate: each state sets one and cities and counties add their own, so the rate depends on where the sale happens. US prices are usually shown before sales tax, which is why you add it at the till.",
  },
  {
    q: "What are CGST and SGST?",
    a: "India splits GST on a sale within one state into two equal halves: CGST, which goes to the central government, and SGST, which goes to the state (UTGST in a Union Territory). An 18% item carries 9% CGST plus 9% SGST. A sale to another state carries a single IGST at the full 18% instead. The buyer pays the same total either way.",
  },
  {
    q: "Are the country rates up to date?",
    a: `They were checked on ${verifiedOn} against ${TAX_RATES_SOURCE}. Rates do change — India restructured its GST slabs in September 2025, and several countries changed VAT in 2025 and 2026 — so the rate box is always editable. Many goods also carry a reduced rate; tap one of the country's rates under the rate box, or type your own.`,
  },
];

function otherRates(r: (typeof TAX_RATES)[number]): string {
  const rates = [...(r.higher ?? []), ...r.reduced];
  return rates.length ? rates.map((n) => `${n}%`).join(", ") : "—";
}

export default function VatCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Logging purchases for your records?"
      faqs={faqs}
      intro={
        <p>
          Add tax to a price, or take it back out of a price that already
          includes it. Pick a country for its VAT or GST rate, or type any rate
          — the net, tax and total add up to the last cent.
        </p>
      }
      tool={<VatTool />}
    >
      <ToolSection title="How to add or remove VAT, GST or sales tax">
        <p>
          Choose <strong className="text-foreground">Add</strong> when your
          price is before tax — a supplier&apos;s quote, a US shelf price — and
          you want the total. Choose <strong className="text-foreground">Remove</strong>{" "}
          when the price already includes tax, like a receipt or a UK or
          European shop price, and you want to know how much of it is tax.
        </p>
        <p>
          The country fills in its standard rate and the name of its tax. If
          what you&apos;re pricing has a reduced rate — food, books, medicine,
          hotels — tap it under the rate box or type it in. For the United
          States, enter your combined state and local rate. The tax is rounded
          to the currency&apos;s smallest unit, and the net is worked out from
          it, so the three figures always add up.
        </p>
      </ToolSection>

      <ToolSection title="VAT formulas: adding and removing tax">
        <p>The rate is written as a plain number — 20 for 20%.</p>
        <Formula>
          Add: tax = net × rate ÷ 100
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp; gross = net × (1 + rate ÷ 100)
          <br />
          Remove: net = gross ÷ (1 + rate ÷ 100)
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tax = gross − net
        </Formula>
        <p>
          Removing tax is where most mistakes happen. It&apos;s tempting to
          take the rate off the total — gross × (1 − rate ÷ 100) — but the
          rate was charged on the net price, not the total, so that takes off
          too much. At 20%, the tax inside a VAT-inclusive price is always one
          sixth of it (20 ÷ 120), not a fifth.
        </p>
      </ToolSection>

      <ToolSection title="Worked examples in pounds and rupees">
        <p>
          <strong className="text-foreground">Removing UK VAT.</strong> A
          receipt says £240 including 20% VAT. The price before VAT is £240 ÷
          1.2 = £200, and the VAT is £240 − £200 = £40. Taking 20% off the
          total instead gives £192 — £8 short, and a figure that won&apos;t
          match the invoice.
        </p>
        <p>
          <strong className="text-foreground">Adding Indian GST.</strong> A
          freelancer bills ₹10,000 for a service at 18% GST. The GST is ₹10,000
          × 18 ÷ 100 = ₹1,800, so the invoice total is ₹11,800. If the client is
          in the same state, that ₹1,800 is shown as ₹900 CGST plus ₹900 SGST;
          if the client is in another state, it&apos;s ₹1,800 IGST.
        </p>
        <Formula>
          £240 ÷ 1.2 = £200.00 net + £40.00 VAT
          <br />
          ₹10,000 × 1.18 = ₹11,800.00 (₹900 CGST + ₹900 SGST)
        </Formula>
      </ToolSection>

      <ToolSection title="India's GST split: CGST, SGST and IGST">
        <p>
          India has one GST rate per item, but who collects it depends on where
          the buyer is. On a sale within one state (intra-state), the GST is
          split in half: CGST goes to the central government and SGST to the
          state — or UTGST in a Union Territory without its own legislature. On
          a sale to another state (inter-state), and on imports, the full rate
          is charged as IGST, which the centre collects and shares out.
        </p>
        <p>
          The customer pays the same either way; the split decides which lines
          appear on the invoice and which credit a GST-registered buyer claims.
          Since 22 September 2025, most goods and services fall in the 5% or 18%
          slab, with 40% reserved for luxury and &quot;sin&quot; goods. Pick India
          above and switch between <em>Same state</em> and{" "}
          <em>Another state</em> to see both invoices.
        </p>
      </ToolSection>

      <ToolSection title="VAT and GST rates by country" id="rates">
        <p>
          Standard and other rates for the countries in the calculator, checked
          on {verifiedOn}. Reduced rates apply only to specific goods and
          services, which differ by country — check your tax authority for what
          qualifies. Source: {TAX_RATES_SOURCE}.
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-3 py-2 font-medium text-foreground">Country</th>
                <th scope="col" className="px-3 py-2 font-medium text-foreground">Tax</th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-foreground">Standard</th>
                <th scope="col" className="px-3 py-2 font-medium text-foreground">Other rates</th>
              </tr>
            </thead>
            <tbody>
              {TAX_RATES.map((r) => (
                <tr key={r.country} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-foreground">{r.name}</td>
                  <td className="px-3 py-2">{r.taxName.charAt(0).toUpperCase() + r.taxName.slice(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.standard === null ? "by state" : `${r.standard}%`}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{otherRates(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Paying VAT on business purchases you&apos;ll claim back? Keep each
          receipt with its expense — SpendChat can{" "}
          <Link href="/features/receipts-and-files" className="text-foreground underline underline-offset-4">
            attach receipts and invoices to transactions
          </Link>
          .
        </p>
      </ToolSection>
    </ToolPage>
  );
}
