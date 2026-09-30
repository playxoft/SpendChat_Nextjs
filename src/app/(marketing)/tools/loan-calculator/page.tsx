import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { LoanTool } from "./_components/loan-tool";

const SLUG = "loan-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How is EMI calculated?",
    a: "EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), where P is the loan amount, r the yearly interest rate ÷ 12 as a decimal, and n the number of monthly payments. For 10,00,000 at 8.5% over 20 years, r = 0.0070833 and n = 240, which gives an EMI of 8,678.23. The calculator does this for you and splits every payment into interest and principal.",
  },
  {
    q: "Should I reduce my EMI or my tenure when I prepay?",
    a: "Reducing the tenure saves more, because the balance keeps falling at the old pace plus the prepayment. On 10,00,000 at 8.5% over 20 years, prepaying 1,00,000 with the 12th EMI saves 3,20,738.55 in interest and ends the loan 4 years early if you keep the EMI. Lowering the EMI instead (to 7,792.79) saves 1,01,883.52. Pick the lower EMI only if you need the room in your monthly budget.",
  },
  {
    q: "Can I use this as a mortgage calculator?",
    a: "Yes — the EMI is what US and UK lenders call the monthly payment on a repayment mortgage: principal and interest. It doesn't include property tax, homeowners or buildings insurance, PMI or HOA fees, which lenders often collect alongside it (in escrow, in the US). Add those on top to get your full monthly housing cost.",
  },
  {
    q: "Why is most of my early EMI interest?",
    a: "Interest is charged on what you still owe, and at the start you owe the most. In the first year of a 10,00,000 loan at 8.5% over 20 years, 84,236.49 of the 1,04,138.76 you pay is interest — about 81%. Principal only overtakes interest with the 143rd payment, nearly 12 years in. That's also why prepaying early saves the most.",
  },
  {
    q: "What if my interest rate changes?",
    a: "The calculator assumes a fixed rate. On a floating-rate loan, take the balance left from the schedule, enter it as the loan amount with the new rate and the months remaining, and you'll see the new EMI. When rates rise, many lenders keep the EMI and extend the tenure instead — which costs more interest overall, so ask which one they are doing.",
  },
  {
    q: "Does it work for car and personal loans?",
    a: "Yes, for any reducing-balance loan, which is how most home, car and personal loans are charged. Watch out for loans quoted at a flat rate, where interest is worked out on the full amount for the whole term: a 7% flat rate over 5 years costs about the same as 12.5% on a reducing balance.",
  },
];

export default function LoanCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Paying off a loan? See where the rest of your money goes each month."
      faqs={faqs}
      intro={
        <p>
          Work out the monthly EMI on a home loan, mortgage, car or personal loan, what it costs in
          interest, and how much prepaying saves — with the full amortization schedule.
        </p>
      }
      tool={<LoanTool />}
    >
      <ToolSection title="How to use the EMI & loan calculator">
        <p>
          Enter the loan amount, the yearly interest rate and the tenure, in years or months. The
          monthly payment (EMI) updates as you type, with the total interest and the total you&apos;ll
          repay. The bar under it shows how much of that total is the loan itself and how much is
          interest.
        </p>
        <p>
          Under <strong className="font-medium text-foreground">More options</strong> you can set the
          month of your first payment, so the schedule shows real dates, and add prepayments: a lump
          sum with any payment, a regular extra amount every month or every year, or both. Choose
          whether prepayments cut the tenure or the EMI, and the result shows the interest and the
          months you save. The amortization schedule below the calculator breaks every payment into
          principal and interest, by year or by month — Download CSV saves it for a spreadsheet, and
          Copy link shares the exact numbers.
        </p>
      </ToolSection>

      <ToolSection title="The EMI formula">
        <p>Every lender uses the same formula for a reducing-balance loan:</p>
        <Formula>EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1)</Formula>
        <p>
          P is the loan amount, r the monthly interest rate (the yearly rate ÷ 12, as a decimal — 8.5%
          a year is 0.0070833) and n the number of monthly payments. Each month, interest is charged
          on the balance still owed; the rest of the EMI repays principal, so the interest part
          shrinks and the principal part grows until the balance reaches zero. The schedule rounds
          each payment to the cent the way lenders do, and the last payment absorbs the rounding.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: a 10 lakh home loan at 8.5%">
        <p>
          You borrow ₹10,00,000 at 8.5% a year for 20 years — 240 monthly payments.
        </p>
        <Formula>
          r = 8.5 ÷ 12 ÷ 100 = 0.0070833
          <br />
          EMI = 10,00,000 × 0.0070833 × 1.0070833^240 ÷ (1.0070833^240 − 1) = ₹8,678.23
        </Formula>
        <p>
          Over 20 years you repay ₹20,82,776.63: the ₹10,00,000 you borrowed plus ₹10,82,776.63 of
          interest, so interest is 52% of everything you pay. The first EMI is ₹7,083.33 interest and
          only ₹1,594.90 principal.
        </p>
        <p>
          Now prepay ₹1,00,000 with the 12th EMI — a year&apos;s bonus, say — and keep the EMI the
          same. The loan ends after 16 years instead of 20, and you save ₹3,20,738.55 in interest.
          Even one extra EMI a year, with no lump sum, cuts 3 years and 3 months and saves
          ₹2,05,828.09.
        </p>
        <p>
          The same maths works in any currency: a $300,000 mortgage at 6.5% over 30 years is $1,896.20
          a month and $382,636.71 in interest, and adding $100 a month to it pays it off 4 years
          sooner, saving $60,995.81.
        </p>
      </ToolSection>

      <ToolSection title="Three ways to pay less interest on a loan">
        <p>
          <strong className="font-medium text-foreground">Prepay early.</strong> A prepayment cuts the
          balance that every later month&apos;s interest is charged on, so the earlier it comes, the
          more it saves. Check whether your lender charges a prepayment penalty — in India, floating-rate
          home loans to individuals can&apos;t carry one.
        </p>
        <p>
          <strong className="font-medium text-foreground">Choose a shorter tenure.</strong> Taking the
          same ₹10,00,000 over 15 years instead of 20 raises the EMI to ₹9,847.40 but cuts total
          interest to ₹7,72,530.34 — ₹3,10,246.29 less.
        </p>
        <p>
          <strong className="font-medium text-foreground">Shop the rate, and the fees.</strong> Half a
          percent matters: at 8% instead of 8.5%, the example loan costs ₹75,320.07 less. But a lower
          rate with a big processing fee can still cost more — the{" "}
          <Link href="/tools/loan-comparison-calculator" className="font-medium text-foreground underline underline-offset-4">
            loan comparison calculator
          </Link>{" "}
          adds the fees in for you. Whatever you choose, an EMI is easier to carry when you{" "}
          <Link href="/features/analytics" className="font-medium text-foreground underline underline-offset-4">
            know where the rest of your money goes
          </Link>
          .
        </p>
      </ToolSection>
    </ToolPage>
  );
}
