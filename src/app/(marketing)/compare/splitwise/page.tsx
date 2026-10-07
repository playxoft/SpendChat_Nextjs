import Link from "next/link";
import {
  ComparePage,
  CompareSection,
  CompareVerdict,
  type CompareRow,
} from "@/components/marketing/compare-page";
import { getComparison } from "@/lib/compare";
import { featureLink } from "@/lib/features";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { createMetadata } from "@/lib/seo";
import { toolPath } from "@/lib/tools";

const SLUG = "splitwise";
const c = getComparison(SLUG)!;
const MAX = SPLIT_GROUP_MAX_PEOPLE;
const link = "underline underline-offset-4";

export const metadata = createMetadata({
  title: c.title,
  description: c.description,
  path: `/compare/${SLUG}`,
});

const rows: CompareRow[] = [
  {
    label: "Made for",
    spendchat: "Recording what you spend and earn, alone or with people you live with — and splitting costs with friends.",
    competitor: "Settling who owes whom after shared expenses: trips, flatmates, couples.",
  },
  {
    label: "Splitting with friends",
    spendchat: `Split groups of up to ${MAX} people, free on every plan: equal, exact or percent splits, balances, who pays whom, and Mark as paid.`,
    competitor: "The whole app: groups and one-to-one friendships, unequal splits, recurring bills, settle-up links to payment apps.",
  },
  {
    label: "Adding an entry",
    spendchat: "Type it like a message, paste a whole day and confirm the drafts, or say it. A shared expense is a short form.",
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
    spendchat: "Free plan with no ads. Paid plans add more AI, storage and people; Pro adds voice entry.",
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
    spendchat: "Split groups for trips and flats; workspaces with viewer, editor and admin roles for shared books. Invite by email.",
    competitor: "Groups and friendships; everyone in a group edits the same ledger.",
  },
  {
    label: "Currencies",
    spendchat: "One currency per split group, and per workspace. No conversion.",
    competitor: "More than a hundred currencies; currency conversion on Pro.",
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
    a: `Yes. A split group holds up to ${MAX} people and is free on every plan: split each expense equally, by exact amounts or by percent, see everyone's balance and who pays whom, and press Mark as paid when someone settles. SpendChat records payments; it doesn't send money or link to payment apps. The free split bill calculator does the same maths without an account.`,
  },
  {
    q: "What does Splitwise still do better?",
    a: "Splitting is all Splitwise does, and it shows: native iOS and Android apps, one-to-one balances with a friend outside any group, recurring bills, more than a hundred currencies with conversion on Pro, settle-up links to payment apps, and receipt scanning that assigns line items to people on Pro. A SpendChat split group has one currency and runs in the browser.",
  },
  {
    q: "Which should I use for a group trip?",
    a: "If your friends already keep their balances in Splitwise, or the trip spans several currencies, stay with Splitwise. If you want it free with no ads or daily limit, in a browser with nothing to install, and your own share to land in your own spending record, use a SpendChat split group.",
  },
  {
    q: "Does the free Splitwise plan limit how many expenses I can add?",
    a: "Yes. Splitwise's knowledge base says the free tier has a daily expense limit and that Pro removes it. Splitwise does not publish the number, so we don't either.",
  },
  {
    q: "Is SpendChat really free?",
    a: "There is a Free plan with no time limit and no ads, and transactions are unlimited on it. Paid plans — Plus and Pro, priced per workspace — add more AI, storage and room for more people, and Pro adds voice entry; the pricing page has the details. SpendChat is open source under the AGPL, and you can export everything to CSV at any time on every plan.",
  },
];

export default function SplitwiseComparisonPage() {
  return (
    <ComparePage
      slug={SLUG}
      rows={rows}
      faqs={faqs}
      relatedFeatures={["split", "workspaces", "multiple-profiles", "chat-expense-tracker"]}
      intro={
        <>
          <p>
            Splitwise answers &ldquo;who owes whom?&rdquo; after a trip or a shared flat,
            and it&apos;s built around nothing else. SpendChat starts from &ldquo;where did
            my money go this month?&rdquo; — for you alone or a household logging into one
            feed — and now splits costs with friends too, in free split groups.
          </p>
          <p>
            So the overlap is real. This page is about where each one is the better fit,
            including the parts of splitting Splitwise still does better.
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

      <CompareSection title="What SpendChat does">
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
          For costs shared with friends there are{" "}
          <Link href={featureLink("split")} className={link}>
            split groups
          </Link>
          , free on every plan and kept apart from your own books. Add people by email (up
          to {MAX}, you included), add each expense split equally, by exact amounts or by
          percent, and everyone in the group sees the same balances and the same list of
          who pays whom. When someone settles, they press Mark as paid. Your share of any
          expense can go into your own spending record with Add my share, so the trip shows
          up in your month at the amount it really cost you. To try it without an account,
          the{" "}
          <Link href={toolPath("split-bill-calculator")} className={link}>
            free split bill calculator
          </Link>{" "}
          runs the same maths in your browser.
        </p>
      </CompareSection>

      <CompareSection title="Where Splitwise is still ahead">
        <p>
          Splitwise has done one job for years, and on splitting alone it has more. It has
          native iOS and Android apps; SpendChat runs in the browser. It keeps one-to-one
          balances with a friend outside any group; in SpendChat that&apos;s a two-person
          group. It handles recurring bills, more than a hundred currencies with conversion
          on Pro, and settle-up links to payment apps, and Pro scans receipts and assigns
          line items to people. A SpendChat split group has one currency, fixed once the
          first expense is in, and records payments rather than making them.
        </p>
        <p>
          Where SpendChat is ahead is everything around the split: no ads and no daily
          expense limit on the free plan, a record of your own spending as the main
          feature, and the open-source code behind it.
        </p>
      </CompareSection>

      <CompareVerdict
        competitor={c.competitor}
        theirs={[
          "Splitting is the whole app: friendships as well as groups, recurring bills, and settle-up links to payment apps.",
          "Native iOS and Android apps, and more than a hundred currencies with conversion on Pro.",
          "Receipt scanning that assigns line items to people, on Pro.",
        ]}
        ours={[
          "Your own spending as the main feature, with categories, profiles and a monthly balance, not a workaround group.",
          "Free split groups with no ads and no daily limit, and your share of a trip goes straight into your own books.",
          "Entry in seconds — a message, a pasted day, or your voice on Pro — everything exported to CSV, and code you can read.",
        ]}
      />

      <CompareSection title="Using both">
        <p>
          If your friends already run their trips in Splitwise, keep the trip there and use
          SpendChat for the month: when a Splitwise balance settles, the amount you actually
          paid is one line in your SpendChat feed, categorised the way you think about it.
          If the group is starting fresh, a SpendChat split group does both jobs in one place.
          Neither app needs a bank login for any of this.
        </p>
      </CompareSection>
    </ComparePage>
  );
}
