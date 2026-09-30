import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { DaysBetweenTool } from "./_components/days-between-tool";

const SLUG = "days-between-dates";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How do I calculate the number of days between two dates?",
    a: "Subtract the earlier date from the later one. Enter both dates above and the total appears straight away, along with the same span in weeks, months and years, and the number of working days in it.",
  },
  {
    q: "Does the count include the start and end date?",
    a: "By default it counts the start date but not the end date, so 1 March to 2 March is 1 day — the way a hotel counts nights. Tick “Include the end date” to count both ends, which adds one day; that's how days of leave or a rental are usually counted.",
  },
  {
    q: "Are public holidays taken out of the working days?",
    a: "No. Working days here are Monday to Friday; public holidays differ by country, state and even employer, so subtract any that fall in your range yourself. With “Include the end date” ticked, the working-day count matches a spreadsheet's NETWORKDAYS function.",
  },
  {
    q: "How do I add or subtract days from a date?",
    a: "Switch to “Add / subtract days”, pick the date, choose Add or Subtract and type the number of days. Tick “Count working days only” to skip weekends — 10 working days after Friday 2 October 2026 is Friday 16 October.",
  },
  {
    q: "How many days until payday or until my bill is due?",
    a: "Set the start date to today (the Today button does it in one tap) and the end date to payday or the due date. The result tells you how many days you have to stretch your money, and how many of them are working days.",
  },
  {
    q: "Does it handle leap years and time zones?",
    a: "Yes. It works on calendar dates, so 29 February is counted in leap years and never in others, and daylight-saving changes or your time zone can't add or lose a day. Dates from year 1 to 9999 are supported.",
  },
];

export default function DaysBetweenDatesPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Counting the days to payday?"
      faqs={faqs}
      category="UtilitiesApplication"
      intro={
        <p>
          Count the days, weeks and months between two dates, or add days to a
          date — with working days counted too. Handy for bill due dates, notice
          periods and the countdown to payday.
        </p>
      }
      tool={<DaysBetweenTool />}
    >
      <ToolSection title="How to use the days between dates calculator">
        <p>
          Choose <strong className="font-medium text-foreground">Between two dates</strong> and
          enter a start and an end date. The total updates as you pick, with the
          same span in weeks, months and years, the working days in it, and the
          day of the week each date falls on. Swap flips the dates round, and
          ticking <em>Include the end date</em> counts both ends.
        </p>
        <p>
          Choose <strong className="font-medium text-foreground">Add / subtract days</strong> to
          find the date a number of days before or after another — a due date,
          the end of a notice period, a deadline in working days. Copy link
          saves the dates you picked; a date you leave on today moves with the
          calendar, so a shared link to a deadline works as a countdown.
        </p>
      </ToolSection>

      <ToolSection title="How the days are counted">
        <p>
          Each date is turned into a day number and the two are subtracted.
          Because it counts calendar days rather than hours, leap years are
          handled and daylight saving can&apos;t shift the answer.
        </p>
        <Formula>
          Days = end date − start date
          <br />
          Including the end date = days + 1
          <br />
          Weeks = days ÷ 7, the remainder in days
          <br />
          Working days = days in the span falling Monday to Friday
        </Formula>
        <p>
          Months and years are counted the way age is: a month is complete when
          the same day of the month comes round again, and whatever is left over
          is shown in days.
        </p>
      </ToolSection>

      <ToolSection title="Worked examples: payday, notice periods and interest">
        <p>
          <strong className="font-medium text-foreground">Days until payday.</strong> It&apos;s
          Wednesday 16 September 2026 and you&apos;re paid on Wednesday 30
          September. That&apos;s 14 days, 10 of them working days — the
          number to divide what&apos;s left in your account by.
        </p>
        <p>
          <strong className="font-medium text-foreground">A notice period.</strong> Add 90
          days to Friday 15 January 2027 and you land on Thursday 15 April 2027.
          If your contract counts the day notice is given as day one, the last
          day is the day before, 14 April — which is exactly the inclusive vs
          exclusive question below.
        </p>
        <p>
          <strong className="font-medium text-foreground">Interest by the day.</strong> A
          short-term loan of 10,000 runs from 10 January to 25 April 2027:
          105 days. Many lenders charge interest per actual day, so at 12% a
          year that&apos;s 10,000 × 12% × 105 ÷ 365 = 345.21.
        </p>
      </ToolSection>

      <ToolSection title="Inclusive or exclusive — and why months are slippery">
        <p>
          Whether a count includes the last day changes the answer by one, and
          different things count differently. Hotel stays and loan interest
          usually count one end only; days of leave count both. Bills
          &quot;due within 30 days&quot; normally mean 30 days after the invoice date.
          Notice periods depend on your contract and local law. When a day
          matters — a payment deadline, a last day at work — check which
          convention applies.
        </p>
        <p>
          &quot;Months between two dates&quot; has no single answer, because months run
          from 28 to 31 days. This calculator treats a month as complete when
          the same date comes round again, so 31 January to 28 February is 28
          days, not a month, while 31 January to 1 March is exactly one.
          Contracts often set their own rule — a payment due on the 31st is
          usually taken on the last day of shorter months — so for anything
          binding, count in days.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
