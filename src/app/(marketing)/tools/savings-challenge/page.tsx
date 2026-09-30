import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { SavingsChallengeTool } from "./_components/savings-challenge-tool";

const SLUG = "savings-challenge";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How does the 52-week savings challenge work?",
    a: "You save a little more every week for a year: 1 in week 1, 2 in week 2, and so on up to 52 in week 52. Each week is only one unit more than the last, so it's easy to start, and by the end of the year you've saved 1,378 — $1,378 if you start with $1, £6,890 if you start with £5.",
  },
  {
    q: "How much will I save with the 52-week challenge?",
    a: "1,378 times your week-1 amount. Starting at $1 gives $1,378; $2 gives $2,756; ₹100 gives ₹1,37,800. The tracker above works it out in whatever currency you pick, and shows the total before you start.",
  },
  {
    q: "What is the 100-envelope challenge?",
    a: "You number 100 envelopes from 1 to 100, draw one at random, and put that many units of money in it — envelope 37 gets 37. Fill all 100 and you've saved 5,050 times the base amount: $5,050 at $1 an envelope. One a day takes 100 days; two a week takes about a year. Use Draw an envelope above to pick one for you.",
  },
  {
    q: "Is the reverse 52-week challenge easier?",
    a: "For many people, yes. It starts with the biggest week and saves one unit less each week, so three quarters of the total (1,027 of 1,378) is saved in the first 26 weeks, while motivation is high. Start it in January and the small weeks land in November and December, when money is tightest.",
  },
  {
    q: "Can I do a savings challenge in pounds, euros or rupees?",
    a: "Yes — pick any currency and the amounts, totals and printable tracker all use it. Most printable trackers are only in dollars; here a ₹100 challenge or a €2 challenge works the same way, and Quick pick sets a common step size in one tap.",
  },
  {
    q: "Where are my ticks saved?",
    a: "Only in this browser, on this device — nothing is sent to our servers. Each challenge keeps its own ticks, so switching between the 52-week and envelope challenges doesn't lose either. Copy link shares the challenge, not your ticks. To keep a copy anywhere, use Print tracker and tick it off on paper or save it as a PDF.",
  },
];

export default function SavingsChallengePage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Found the money for this week? See where the rest of it goes."
      faqs={faqs}
      intro={
        <p>
          Start the 52-week savings challenge, its reverse, the 100-envelope
          challenge or your own goal — in any currency. Tick off each week as you
          save, watch the total grow, and print a tracker for the fridge.
        </p>
      }
      tool={<SavingsChallengeTool />}
    >
      <ToolSection title="How to use the savings challenge tracker">
        <p>
          Pick a challenge and set the amount for the smallest step — $1 is the
          classic, but $5, £2 or ₹100 work just as well. Choose your currency and
          a start date, and every week&apos;s amount and date appear in the
          tracker below. Tick a week (or an envelope) when the money is in; the
          total saved and the percentage done update as you go, and the week
          you&apos;re in is marked so you can see if you&apos;re on track.
        </p>
        <p>
          For the envelope challenge, <strong className="font-medium text-foreground">Draw an envelope</strong>{" "}
          picks one of the envelopes you haven&apos;t filled yet at random. For
          a goal of your own, choose Custom and enter the amount and the number
          of weeks. <strong className="font-medium text-foreground">Print tracker</strong>{" "}
          prints a clean sheet — on A4 or US Letter — with a box to tick for
          every step and the running total beside each week.
        </p>
      </ToolSection>

      <ToolSection title="How much you save: the formula">
        <p>
          In the 52-week challenge, week n saves n times the base amount b. So the
          total is the base amount times the sum of 1 to 52:
        </p>
        <Formula>
          Total = b × n × (n + 1) ÷ 2
          <br />52 weeks: b × 52 × 53 ÷ 2 = 1,378 × b
          <br />100 envelopes: b × 100 × 101 ÷ 2 = 5,050 × b
        </Formula>
        <p>
          The reverse challenge saves the same amounts in the opposite order, so
          the total is identical. A custom goal is divided by the number of
          weeks and rounded to a tidy figure, with the last week taking up the
          difference: $1,000 over 52 weeks is $19.20 a week and $20.80 in the
          last week.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: the £5 challenge">
        <p>
          Start the 52-week challenge at £5. Week 1 is £5, week 2 is £10, and
          week 52 is £260. Over the year you save:
        </p>
        <Formula>£5 × 1,378 = £6,890 &nbsp;(an average of £132.50 a week)</Formula>
        <p>
          The catch is where the money falls. After 26 weeks you&apos;ve saved
          only £1,755 — about a quarter of the total — so the second half asks
          for £5,135, including £260 in the last week of the year. Run it in
          reverse and those numbers swap: £5,135 in the first half, £1,755 in
          the second, and just £5 in the final week.
        </p>
      </ToolSection>

      <ToolSection title="Choosing the challenge that will stick">
        <p>
          The classic challenge is easy to start and hard to finish: the biggest
          weeks land at the end of the year, right alongside holiday spending.
          The reverse version is harder for a month or two and easier after
          that. The envelope challenge suits people who like a game — drawing a
          small envelope on a tight week and a big one after payday — but its
          total is almost four times bigger, so try a smaller base amount. And
          if a round number matters more than the ritual, a custom goal spreads
          it evenly.
        </p>
        <p>
          Whichever you choose, the weekly amount has to come from somewhere.{" "}
          <Link href="/features/categories" className="font-medium text-foreground underline underline-offset-4">
            Seeing your spending by category
          </Link>{" "}
          is the quickest way to find it — and to check the challenge
          isn&apos;t quietly going on a credit card.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
