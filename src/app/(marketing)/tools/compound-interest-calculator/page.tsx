import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { CompoundTool } from "./_components/compound-tool";

const SLUG = "compound-interest-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How do I calculate compound interest with monthly contributions?",
    a: "Grow the starting amount for every month of the term, and each deposit for the months it has left, then add them up. The shortcut is FV = P × (1 + i)^N + D × ((1 + i)^N − 1) ÷ i, where P is the starting amount, D the monthly deposit, i the monthly rate and N the number of months. The calculator above does this for you and shows the balance at the end of every year.",
  },
  {
    q: "Is daily compounding much better than monthly?",
    a: "Barely. At 7% a year, monthly compounding works out to 7.23% a year and daily compounding to 7.25%. On 10,000 over ten years that's a difference of about 40. The rate itself, the time you leave the money, and how much you add each month all matter far more.",
  },
  {
    q: "What is the Rule of 72?",
    a: "A quick way to estimate how long money takes to double: divide 72 by the yearly interest rate. At 6% it doubles in about 12 years; at 9%, in about 8. It's an approximation that works best for rates between about 4% and 12%.",
  },
  {
    q: "What's the difference between simple and compound interest?",
    a: "Simple interest is paid only on the amount you put in. Compound interest is also paid on the interest you've already earned. 10,000 at 7% for ten years earns 7,000 in simple interest but about 9,672 compounded yearly — and the gap widens every year after that.",
  },
  {
    q: "What does \"in today's money\" mean?",
    a: "It's the future balance adjusted for inflation: the balance divided by (1 + inflation)^years. A balance of 54,714 in ten years, at 3% inflation, buys roughly what 40,712 buys today. Add an inflation rate under More options to see it — it's the honest number for judging whether a goal is big enough.",
  },
  {
    q: "Should deposits go in at the start or the end of the month?",
    a: "End of the month is the usual assumption, and the default here. Deposits at the start of the month earn one extra month of interest each, so the result is a little higher. Pick whichever matches when your money actually goes in.",
  },
];

export default function CompoundInterestCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Looking for more to save each month?"
      faqs={faqs}
      intro={
        <p>
          See what your savings grow to with compound interest and a regular
          monthly deposit — year by year, in your currency, and in today&apos;s
          money if you add inflation.
        </p>
      }
      tool={<CompoundTool />}
    >
      <ToolSection title="How to use the compound interest calculator">
        <p>
          Enter what you&apos;re starting with, what you&apos;ll add each month,
          the interest rate and the number of years. Either amount can be zero.
          The balance updates as you type, and the chart and table underneath
          show how it builds up: the grey part is money you paid in, the green
          part is interest earned on it.
        </p>
        <p>
          Under <strong className="font-medium text-foreground">More options</strong>{" "}
          you can change how often interest compounds (daily to yearly), move the
          deposits to the start of each month, and add an inflation rate to see
          the result in today&apos;s money. Download CSV saves the year-by-year
          table for a spreadsheet, and Copy link shares the exact numbers.
        </p>
      </ToolSection>

      <ToolSection title="The compound interest formula">
        <p>For a single amount left to grow, compound interest is:</p>
        <Formula>A = P × (1 + r ÷ n)^(n × t)</Formula>
        <p>
          P is the starting amount, r the yearly rate as a decimal (7% = 0.07), n
          the number of times a year interest compounds, and t the number of
          years. Adding a deposit D every month gives:
        </p>
        <Formula>
          i = (1 + r ÷ n)^(n ÷ 12) − 1 &nbsp;(monthly rate)
          <br />N = 12 × t &nbsp;(months)
          <br />FV = P × (1 + i)^N + D × ((1 + i)^N − 1) ÷ i
        </Formula>
        <p>
          With deposits at the start of each month, multiply the deposit part by
          (1 + i). The calculator works through the term month by month instead
          of using the formula — it lands on the same answer, and gives you the
          balance at the end of every year along the way.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: $10,000 plus $200 a month at 7%">
        <p>
          You start with $10,000, add $200 at the end of every month, and earn 7%
          a year compounded monthly, for 10 years. The monthly rate is 0.07 ÷ 12
          = 0.583%, over 120 months.
        </p>
        <Formula>
          10,000 × 1.005833^120 = $20,097
          <br />200 × (1.005833^120 − 1) ÷ 0.005833 = $34,617
          <br />Total = $54,714
        </Formula>
        <p>
          You paid in $34,000 (the $10,000 plus 120 deposits of $200), so $20,714
          of the final balance is interest. At 3% inflation, $54,714 in ten years
          buys roughly what $40,712 buys today.
        </p>
      </ToolSection>

      <ToolSection title="Compounding frequency matters less than you think">
        <p>
          Accounts advertise daily compounding as if it were a big deal. On
          $10,000 at 7% for 10 years, compounding yearly gives $19,672, monthly
          $20,097 and daily $20,136 — under $500 between the extremes. Raise the
          rate from 7% to 8% instead and the monthly figure becomes $22,196;
          leave it five more years and it&apos;s $28,489. The rate, the time and
          the amount you add are the levers that count. To compare two accounts,
          look at the effective annual rate (AER or APY), which already includes
          the compounding.
        </p>
        <p>
          The bigger distortion is inflation. Every figure on this page is in
          future money unless you add an inflation rate, and over decades that
          gap is larger than any difference in compounding. Finding the monthly
          deposit is usually the hard part —{" "}
          <Link href="/features/analytics" className="font-medium text-foreground underline underline-offset-4">
            seeing where your money goes each month
          </Link>{" "}
          is how most people find it.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
