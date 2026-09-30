import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { SimpleInterestTool } from "./_components/simple-interest-tool";

const SLUG = "simple-interest-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const link = "font-medium text-foreground underline underline-offset-4";

const faqs = [
  {
    q: "What is the formula for simple interest?",
    a: "SI = P × R × T ÷ 100, where P is the principal (the amount lent or borrowed), R the interest rate per year as a percentage, and T the time in years. The final amount is A = P + SI. So 10,000 at 7% for 3 years earns 10,000 × 7 × 3 ÷ 100 = 2,100, and the amount is 12,100.",
  },
  {
    q: "How do I find the principal, rate or time?",
    a: "Rearrange the same formula. Principal: P = SI × 100 ÷ (R × T). Rate: R = SI × 100 ÷ (P × T). Time: T = SI × 100 ÷ (P × R). If you're given the final amount instead of the interest, subtract the principal first (SI = A − P), or for the principal use P = A ÷ (1 + R × T ÷ 100). Pick what to solve for above and the calculator shows each step.",
  },
  {
    q: "How do I calculate simple interest for months or days?",
    a: "Turn the time into years first: months ÷ 12, or days ÷ 365. 10,000 at 7% for 90 days is 10,000 × 7 × 90 ÷ (100 × 365) = 172.60. When you're given two dates, count the days between them — leave out the day the money was lent and count the day it was repaid. Some loans use a 360-day year instead (the banker's rule), which you can switch on under More options.",
  },
  {
    q: "What is the difference between simple and compound interest?",
    a: "Simple interest is paid only on the original principal, so it grows by the same amount every year. Compound interest is also paid on interest already earned. 10,000 at 7% for 3 years earns 2,100 simple, or 2,250.43 compounded yearly. Over a year or less the two are the same; after that, compounding pulls further ahead every year.",
  },
  {
    q: "How long does money take to double at simple interest?",
    a: "Doubling means the interest equals the principal, so T = 100 ÷ R. At 8% that's 12.5 years. Compounded yearly at 8% it takes about 9 years — the Rule of 72 (72 ÷ 8) gives the same 9.",
  },
  {
    q: "What does an interest rate of 2% a month mean?",
    a: "It's 2% of the principal for every month, or 24% a year. On 50,000 for 6 months that's 50,000 × 24 × 0.5 ÷ 100 = 6,000 — 1,000 a month. Informal loans are often quoted this way; set the rate to per month under More options and the calculator converts it for you.",
  },
];

export default function SimpleInterestCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Want more left over to earn interest on? See where your money goes each month."
      faqs={faqs}
      intro={
        <p>
          Work out simple interest from the principal, rate and time — or find
          the missing principal, rate or time — with every step of the working
          shown, and a side-by-side check against compound interest.
        </p>
      }
      tool={<SimpleInterestTool />}
    >
      <ToolSection title="How to use the simple interest calculator">
        <p>
          Choose what you want to find: the interest, the principal, the rate or
          the time. Fill in the other three and the answer updates as you type,
          with the step-by-step working underneath — the same layout a textbook
          uses, so you can check your own sums line by line.
        </p>
        <p>
          When solving for the principal, rate or time, tell the calculator
          whether you know the interest or the final amount (principal plus
          interest). Time can be in years, months or days, or you can pick two
          dates and it counts the days for you. A rate quoted per month and the
          360-day banker&apos;s year are under{" "}
          <strong className="font-medium text-foreground">More options</strong>.
        </p>
      </ToolSection>

      <ToolSection title="The simple interest formula">
        <Formula>
          SI = P × R × T ÷ 100
          <br />A = P + SI
        </Formula>
        <p>
          P is the principal, R the rate per year as a percentage (7% is 7), T
          the time in years and A the final amount. Rearranged, the same formula
          gives each of the other three:
        </p>
        <Formula>
          P = SI × 100 ÷ (R × T)
          <br />R = SI × 100 ÷ (P × T)
          <br />T = SI × 100 ÷ (P × R)
        </Formula>
        <p>
          A time in months is months ÷ 12 years; in days, days ÷ 365. The
          calculator keeps that as a fraction until the last step, so a 90-day
          answer isn&apos;t thrown off by rounding 0.2466 years along the way.
        </p>
      </ToolSection>

      <ToolSection title="Worked examples">
        <p>
          <strong className="font-medium text-foreground">Interest:</strong>{" "}
          10,000 at 7% a year for 3 years.
        </p>
        <Formula>
          SI = 10,000 × 7 × 3 ÷ 100 = 210,000 ÷ 100 = 2,100
          <br />A = 10,000 + 2,100 = 12,100
        </Formula>
        <p>
          <strong className="font-medium text-foreground">Days between dates:</strong>{" "}
          7,300 lent at 5% on 4 February 2025 and repaid on 18 April 2025. Leave
          out 4 February and count 18 April: 24 days in February, 31 in March and
          18 in April make 73 days.
        </p>
        <Formula>SI = 7,300 × 5 × 73 ÷ (100 × 365) = 2,664,500 ÷ 36,500 = 73</Formula>
        <p>
          <strong className="font-medium text-foreground">Principal from the final amount:</strong>{" "}
          what sum grows to 6,000 in 4 years at 5%? Each 1 of principal becomes
          1 + 5 × 4 ÷ 100 = 1.2, so P = 6,000 ÷ 1.2 = 5,000, and the interest is
          1,000.
        </p>
      </ToolSection>

      <ToolSection title="Flat-rate loans use simple interest — and cost more than they look">
        <p>
          Some car, personal and consumer loans quote a{" "}
          <em>flat</em> rate: simple interest on the full amount for the whole
          term, even though you repay part of it every month. A 100,000 loan at
          a flat 10% for 3 years charges 30,000 of interest, so each of the 36
          monthly payments is 3,611. But by the last year you owe only a
          fraction of the 100,000, and you&apos;re still paying interest on all
          of it. Measured the usual way — on the balance you actually owe — that
          loan costs about 17.9% a year, not 10%.
        </p>
        <p>
          So when a lender quotes a flat rate, ask for the reducing-balance rate
          (the APR) before comparing it with anything else. And when you&apos;re
          the one earning interest, simple interest is the worse deal: the{" "}
          <Link href="/tools/compound-interest-calculator" className={link}>
            compound interest calculator
          </Link>{" "}
          shows how much more the same money earns when its interest earns
          interest too. Whichever side you&apos;re on,{" "}
          <Link href="/features/analytics" className={link}>
            knowing where your money goes each month
          </Link>{" "}
          is what frees up more of it.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
