import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { DepositTool } from "./_components/deposit-tool";

const SLUG = "fd-calculator";
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
    q: "How is FD interest calculated?",
    a: "Indian banks compound fixed deposit interest every quarter: A = P × (1 + r ÷ 4)^(4 × t), with r the yearly rate as a decimal and t the years. ₹1,00,000 at 7% for 5 years becomes ₹1,00,000 × 1.0175^20 = ₹1,41,478, so ₹41,478 is interest. If the tenure isn't a whole number of quarters, the leftover months earn simple interest.",
  },
  {
    q: "How is RD maturity calculated?",
    a: "Banks use the Indian Banks' Association formula M = R × ((1 + i)^n − 1) ÷ (1 − (1 + i)^(−1/3)), where R is the monthly instalment, i the rate ÷ 400 and n the number of quarters. It works out each instalment's quarterly compounding for the months it has left. ₹5,000 a month at 8% for a year matures at ₹62,647 — the same figure ICICI Bank publishes for its RD calculator.",
  },
  {
    q: "Is TDS deducted on FD interest?",
    a: "Yes, once the interest one bank pays you in a financial year passes ₹50,000, or ₹1,00,000 for senior citizens (the limits since April 2025). The bank deducts 10% of the interest, or 20% if it doesn't have your PAN. TDS isn't an extra tax: it counts towards your income tax, and if your total income is below the taxable limit you can give the bank a declaration so it deducts nothing.",
  },
  {
    q: "Why does a short FD earn simple interest?",
    a: "Banks compound only completed quarters, and deposits of less than six months are paid simple interest at maturity. ₹1,00,000 for 3 months at 7% earns ₹1,00,000 × 7 × 3 ÷ 1,200 = ₹1,750. The calculator switches to simple interest automatically for any fixed deposit under six months.",
  },
  {
    q: "FD or RD: which earns more?",
    a: "At the same rate an FD does, because all the money earns interest from day one. ₹60,000 in an FD at 8% for a year grows to ₹64,946; the same ₹60,000 paid into an RD as ₹5,000 a month grows to ₹62,647. An RD is for building savings out of monthly income when you don't have the lump sum.",
  },
  {
    q: "What is the effective annual yield?",
    a: "The rate that, paid once a year, would give the same result. Quarterly compounding makes a quoted 7% worth (1 + 0.07 ÷ 4)^4 − 1 = 7.19% a year. It's the fair way to compare deposits that compound at different frequencies.",
  },
];

export default function FdCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Want more to put into a deposit each month? See where your money goes."
      faqs={faqs}
      intro={
        <p>
          Work out the maturity amount and interest on a fixed deposit or a
          recurring deposit — compounded quarterly as Indian banks do, with the
          maturity date, the effective yield and an optional TDS estimate.
        </p>
      }
      tool={<DepositTool />}
    >
      <ToolSection title="How to use the FD & RD calculator">
        <p>
          Pick <strong className="font-medium text-foreground">Fixed deposit</strong>{" "}
          for a lump sum or{" "}
          <strong className="font-medium text-foreground">Recurring deposit</strong>{" "}
          for a monthly instalment, then enter the amount, the bank&apos;s yearly
          rate and the tenure in years and months. The start date (today unless
          you change it) gives the maturity date. The maturity amount, interest
          and yield update as you type, and the table underneath shows the value
          at the end of every year.
        </p>
        <p>
          Under <strong className="font-medium text-foreground">More options</strong>{" "}
          you can change the compounding — quarterly is what Indian banks use —
          and add a TDS rate to see the amount after tax is deducted. It works in
          any currency: the maths is the same wherever a bank compounds
          quarterly.
        </p>
      </ToolSection>

      <ToolSection title="The FD and RD formulas">
        <p>A fixed deposit compounded quarterly grows to:</p>
        <Formula>A = P × (1 + r ÷ 4)^(4 × t)</Formula>
        <p>
          P is the deposit, r the yearly rate as a decimal (7% = 0.07) and t the
          tenure in years. Banks compound only completed quarters and pay simple
          interest on any months left over, so 1 year 2 months is four quarters
          compounded and two months simple:
        </p>
        <Formula>1,00,000 × 1.0175^4 × (1 + 0.07 × 2 ÷ 12) = ₹1,08,436</Formula>
        <p>A recurring deposit uses the Indian Banks&apos; Association formula:</p>
        <Formula>
          M = R × ((1 + i)^n − 1) ÷ (1 − (1 + i)^(−1/3))
          <br />i = rate ÷ 400, n = months ÷ 3
        </Formula>
        <p>
          R is the monthly instalment. Each instalment is paid at the start of
          its month and compounds quarterly for the time it has left; the formula
          adds them all up.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: ₹1,00,000 for 5 years at 7%">
        <p>
          A fixed deposit of ₹1,00,000 at 7% for 5 years compounds 20 times, at
          1.75% a quarter:
        </p>
        <Formula>
          1,00,000 × 1.0175^20 = ₹1,41,478
          <br />Interest = ₹41,478 · effective yield 7.19%
        </Formula>
        <p>
          With TDS at 10%, about ₹4,148 of that interest is deducted over the
          five years, leaving ₹1,37,330. Put ₹5,000 a month into a recurring
          deposit at the same 7% for 5 years instead and you pay in ₹3,00,000,
          which matures at ₹3,59,664 — ₹59,664 of interest.
        </p>
      </ToolSection>

      <ToolSection title="Look at the rate after tax and inflation">
        <p>
          FD interest is added to your income and taxed at your slab rate. In the
          30% slab, a 7% deposit keeps about 4.9% after tax, before cess. If
          prices rise 5% a year, that leaves almost nothing in real terms — the
          deposit protects your money rather than growing it. That&apos;s the
          right job for an emergency fund or money you need on a known date; for
          goals ten years out, compare it with the{" "}
          <Link href="/tools/sip-calculator" className={link}>
            SIP calculator
          </Link>
          .
        </p>
        <p>
          When comparing banks, compare the effective yield rather than the
          headline rate, and remember most banks pay senior citizens a little
          more. The steadiest way to deposit more each month is to find it first
          —{" "}
          <Link href="/features/analytics" className={link}>
            seeing where your money goes each month
          </Link>{" "}
          is how most people do.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
