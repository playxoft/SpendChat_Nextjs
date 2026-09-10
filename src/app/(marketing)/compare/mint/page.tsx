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

const SLUG = "mint";
const c = getComparison(SLUG)!;

export const metadata = createMetadata({
  title: c.title,
  description: c.description,
  path: `/compare/${SLUG}`,
});

const rows: CompareRow[] = [
  {
    label: "Status",
    spendchat: "Active, free, open source.",
    competitor: "Shut down in 2024. mint.intuit.com now sends visitors to Credit Karma.",
  },
  {
    label: "How entries get in",
    spendchat: "You type it, paste a day, or say it.",
    competitor: "Linked bank and card accounts, imported automatically.",
  },
  {
    label: "Bank connection",
    spendchat: "None, by design.",
    competitor: "The whole model. Its successors link banks through aggregators.",
  },
  {
    label: "Price",
    spendchat: "Free. No paid tier, no ads.",
    competitor:
      "Mint was free with ads. The apps people moved to are mostly paid: YNAB $109 a year or $14.99 a month, Copilot $95 a year or $13 a month, PocketGuard Plus $74.99 a year with a free core plan.",
  },
  {
    label: "Outside the US",
    spendchat: "Works anywhere; the currency follows your workspace.",
    competitor:
      "Copilot links US institutions only; YNAB imports directly from select US, Canadian, UK and EU banks. In India, bank-linked tracking runs on the Account Aggregator framework inside apps like Jupiter and Fi.",
  },
  {
    label: "Cash and in-person payments",
    spendchat: "Typed like anything else.",
    competitor: "Invisible to a bank feed unless you add them by hand.",
  },
  {
    label: "Sharing",
    spendchat: "Workspaces with roles; invite family by email.",
    competitor: "Varies. YNAB allows up to six people on one subscription.",
  },
  {
    label: "Export",
    spendchat: "Everything to CSV, or print to PDF.",
    competitor: "Varies by app.",
  },
  {
    label: "Code",
    spendchat: "Open source, AGPL-3.0.",
    competitor: "Proprietary, all of them.",
  },
];

const faqs = [
  {
    q: "Is Mint still available?",
    a: "No. Intuit shut Mint down in 2024 and its website now directs people to Credit Karma, which offers some account overview features but is a different product. The budgeting tools people used Mint for did not carry over in the same form.",
  },
  {
    q: "What free alternatives to Mint exist?",
    a: "Fewer than there were. Most of the well-known successors, YNAB, Copilot and Monarch Money, are subscriptions, and PocketGuard keeps a free core plan alongside its paid tier. SpendChat is free with no paid tier, but it makes a different trade: there is no bank connection, so you enter transactions yourself.",
  },
  {
    q: "Why would anyone give up automatic bank import?",
    a: "Three reasons come up. Connections break and duplicate, which is why every bank-linked app has a troubleshooting section for it. A feed shows a transfer, not what it was for, and misses cash entirely. And linking means handing a third-party aggregator access to your accounts. Typing takes a few seconds per entry and avoids all three, at the cost of having to do it.",
  },
  {
    q: "Does SpendChat work in India, the UK or Europe?",
    a: "Yes. There is no bank connection to depend on a country's banking rails, so it works wherever you are. Each workspace has its own currency and number format, picked for you at sign-up from your location and changeable in settings.",
  },
];

export default function MintComparisonPage() {
  return (
    <ComparePage
      slug={SLUG}
      rows={rows}
      faqs={faqs}
      relatedFeatures={["privacy-and-security", "chat-expense-tracker", "analytics", "export-and-print"]}
      intro={
        <>
          <p>
            Mint was the free, bank-linked tracker most people started with, and it is
            gone. The apps that replaced it kept the bank link and added a subscription.
            SpendChat kept the price and dropped the bank link. This page is about what
            that trade actually means for you.
          </p>
        </>
      }
    >
      <CompareSection title="What Mint was, and where it went">
        <p>
          Mint linked your bank and card accounts, pulled every transaction in
          automatically, categorised it, and showed budgets and trends on top, all free
          with ads. Intuit shut it down in 2024, and mint.intuit.com now says Mint has been
          reimagined on Credit Karma, which is a different product with different tools.
        </p>
        <p>
          The apps people moved to are mostly paid. YNAB is $109 a year or $14.99 a month
          after a 34-day trial, with bank import for select US, Canadian, UK and EU banks and
          manual entry everywhere else. Copilot is $95 a year or $13 a month, on Mac, iPhone,
          iPad and the web, with no Android app and US financial institutions only. PocketGuard
          keeps a free core plan and sells Plus at $74.99 a year or $12.99 a month. Monarch
          Money is a paid subscription with a free trial; its prices aren&apos;t printed on
          its pricing page as plain text, so we won&apos;t quote them.
        </p>
      </CompareSection>

      <CompareSection title="What a bank link buys you, and what it costs">
        <p>
          The appeal is obvious: every card and bank transaction appears without you doing
          anything, plus net worth across accounts and subscription detection. The costs are
          the ones the vendors themselves document. Connections break when a bank changes
          something, and need re-linking. Transactions import twice when a bank amends one
          after the fact; YNAB has a help article for exactly that. Categories are guesses
          from merchant strings and need cleanup. And you are handing an aggregator ongoing
          access to your accounts, which is the part many people don&apos;t love.
        </p>
        <p>
          Two things never make it into a feed at all. Cash, and the reason. A bank sees
          &ldquo;UPI to Arjun, 800&rdquo;; it doesn&apos;t see that Arjun paid for dinner.
        </p>
      </CompareSection>

      <CompareSection title="What SpendChat does instead">
        <p>
          SpendChat has no bank integration and never asks for a login, which is why it
          can be free and why it works in any country.{" "}
          <Link href={featureLink("chat-expense-tracker")} className="underline underline-offset-4">
            You type what you spent like a message
          </Link>
          , paste a whole day and confirm the drafts, or say it. Entries carry the category
          and note you meant, cash included. The{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            analytics
          </Link>{" "}
          page shows spending by category and month, and everything exports to CSV.
        </p>
        <p>
          The trade is real: nothing appears unless you put it there, and there is no net
          worth view across investment accounts. If you want a picture of every account you
          own without lifting a finger, a bank-linked app is the tool, and in India that
          means one built on the Account Aggregator framework. If you want to know where
          your money goes and are willing to spend four seconds per entry, SpendChat is.
        </p>
      </CompareSection>

      <CompareVerdict
        competitor="a bank-linked app"
        theirs={[
          "Every card and bank transaction captured with no effort.",
          "Net worth, investments and bills across institutions in one place.",
          "Recurring charges and subscriptions detected for you.",
        ]}
        ours={[
          "Free, with no aggregator, no bank login and no ads.",
          "Cash and the reason behind a purchase recorded, not just the transfer.",
          "Works in any country, shares a feed with family, exports everything, and the code is public.",
        ]}
      />
    </ComparePage>
  );
}
