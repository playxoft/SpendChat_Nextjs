import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { LoanComparisonTool } from "./_components/loan-comparison-tool";

const SLUG = "loan-comparison-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How do I compare two loan offers?",
    a: "Put them on the same footing: the same amount and tenure, then add up everything each one costs — the interest over the whole loan plus the processing fee and any other charges paid up front. The offer with the lower total cost is cheaper, whatever its rate. The calculator above does this for up to three offers and marks the cheapest.",
  },
  {
    q: "Is the loan with the lower interest rate always cheaper?",
    a: "No. A lower rate saves interest, but a bigger processing fee can cost more than that saving. On 5,00,000 over 5 years, 10.5% with 12,000 in fees costs 2,044.29 more in total than 11% with a 2,500 fee: the lower rate saves 7,455.71 in interest, but its fees are 9,500 higher.",
  },
  {
    q: "What is a processing fee, and is it included in the EMI?",
    a: "It's a one-time charge for setting up the loan — usually 0.5% to 2% of the amount on Indian home and personal loans, an origination fee or discount points in the US, and an arrangement or product fee in the UK. It isn't part of the EMI: it's deducted from the amount you receive or paid up front. In India, GST of 18% is charged on it, so enter a 1% fee as 1.18%.",
  },
  {
    q: "What is the effective rate (APR)?",
    a: "The yearly rate the loan really costs once fees are counted. Fees mean you receive less than you borrow but still repay the full amount, so the rate on the money that actually reached you is higher than the quoted one. It's the fairest single number for comparing offers with different amounts or tenures.",
  },
  {
    q: "Is a longer tenure better because the EMI is lower?",
    a: "Only for your monthly budget. The same 5,00,000 at 11% is 16,369.36 a month over 3 years with 89,296.90 of interest, or 10,871.21 a month over 5 years with 1,52,272.70 of interest. Pick the shortest tenure whose EMI you can comfortably pay every month.",
  },
  {
    q: "Does it include prepayment or foreclosure charges?",
    a: "No — it assumes you keep each loan for its full tenure. If you expect to pay a loan off early, check each lender's foreclosure charges too: an offer with a slightly higher rate and no prepayment penalty can work out cheaper. The EMI & loan calculator shows what prepaying saves.",
  },
];

export default function LoanComparisonCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Picked a loan? See where the rest of your money goes each month."
      faqs={faqs}
      intro={
        <p>
          Compare two or three loan offers side by side — EMI, total interest and the true cost with
          processing fees and charges counted — and see which one is really cheaper.
        </p>
      }
      tool={<LoanComparisonTool />}
    >
      <ToolSection title="How to use the loan comparison calculator">
        <p>
          Fill in each offer&apos;s loan amount, interest rate and tenure, then its processing fee —
          as a percentage of the loan or a fixed amount — and any other charges paid up front, such as
          legal, valuation or documentation fees. Each offer shows its EMI, total interest, fees and
          total cost as you type, and the cheapest one gets a badge. Add a third offer if you have one.
        </p>
        <p>
          Under the offers, the verdict names the cheapest loan and how much it saves, with a bar per
          offer showing how much of its cost is interest and how much is fees. Copy result gives you
          the comparison as text, and Copy link shares the exact offers.
        </p>
      </ToolSection>

      <ToolSection title="How the true cost of a loan is worked out">
        <p>Each offer&apos;s EMI comes from the standard reducing-balance formula:</p>
        <Formula>EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1)</Formula>
        <p>
          P is the loan amount, r the yearly rate ÷ 12 as a decimal, and n the number of monthly
          payments. From there:
        </p>
        <Formula>
          Total interest ≈ EMI × n − P
          <br />
          Total cost = total interest + processing fee + other charges
        </Formula>
        <p>
          Interest is only approximately EMI × n − P because each EMI is rounded to the cent (or
          paisa) and the last payment absorbs the difference, so the totals below can differ from
          it by a few cents.
        </p>
        <p>
          The offers are ranked on total cost. The effective rate (APR) is the rate at which the EMIs
          repay only what you actually received — the loan minus the fees — so it rises above the
          quoted rate whenever there are fees.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: the lower rate that costs more">
        <p>Two banks offer you ₹5,00,000 for 5 years:</p>
        <Formula>
          Offer A: 10.5% a year, 2% processing fee (₹10,000) + ₹2,000 charges
          <br />
          Offer B: 11% a year, 0.5% processing fee (₹2,500)
        </Formula>
        <p>
          Offer A&apos;s EMI is ₹10,746.95 and its interest comes to ₹1,44,816.99; with ₹12,000 of
          fees, it costs ₹1,56,816.99 in all. Offer B&apos;s EMI is higher at ₹10,871.21 and its
          interest is ₹1,52,272.70, but with only ₹2,500 of fees its total cost is ₹1,54,772.70.
        </p>
        <p>
          The lower rate saves ₹7,455.71 in interest, but its fees are ₹9,500 higher, so{" "}
          <strong className="font-medium text-foreground">Offer B is ₹2,044.29 cheaper</strong>. The
          effective rates tell the same story: 11.56% for Offer A against 11.22% for Offer B.
        </p>
      </ToolSection>

      <ToolSection title="When paying a fee for a lower rate is worth it">
        <p>
          On a long loan, a small rate cut adds up and usually beats a one-off fee. A $300,000 mortgage
          over 30 years at 6.5% is $1,896.20 a month. Paying $3,000 in points to bring the rate down to
          6.25% makes it $1,847.15 — $49.05 a month less — and saves $14,660.91 over the full term.
        </p>
        <p>
          But the fee is only paid back after about 62 payments, just over 5 years. Sell, refinance or
          prepay before then and the cheaper-looking loan was the dearer one. So compare offers over
          the time you actually expect to keep the loan, and for the effect of paying one off early,
          try the{" "}
          <Link href="/tools/loan-calculator" className="font-medium text-foreground underline underline-offset-4">
            EMI & loan calculator
          </Link>{" "}
          with prepayments. And once the loan is running,{" "}
          <Link href="/features/analytics" className="font-medium text-foreground underline underline-offset-4">
            seeing where the rest of your money goes
          </Link>{" "}
          is how you find room to pay it off sooner.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
