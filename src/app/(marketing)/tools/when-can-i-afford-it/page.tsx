import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { AffordTool } from "./_components/afford-tool";

const SLUG = "when-can-i-afford-it";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How long will it take to save for something?",
    a: "Take what you still need — the price minus what you've already saved — and divide it by what you can save each month, then round up to a whole month. A $12,000 car with $2,000 saved and $400 a month going in takes 10,000 ÷ 400 = 25 months. The calculator does this for you and gives the month you'll get there.",
  },
  {
    q: "How much should I save each month to reach a goal by a date?",
    a: "Divide what you still need by the number of whole months until the date. $10,000 in two years is $416.67 a month, or $96.15 a week. Choose \"How much to save?\" above and pick the date — the calculator counts the months and weeks from today.",
  },
  {
    q: "Does interest on my savings make much difference?",
    a: "A little, on goals a year or two away. Saving $400 a month at 4% gets you to $12,000 in 24 months instead of 25, with about $543 of it paid by the bank. The amount you save each month matters far more than the rate — add a rate under More options to see the difference for your goal.",
  },
  {
    q: "Is it better to save weekly or monthly?",
    a: "The yearly total is what counts, and it's the same either way: a month is about 4.33 weeks (52 ÷ 12), so $416.67 a month is roughly $96.15 a week. Saving weekly can feel easier because each amount is smaller and it lines up with a weekly pay cheque or budget.",
  },
  {
    q: "How can I reach my savings goal faster?",
    a: "Save a little more each week. The calculator suggests a small, round cut — about a tenth of what you already save — and shows how much sooner it gets you there. On the car above, cutting $9 a week from spending gets you there about 10 weeks sooner: 23 months instead of 25.",
  },
  {
    q: "What if the price goes up before I buy it?",
    a: "For goals more than a year away, it often does. Add the rise you expect to the price: at 3% a year, a $12,000 car costs about $12,731 two years from now (12,000 × 1.03²). Enter that as the price to see the plan that still gets you there.",
  },
];

export default function WhenCanIAffordItPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Looking for that extra each week? See what your spending really goes on."
      faqs={faqs}
      intro={
        <p>
          Find out when you can afford something at the rate you save — or how
          much to put aside each month or week to buy it by a date. With optional
          interest, in your currency.
        </p>
      }
      tool={<AffordTool />}
    >
      <ToolSection title="How to use the savings goal calculator">
        <p>
          Enter what the thing costs and what you&apos;ve already saved towards
          it. To find out <strong className="font-medium text-foreground">when you can buy it</strong>,
          add what you can save each month: you&apos;ll see how many months it
          takes, the month you&apos;ll get there, and how full your pot is today.
          To find out <strong className="font-medium text-foreground">how much to save</strong>,
          switch mode and pick the date you want it by instead — you&apos;ll get
          the amount per month, per week and roughly per day.
        </p>
        <p>
          If your savings earn interest, add the yearly rate under More options.
          Copy link shares the goal with whoever you&apos;re saving with, and the
          currency travels with it.
        </p>
      </ToolSection>

      <ToolSection title="The savings goal formula">
        <p>
          With P the price, S what you&apos;ve saved and M what you save each
          month, the months until you can afford it are:
        </p>
        <Formula>
          n = (P − S) ÷ M &nbsp;(rounded up to a whole month)
        </Formula>
        <p>
          With interest at a monthly rate i (the yearly rate ÷ 12), your savings
          grow as well, and the number of months becomes:
        </p>
        <Formula>n = ln((P × i + M) ÷ (S × i + M)) ÷ ln(1 + i)</Formula>
        <p>
          Working the other way — the monthly amount that reaches P in n months
          — is (P − S) ÷ n without interest, and with it:
        </p>
        <Formula>M = (P − S × (1 + i)^n) × i ÷ ((1 + i)^n − 1)</Formula>
        <p>
          The calculator assumes you save at the end of each month (or week), as
          a standing order after payday would.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: saving for a $12,000 car">
        <p>
          You have $2,000 saved and can put aside $400 a month. That leaves
          $10,000 to find:
        </p>
        <Formula>
          10,000 ÷ 400 = 25 months
          <br />At 4% interest: 24 months, $543 of it interest
        </Formula>
        <p>
          Want it in exactly two years instead? You need $10,000 ÷ 24 = $416.67 a
          month, or $96.15 a week — or $394.25 a month if your savings earn 4%.
          And if you cut $9 a week from what you spend and save it too, you
          reach the $12,000 about 10 weeks sooner: 23 months instead of 25.
        </p>
      </ToolSection>

      <ToolSection title="Small weekly cuts move the date">
        <p>
          A savings goal has two levers: the amount you save and the time you
          give it. The date is usually fixed by life — a trip, a deposit, a
          replacement laptop — so the lever you actually control is the amount,
          and it&apos;s easier to find in small weekly pieces than in one big
          monthly number. $9 a week is a takeaway coffee or two; over two years
          it&apos;s more than two months of saving.
        </p>
        <p>
          The hard part is knowing which spending to trim.{" "}
          <Link href="/features/categories" className="font-medium text-foreground underline underline-offset-4">
            Tracking your spending by category
          </Link>{" "}
          shows where the weekly money goes, so the cut comes from something you
          won&apos;t miss.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
