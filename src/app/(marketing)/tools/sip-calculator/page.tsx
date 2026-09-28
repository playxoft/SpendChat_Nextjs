import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolPath } from "@/lib/tools";
import { SipTool } from "./_components/sip-tool";

const SLUG = "sip-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
});

const faqs = [
  {
    q: "How is SIP return calculated?",
    a: "Each monthly instalment grows at the monthly rate — the yearly return divided by 12 — for as many months as it stays invested, and the results are added up: FV = P × ((1 + i)^n − 1) ÷ i × (1 + i). The estimated return is that value minus the total you invested.",
  },
  {
    q: "What is a step-up SIP?",
    a: "A SIP whose monthly amount rises by a fixed percentage every year — with a 10% step-up, ₹5,000 a month becomes ₹5,500 in year two and ₹6,050 in year three. It keeps your investing in step with a growing income, and because the extra money still has years to compound, it lifts the final value a lot: ₹5,000 a month at 12% for ten years grows to about ₹11.6 lakh flat, or about ₹16.9 lakh with a 10% step-up.",
  },
  {
    q: "Are SIP returns guaranteed?",
    a: "No. Mutual fund and stock returns change from year to year and can be negative. The expected return is an assumption you choose, and the result is an estimate for planning, not a forecast — past returns don't guarantee future ones. Trying a lower rate as well shows whether your plan still works if markets disappoint.",
  },
  {
    q: "How much will ₹5,000 a month become in 10 years?",
    a: "At an assumed 12% a year, about ₹11.6 lakh: ₹6 lakh invested plus about ₹5.6 lakh in returns. At 10% it's about ₹10.3 lakh, and at 8% about ₹9.2 lakh.",
  },
  {
    q: "Why do SIP calculators show different numbers?",
    a: "They make two different assumptions: whether each instalment goes in at the start or the end of the month, and whether 12% a year means 1% a month or a monthly rate that compounds to exactly 12%. This calculator uses the start of the month and annual ÷ 12, like most SIP calculators in India. Your fund statement reports XIRR instead, which uses the actual date of every instalment.",
  },
  {
    q: "Can I use this as a monthly investment calculator outside India?",
    a: "Yes. A SIP is simply a monthly investment plan, so the same maths works for a monthly contribution to an index fund, an ETF or a pension anywhere. Pick your currency and every figure is shown in it.",
  },
];

export default function SipCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      faqs={faqs}
      intro={
        <p>
          Estimate what a monthly SIP — or any regular monthly investment — could
          grow to, with an optional yearly step-up and the value in today&apos;s
          money.
        </p>
      }
      tool={<SipTool />}
    >
      <ToolSection title="How to use the SIP calculator">
        <p>
          Enter how much you&apos;ll invest each month, the yearly return you
          expect, and for how many years. The estimated value updates as you
          type, split into what you invested and what it earned, and the chart
          and table underneath show every year of the plan.
        </p>
        <p>
          Under <strong className="font-medium text-foreground">More options</strong>,
          add an annual step-up to raise your instalment each year, and an
          inflation rate to see the result in today&apos;s money. A SIP —
          systematic investment plan — is just a fixed amount invested every
          month, so this works as a monthly investment calculator for any fund,
          in any currency. Download CSV saves the table; Copy link shares the
          exact plan.
        </p>
      </ToolSection>

      <ToolSection title="The SIP formula">
        <p>Without a step-up, the value of a SIP after n months is:</p>
        <Formula>
          FV = P × ((1 + i)^n − 1) ÷ i × (1 + i)
          <br />i = yearly return ÷ 12 &nbsp;(12% → 0.01)
        </Formula>
        <p>
          P is the monthly amount and n the number of instalments. The final ×
          (1 + i) is there because each instalment is invested at the start of
          its month. That&apos;s the convention most SIP calculators in India
          use, so the numbers here match the ones you&apos;ll compare them with.
          A step-up has no tidy single formula — each year&apos;s instalments
          are effectively a separate SIP — so the calculator works through the
          plan month by month, which gives exactly the formula&apos;s answer when
          the step-up is zero.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: ₹5,000 a month for 10 years">
        <p>At an expected 12% a year, i = 0.01 and n = 120:</p>
        <Formula>5,000 × (1.01^120 − 1) ÷ 0.01 × 1.01 = ₹11,61,695</Formula>
        <p>
          You invest ₹6,00,000, so the estimated returns are ₹5,61,695. Add a 10%
          annual step-up — ₹5,000 a month in year one, ₹5,500 in year two, up to
          about ₹11,790 in year ten — and the value rises to ₹16,87,163 on
          ₹9,56,245 invested. At 6% inflation, the flat plan&apos;s ₹11,61,695 is
          worth about ₹6,48,685 in today&apos;s money.
        </p>
      </ToolSection>

      <ToolSection title="SIP returns aren't guaranteed">
        <p>
          The calculator assumes the same return every month. Real funds
          don&apos;t behave like that: an equity fund can fall sharply in a bad
          year and recover in a good one, and the order of those years changes
          what you end up with. Treat the result as one scenario, not a promise,
          and try a lower rate to see if the plan still works.
        </p>
        <p>
          One detail explains most gaps between this estimate and a fund&apos;s
          track record. Using annual ÷ 12 as the monthly rate means &ldquo;12%&rdquo;
          actually compounds to about 12.68% a year, while a fund quoting a 12%
          CAGR or XIRR grew exactly 12% a year. If you&apos;re plugging in a
          fund&apos;s past CAGR, entering 11.39% gives the like-for-like figure.
        </p>
        <p>
          And remember that without an inflation rate, every figure is in future
          money. The hard part is usually finding the monthly amount in the first
          place —{" "}
          <Link href="/features/analytics" className="font-medium text-foreground underline underline-offset-4">
            seeing where your money goes each month
          </Link>{" "}
          is how most people find it.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
