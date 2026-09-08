import Link from "next/link";
import {
  ComparePage,
  CompareSection,
  CompareVerdict,
  type CompareRow,
} from "@/components/marketing/compare-page";
import { getComparison } from "@/lib/compare";
import { featureLink } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "splitwise";
const c = getComparison(SLUG)!;

export const metadata = createMetadata({
  title: c.title,
  description: c.description,
  path: `/compare/${SLUG}`,
});

const rows: CompareRow[] = [
  {
    label: "Made for",
    spendchat: "Recording what you spend and earn, alone or with people you live with.",
    competitor: "Settling who owes whom after shared expenses: trips, flatmates, couples.",
  },
  {
    label: "Adding an entry",
    spendchat: "Type it like a message, paste a whole day and confirm the drafts, or say it.",
    competitor: "A form per expense: amount, payer, how to split it across the group.",
  },
  {
    label: "Personal spending",
    spendchat: "The main feature. Profiles for Personal, Home, Business.",
    competitor:
      "No dedicated view. Splitwise suggests a group with only yourself in it.",
  },
  {
    label: "Bank connection",
    spendchat: "None, by design.",
    competitor: "Card transaction import on Pro, US only.",
  },
  {
    label: "Price",
    spendchat: "Free. No paid tier.",
    competitor:
      "Free with ads and a daily expense limit. Pro removes both; the price isn't listed on splitwise.com (App Store tiers run from $2.99 to $39.99).",
  },
  {
    label: "Platforms",
    spendchat: "Any browser, phone or desktop. Nothing to install.",
    competitor: "iOS, Android and web apps.",
  },
  {
    label: "Sharing",
    spendchat: "Workspaces with viewer, editor and admin roles; invite by email.",
    competitor: "Groups and friendships; everyone in a group edits the same ledger.",
  },
  {
    label: "Export",
    spendchat: "Everything to CSV, or print any view to PDF.",
    competitor: "One CSV per group or friendship; a whole-account JSON backup is Pro.",
  },
  {
    label: "Receipts",
    spendchat: "Attach the photo to any entry.",
    competitor: "Scanning and itemising on Pro.",
  },
  {
    label: "Code",
    spendchat: "Open source, AGPL-3.0.",
    competitor: "Proprietary.",
  },
];

const faqs = [
  {
    q: "Can Splitwise track my personal expenses?",
    a: "Not as a first-class feature. Splitwise's own answer to the request is to create a group with yourself as the only member and log expenses there. It works, but you get a group ledger, not a spending record with categories, a monthly balance and reports built around one person.",
  },
  {
    q: "Can SpendChat split a bill between friends?",
    a: "No. SpendChat records the transaction and, in a shared workspace, shows who added it, but it does not compute who owes whom or settle balances between people. If splitting is the job, Splitwise is the right tool, and many people use both.",
  },
  {
    q: "Does the free Splitwise plan limit how many expenses I can add?",
    a: "Yes. Splitwise's knowledge base says the free tier has a daily expense limit and that Pro removes it. Splitwise does not publish the number, so we don't either.",
  },
  {
    q: "Is SpendChat really free with no catch?",
    a: "There is no paid tier and no ads. SpendChat is open source under the AGPL, the hosted app is free to use, and you can export everything to CSV at any time. If pricing ever changes it will be announced on the pricing page first.",
  },
];

export default function SplitwiseComparisonPage() {
  return (
    <ComparePage
      slug={SLUG}
      rows={rows}
      faqs={faqs}
      relatedFeatures={["workspaces", "multiple-profiles", "export-and-print", "chat-expense-tracker"]}
      intro={
        <>
          <p>
            These two get compared because both involve money and other people, but they
            answer different questions. Splitwise answers &ldquo;who owes whom?&rdquo; after
            a trip or a shared flat. SpendChat answers &ldquo;where did my money go this
            month?&rdquo;, for you alone or for a household logging into one feed.
          </p>
        </>
      }
    >
      <CompareSection title="What Splitwise is for">
        <p>
          Splitwise is a ledger of shared expenses. Someone pays for dinner, enters the
          amount and how it splits, and the app keeps a running balance between every pair
          of people in the group, simplifying the debts so settling up is one payment
          instead of five. It has groups for flatmates, trips and couples, recurring bills,
          unequal splits, and more than a hundred currencies, on iOS, Android and the web.
          For that job it is very good, and nothing on this page suggests otherwise.
        </p>
        <p>
          The free plan carries ads and a daily limit on how many expenses you can add.
          Splitwise Pro removes both and adds card transaction import (US only), receipt
          scanning with itemising, charts by category, currency conversion and search.
          Splitwise doesn&apos;t list the Pro price on its website; the App Store shows
          tiers from $2.99 to $39.99 without labelling the billing period.
        </p>
      </CompareSection>

      <CompareSection title="Where it stops">
        <p>
          Splitwise is not built to track what you spend on your own. Asked for a personal
          expense feature, Splitwise&apos;s team suggested making a group with yourself as
          its only member. That gives you a list, but not categories you chose, a monthly
          balance, or a report of your own spending across everything you do. Export is
          also per group: one CSV for each group or friendship, and a whole-account backup
          only on Pro.
        </p>
        <p>
          The other gap is entry itself. Every Splitwise expense is a form, because a
          split needs a payer and a rule. That is right for a shared dinner and heavy for
          the forty small purchases a week that are only yours.
        </p>
      </CompareSection>

      <CompareSection title="What SpendChat does instead">
        <p>
          SpendChat is a{" "}
          <Link href={featureLink("chat-expense-tracker")} className="underline underline-offset-4">
            record of spending that feels like a chat
          </Link>
          : type &ldquo;coffee 120&rdquo;, pick a category, send, and the month&apos;s
          balance updates above the feed. Paste a whole day in one message and it becomes
          separate drafts you confirm one by one. Hold a key and say it. Profiles keep
          Personal, Home and Business apart, and a{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            workspace
          </Link>{" "}
          lets a partner or family log into the same feed with viewer, editor or admin
          rights, each entry labelled with who added it.
        </p>
        <p>
          What it does not do is arithmetic between people. There is no &ldquo;you owe
          Priya 340&rdquo;. If your household wants one shared record of what was spent,
          SpendChat fits; if three friends want to settle a trip, Splitwise does.
        </p>
      </CompareSection>

      <CompareVerdict
        competitor={c.competitor}
        theirs={[
          "Debts between people simplified into the fewest payments, which is the whole point of the app.",
          "A group ledger everyone edits, with settle-up links to payment apps.",
          "Receipt scanning that assigns line items to people, on Pro.",
        ]}
        ours={[
          "Your own spending as the main feature, with categories, profiles and a monthly balance, not a workaround group.",
          "Entry in seconds: a message, a pasted day, or your voice, with no daily limit and no ads.",
          "Everything exported to CSV in one go, and code you can read.",
        ]}
      />

      <CompareSection title="Using both">
        <p>
          The common pattern is Splitwise for the trip and SpendChat for the month. When a
          Splitwise balance settles, the amount you actually paid is one line in your
          SpendChat feed, categorised the way you think about it. Neither app needs a bank
          login for any of this.
        </p>
      </CompareSection>
    </ComparePage>
  );
}
