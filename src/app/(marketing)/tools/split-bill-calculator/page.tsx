import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { SplitBillTool } from "@/components/tools/split/split-bill-tool";
import { featureLink } from "@/lib/features";
import { marketingCta } from "@/lib/marketing";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { createMetadata } from "@/lib/seo";
import { SPLIT_SIGN_UP_HREF } from "@/lib/split-import";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";

const SLUG = "split-bill-calculator";
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
    q: "How do I split a bill between friends?",
    a: "Add everyone's name, then add each thing someone paid for: what it was, how much, who paid, and who it was for. The calculator keeps a running balance for each person and lists the payments that settle everyone up. For one restaurant bill that's a single expense split equally; for a trip, add each expense as it happens.",
  },
  {
    q: "How does it work out who pays whom?",
    a: "Everyone's balance is what they paid minus their share of everything. People who are owed money and people who owe it are then matched largest first, which gives a short list of payments that settles everyone — never more than one fewer than the number of people. It isn't guaranteed to be the shortest list possible, but it's the same list every time.",
  },
  {
    q: "Can I split a bill unequally?",
    a: "Yes. Besides splitting equally between the people you tick, you can enter an exact amount for each person (they must add up to the total) or a percentage each (they must add up to 100%). Someone who wasn't there can simply be left out of an expense.",
  },
  {
    q: "What happens to the odd cent?",
    a: "Amounts are worked out in whole cents (or paise, or yen), so 100 split three ways is 33.34 + 33.33 + 33.33. In an equal split the person who paid takes the extra cent first; in a percent split it goes to whoever's share was closest to rounding up. Everyone's shares always add up to exactly what was spent.",
  },
  {
    q: "Is it free, and do I need an account?",
    a: "It's free and needs no sign-up. Your group is kept in this browser as you go, so it's still here when you come back. You only need a free SpendChat account to share the group with the others — and that's free too, on every plan.",
  },
  {
    q: "Can everyone in the group see the balance?",
    a: `Save the group to SpendChat and add everyone's email: each person gets an invite — by email, or in the app if they already use SpendChat. Once they join, each person sees the same expenses and balances, can add what they paid for, and marks payments as paid — so the balance is always current, for groups of up to ${SPLIT_GROUP_MAX_PEOPLE} people. The group you built here comes with you when you sign up.`,
  },
  {
    q: "Is what I type stored anywhere?",
    a: "Only in your browser, until you choose to save it. The names and amounts stay on this device and aren't sent to SpendChat or to analytics. Start over clears it.",
  },
];

export default function SplitBillCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Going away together? Save the group and everyone sees the balance live."
      ctaHref={SPLIT_SIGN_UP_HREF}
      faqs={faqs}
      intro={
        <p>
          Add who&apos;s in and what each person paid for. You&apos;ll see everyone&apos;s balance and
          who pays whom to settle up — split equally, by exact amounts or by percent.
        </p>
      }
      tool={<SplitBillTool />}
    >
      <ToolSection title="How to split a bill with friends">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Name the group and pick its currency — one currency per group, like a trip&apos;s budget.</li>
          <li>Add everyone by name. You&apos;re first; press Enter to add the next person.</li>
          <li>
            Add each expense: what it was, how much, who paid, and who it was for. Untick anyone who
            wasn&apos;t there.
          </li>
          <li>
            Read off the answer on the right: each person&apos;s balance, and who should pay whom to
            settle it.
          </li>
          <li>Copy the summary into the group chat, or save the group so everyone can follow along.</li>
        </ol>
      </ToolSection>

      <ToolSection title="How the settle-up is worked out">
        <p>
          Each person&apos;s balance is what they paid minus their share of everything. A positive
          balance gets money back; a negative one owes it. The balances always add up to zero — every
          rupee someone is owed is a rupee someone else owes.
        </p>
        <p>
          Three friends rent a cabin for 3,000, which Asha pays, split equally. Ben buys groceries for
          600, also split three ways:
        </p>
        <Formula>
          Shares: 1,000 + 200 = 1,200 each
          <br />
          Asha: paid 3,000 − share 1,200 = gets back 1,800
          <br />
          Ben: paid 600 − share 1,200 = owes 600
          <br />
          Chloe: paid 0 − share 1,200 = owes 1,200
          <br />
          Settle up: Chloe pays Asha 1,200 · Ben pays Asha 600
        </Formula>
        <p>
          Two payments instead of four: rather than Ben and Chloe each paying Asha back for the cabin
          and Asha and Chloe each paying Ben for the groceries, the debts are netted first. The biggest
          debt is matched with the biggest credit, then the next, so a group of any size settles in at
          most one payment fewer than it has people. That&apos;s a short list, not always the shortest
          one possible — finding that is a much harder puzzle, and rarely saves more than a payment.
        </p>
      </ToolSection>

      <ToolSection title="Equal, exact or percent — which split to use">
        <p>
          <strong className="font-medium text-foreground">Equally</strong> suits most shared costs: the
          cabin, the taxi, the pizza. Untick whoever wasn&apos;t part of it — the friend who skipped
          dinner shouldn&apos;t pay for it.
        </p>
        <p>
          <strong className="font-medium text-foreground">Exact amounts</strong> fit a bill where
          everyone ordered their own thing. Enter what each person had; the calculator tells you what
          is left to assign until it adds up to the total, so a missing starter doesn&apos;t vanish.
        </p>
        <p>
          <strong className="font-medium text-foreground">Percent</strong> fits shares agreed up front —
          a 60/40 rent split between a bigger and a smaller room, or a couple and a single in the same
          holiday house. Percentages must add up to 100%, and the money is rounded to the cent with
          nothing lost.
        </p>
        <p>
          Splitting a bill in another currency? The{" "}
          <Link href={toolPath("currency-converter")} className={link}>
            currency converter
          </Link>{" "}
          shows it in yours, and the{" "}
          <Link href={toolPath("percentage-calculator")} className={link}>
            percentage calculator
          </Link>{" "}
          works out a tip.
        </p>
      </ToolSection>

      <ToolSection title="Keep the whole group on the same page">
        <p>
          A calculator answers the question once. A trip asks it every day: someone pays for lunch,
          someone fills the tank, and the screenshot you sent on Monday is wrong by Tuesday.
        </p>
        <p>
          <Link href={featureLink("split")} className={link}>
            Split in SpendChat
          </Link>{" "}
          keeps the group going. Everyone gets an invite and joins in a click. Anyone can add
          what they paid for, and the balances update for the whole group — so nobody keeps the
          spreadsheet, and nobody has to chase anyone. Mark a payment as paid and it drops off the
          list. Your own share of any expense can go straight into your own expense tracking, too.
        </p>
        <p>
          It&apos;s free for everyone on every plan, for groups of up to {SPLIT_GROUP_MAX_PEOPLE} people —
          and the group you built here comes with you when you sign up. You only add the emails.
        </p>
        <Button asChild className={marketingCta}>
          <Link
            href={SPLIT_SIGN_UP_HREF}
            data-track-event="cta_click"
            data-track-params={JSON.stringify({ location: `tool_${SLUG}_feature`, label: "save_group_free" })}
          >
            Save my group, free <ArrowRight />
          </Link>
        </Button>
      </ToolSection>
    </ToolPage>
  );
}
