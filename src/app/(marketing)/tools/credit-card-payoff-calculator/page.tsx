import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { CardPayoffTool } from "./_components/card-payoff-tool";

const SLUG = "credit-card-payoff-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How long will it take to pay off my credit card?",
    a: "It depends on three numbers: what you owe, the card's APR and what you pay each month. Enter them above and the calculator steps through every month — interest added, payment taken off — until the balance reaches zero. It assumes you don't add new spending to the card while you pay it down.",
  },
  {
    q: "Why does paying only the minimum take so long?",
    a: "Because the minimum shrinks as the balance shrinks. On a 1% plus interest rule, most of each minimum payment is interest and only 1% of the balance is repaid, so the balance falls slowly and the payment falls with it. A 5,000 balance at 22% takes about 19 years that way. Keep paying the first month's minimum as a fixed amount instead, and it's gone in under 5 years.",
  },
  {
    q: "How is credit card interest calculated?",
    a: "Most issuers divide the APR by 365 to get a daily rate, apply it to your average daily balance, and charge it once a month. This calculator uses balance × APR ÷ 12 each month instead, which gives results within a few cents a month when the balance isn't changing much between statements.",
  },
  {
    q: "How much should I pay to clear my card in 3 years?",
    a: "Use the fixed payment that amortises the balance over 36 months: P = B × r ÷ (1 − (1 + r)^−36), where r is the APR ÷ 12 as a decimal. For 5,000 at 22% that's about 191 a month. If your payment doesn't even cover the interest, the calculator shows this 3-year figure for you.",
  },
  {
    q: "What happens if my payment is less than the interest?",
    a: "The balance grows instead of shrinking, and it will never be paid off at that rate. The calculator says so plainly and shows the month's interest — your payment has to be more than that before any of it reduces what you owe.",
  },
  {
    q: "Should I pay off the card with the highest rate first?",
    a: "If you have several debts, paying the minimum on all of them and putting every spare amount on the highest-APR one costs the least interest overall (the “avalanche” method). Clearing the smallest balance first (the “snowball”) costs a little more but gives quicker wins, which some people find easier to stick with.",
  },
];

export default function CreditCardPayoffCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Paying it down? See where the rest of your money goes each month."
      faqs={faqs}
      intro={
        <p>
          See how long your card takes to clear at the payment you choose, what it costs in
          interest — and how that compares with paying only the minimum.
        </p>
      }
      tool={<CardPayoffTool />}
    >
      <ToolSection title="How to use the credit card payoff calculator">
        <p>
          Enter your card balance, its APR (the yearly interest rate on your statement) and the
          amount you plan to pay each month. The result shows how long it takes to reach zero,
          the total interest, and the same numbers if you paid only the card&apos;s minimum.
        </p>
        <p>
          The minimum payment rule is under More options: a percentage of the balance, a floor
          it never drops below, and whether the month&apos;s interest is added on top. The
          defaults match a common US rule — 1% of the balance plus interest, at least 25 — so
          change them to your card&apos;s terms if they differ. Copy link saves your numbers so
          you can come back to them.
        </p>
      </ToolSection>

      <ToolSection title="How credit card payoff is calculated">
        <p>
          The calculator works month by month, because a minimum payment changes as the balance
          does and there&apos;s no single formula for that. Each month:
        </p>
        <Formula>
          interest = balance × APR ÷ 12
          <br />
          balance = balance + interest − payment
          <br />
          minimum = max(floor, balance × % [+ interest])
        </Formula>
        <p>
          It repeats until the balance reaches zero, and stops with a plain warning if the
          payment doesn&apos;t cover the interest or would take more than 100 years. For a fixed
          payment P, the number of months also has a closed form: n = −ln(1 − r × B ÷ P) ÷ ln(1
          + r), with r = APR ÷ 12.
        </p>
        <p>
          Issuers really charge interest on your average daily balance, and paying the full
          statement balance by the due date usually means no interest at all. This model assumes
          you&apos;re carrying a balance and adding nothing new, so treat the answer as a close
          estimate, not your card&apos;s exact figures.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: 5,000 at 22% APR">
        <p>
          The first month&apos;s interest is 5,000 × 22% ÷ 12 = 91.67. On a 1% plus interest
          rule, the minimum is 1% of 5,091.67 plus 91.67 = 142.58.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-foreground">Minimum payments only:</strong> about
            18 years 11 months, and 7,963.68 in interest — more than the original balance.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Keep paying 142.58 every month:
            </strong>{" "}
            4 years 9 months and 3,082.01 in interest. Same first payment, less than half the
            interest.
          </li>
          <li>
            <strong className="font-medium text-foreground">Pay 200 every month:</strong> 2 years
            10 months and 1,749.88 in interest — 6,213.80 less than paying the minimum.
          </li>
        </ul>
      </ToolSection>

      <ToolSection title="Minimum payment rules differ by country and card">
        <p>
          In the US, many cards ask for 1% of the balance plus that month&apos;s interest and
          fees, with a floor of around 25 to 40, and statements must show how long paying only
          the minimum would take. In the UK, the minimum must at least cover interest, fees and
          1% of the balance. Elsewhere a flat 2–5% of the balance is common. A flat percentage
          below the monthly interest rate — 2% on a 30% APR card, say — never clears the
          balance; the calculator shows that too.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
