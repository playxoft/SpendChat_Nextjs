import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { FreelanceRateTool } from "./_components/freelance-rate-tool";

const SLUG = "freelance-rate-calculator";
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
    q: "How much should I charge per hour as a freelancer?",
    a: "Start from what you need, not from what others charge. Add the take-home pay you want, the tax on it and your business expenses to get the revenue you need, then divide by the hours you can actually bill in a year. Wanting $60,000 after 25% tax, with $6,000 of expenses, 6 weeks off and 25 billable hours a week, gives a minimum of $74.78 an hour. That's your floor — charge more where the market allows.",
  },
  {
    q: "How do I calculate my day rate?",
    a: "Multiply your hourly rate by the hours in the working day you're selling — usually 8, though some clients mean 7.5. At $74.78 an hour, an 8-hour day is about $598. Quote a day rate when the work is hard to estimate in hours; it also saves you tracking every half-hour.",
  },
  {
    q: "Why can't I just divide a salary by 2,080 hours?",
    a: "Because 2,080 is 52 weeks of 40 hours, and a freelancer bills neither. $60,000 ÷ 2,080 is $28.85 an hour — but that ignores tax you now pay yourself, your expenses, unpaid holidays and sick days, and the hours spent on admin and finding work. Once those are in, the same take-home needs $74.78 an hour, over two and a half times as much.",
  },
  {
    q: "How many billable hours does a freelancer really work?",
    a: "Usually 20 to 30 a week, not 40. The rest goes on email, invoicing, proposals, marketing, learning and gaps between projects — all work, none of it billable. 25 is a sensible starting point; track your own weeks for a month and use the real number.",
  },
  {
    q: "Should I add a profit margin on top?",
    a: "It's worth it. A margin is a share of every invoice you keep in the business, on top of your pay — for slow months, late payers, new equipment and growth. With a 10% margin the example above rises from $74.78 to $86.29 an hour. Add one under More options; 10–20% is common.",
  },
  {
    q: "What is the monthly retainer equivalent?",
    a: "The revenue you need each year divided by 12 — what a single client would pay each month for all your billable time. In the example it's about $7,167. Use it to sanity-check a retainer offer: a client asking for half your time should be paying about half that.",
  },
];

export default function FreelanceRateCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      category="BusinessApplication"
      cta="Charging the right rate? See where the money goes once it's paid."
      faqs={faqs}
      intro={
        <p>
          Work out what to charge as a freelancer or consultant: the minimum hourly
          rate and day rate that cover the take-home pay you want, your taxes,
          your expenses and your time off.
        </p>
      }
      tool={<FreelanceRateTool />}
    >
      <ToolSection title="How to use the freelance rate calculator">
        <p>
          Enter the take-home pay you want for the year — after tax, what
          you&apos;d like to live on — and what the business costs you each year:
          software, equipment, insurance, an accountant, a desk. Then your
          overall tax rate, the weeks you won&apos;t work (holidays, public
          holidays and sick days) and the hours a week you can actually bill.
          The rate updates as you type.
        </p>
        <p>
          The result is the minimum you can charge and still hit your number, as
          an hourly rate, a day rate and a monthly retainer, with a table of
          where each hour&apos;s rate goes. Under{" "}
          <strong className="font-medium text-foreground">More options</strong>{" "}
          you can add a profit margin and change the length of a working day.
          Once you have a rate, put it on a{" "}
          <Link href="/tools/quotation-generator" className={link}>
            quotation
          </Link>{" "}
          for your next client and bill the work with the{" "}
          <Link href="/tools/invoice-generator" className={link}>
            free invoice generator
          </Link>
          .
        </p>
      </ToolSection>

      <ToolSection title="The freelance rate formula">
        <p>
          Work backwards from the take-home you want to the revenue that pays for
          it. Tax is charged on profit (revenue minus expenses), and a margin is
          a share of revenue you keep:
        </p>
        <Formula>
          Revenue = (take-home + (1 − t) × expenses) ÷ (1 − t − m)
          <br />
          Billable hours = (52 − weeks off) × hours per week
          <br />
          Hourly rate = revenue ÷ billable hours
          <br />
          Day rate = hourly rate × hours per day
        </Formula>
        <p>
          t is your tax rate and m your margin, both as decimals (25% = 0.25).
          With no margin the first line is simply take-home ÷ (1 − t) +
          expenses. The monthly retainer equivalent is the revenue ÷ 12.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: $60,000 take-home">
        <p>
          You want to take home $60,000 a year. The business costs $6,000 a
          year, your taxes come to 25% of profit, you take 6 weeks off and you
          bill 25 hours a week.
        </p>
        <Formula>
          Revenue = 60,000 ÷ 0.75 + 6,000 = $86,000
          <br />
          Billable hours = (52 − 6) × 25 = 1,150
          <br />
          Hourly rate = 86,000 ÷ 1,150 = $74.78
          <br />
          Day rate = 74.78 × 8 = $598
        </Formula>
        <p>
          Of every $74.78 hour, $52.17 is your take-home, $17.39 is tax and $5.22
          pays for expenses. A single client taking all your time would pay
          about $7,167 a month. Add a 10% margin and the revenue needed becomes
          $99,231, or $86.29 an hour.
        </p>
      </ToolSection>

      <ToolSection title="Why the billable hours default is 25, not 40">
        <p>
          The number that surprises people most is billable hours. An employee
          is paid for every hour at their desk; a freelancer is paid only for
          the hours a client pays for. Invoicing, email, proposals, marketing,
          bookkeeping and the gaps between projects all take time, and none of
          it can be billed. Most freelancers bill 20 to 30 hours in a full week.
        </p>
        <p>
          It changes the answer a lot. The example above needs $74.78 an hour at
          25 billable hours a week, but only $46.74 if you could bill all 40 — and
          if you price for 40 while billing 25, you end the year well short. Set
          your rate from the hours you really bill, then protect them: send
          quotes and invoices promptly, and{" "}
          <Link href="/features/analytics" className={link}>
            keep an eye on where your money goes each month
          </Link>{" "}
          so a slow month doesn&apos;t catch you out.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
