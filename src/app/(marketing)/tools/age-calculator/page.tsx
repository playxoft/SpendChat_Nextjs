import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { AgeTool } from "./_components/age-tool";

const SLUG = "age-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How do I calculate my exact age?",
    a: "Count the birthdays you've had for the years, then the whole months since your last birthday, then the days since that. Enter your date of birth above and it does all three, plus your age in total months, weeks and days.",
  },
  {
    q: "How many days old am I?",
    a: "Subtract your date of birth from today's date. Someone born on 14 March 1990 is 13,347 days old on 28 September 2026 — the Total days row shows yours.",
  },
  {
    q: "How is age worked out for someone born on 29 February?",
    a: "In years without a 29 February, this calculator puts the birthday on 1 March — the first day on which a full year has passed. Some legal systems use 28 February instead, so check the local rule when it matters for a document or a deadline.",
  },
  {
    q: "Can I find my age on a past or future date?",
    a: "Yes. Change “Age on” to any date: your age on a retirement date, when an insurance policy starts, or on a school's admission cut-off date. The Today button switches it back.",
  },
  {
    q: "Why do the months and days sometimes look odd around month ends?",
    a: "Months have 28 to 31 days, so a month counts as complete when the same day of the month comes round again. For someone born on the 31st, that day doesn't exist in shorter months, so the monthly anniversary falls on the 1st of the next month instead.",
  },
  {
    q: "Does the day I was born count as a day?",
    a: "No — on the day you're born you're 0 days old, and 1 day old the day after, the same way birthdays work. That's also how the total months and weeks are counted.",
  },
];

export default function AgeCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Planning for the years ahead? It starts with knowing what you spend."
      faqs={faqs}
      category="UtilitiesApplication"
      intro={
        <p>
          Your exact age in years, months and days — plus your age in weeks and
          days, the day of the week you were born, and a countdown to your next
          birthday.
        </p>
      }
      tool={<AgeTool />}
    >
      <ToolSection title="How to use the age calculator">
        <p>
          Enter a date of birth. &quot;Age on&quot; starts at today, so you see the
          exact age straight away, with the totals and the next birthday
          underneath. To find the age on another day — a retirement date, the
          start of a policy, a school&apos;s admission cut-off — pick that date
          instead; it works for the past and the future. Copy link shares the
          dates you entered.
        </p>
      </ToolSection>

      <ToolSection title="How age is calculated">
        <p>Age is counted in completed units, largest first:</p>
        <Formula>
          Years = birthdays completed
          <br />
          Months = monthly anniversaries since the last birthday
          <br />
          Days = days since the last monthly anniversary
          <br />
          Total days = &quot;age on&quot; date − date of birth
          <br />
          Total weeks = total days ÷ 7, the remainder in days
        </Formula>
        <p>
          It works on calendar dates, so leap years are counted exactly and
          your time zone can&apos;t move the answer by a day.
        </p>
      </ToolSection>

      <ToolSection title="A worked example">
        <p>
          Someone born on Wednesday 14 March 1990 checks their age on 28
          September 2026. Their last birthday was 14 March 2026, their 36th.
          Six monthly anniversaries have passed since (the last on 14
          September), and 14 days since that: 36 years, 6 months and 14 days.
          In total that&apos;s 13,347 days, or 1,906 weeks and 5 days, and the
          next birthday is Sunday 14 March 2027 — 167 days away.
        </p>
        <p>
          Born on 29 February 2000 instead? In 2027 there&apos;s no 29
          February, so they turn 27 on 1 March 2027; the real date comes round
          again in 2028.
        </p>
      </ToolSection>

      <ToolSection title="How age is counted around the world">
        <p>
          Most of the world counts age in completed years: you&apos;re 0 at
          birth and turn 1 on your first birthday. That&apos;s the age used for
          legal thresholds — voting, retirement and pension ages, insurance
          premiums — and it&apos;s what this calculator shows. Traditional East
          Asian reckoning counts differently, starting at 1 at birth and adding a
          year at the New Year; South Korea moved its official documents to
          international age in 2023.
        </p>
        <p>
          Age thresholds are also money milestones. The years between your age
          today and a retirement age are the years compounding has to work
          with, which is why the same savings habit started five years earlier
          ends up noticeably bigger.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
