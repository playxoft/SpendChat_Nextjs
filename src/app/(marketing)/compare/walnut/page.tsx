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

const SLUG = "walnut";
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
    competitor:
      "Still on Google Play as the same app, now named axio: Income & Expense Tracker, from an RBI-registered lender.",
  },
  {
    label: "How entries get in",
    spendchat: "You type it, paste a day, or say it. Nothing is read from your phone.",
    competitor: "Reads your bank, card and wallet SMS and turns each one into a transaction.",
  },
  {
    label: "Cash and in-person UPI",
    spendchat: "Same as anything else: type it.",
    competitor: "No SMS, no entry. Added by hand, if at all.",
  },
  {
    label: "Permissions",
    spendchat: "None beyond a browser. Microphone only while you hold to speak.",
    competitor: "SMS access, which the listing also uses for loan fraud checks and SIM binding.",
  },
  {
    label: "Price",
    spendchat: "Free. No paid tier, no ads.",
    competitor:
      "Free. The app also sells pay-later credit, personal loans and fixed deposits.",
  },
  {
    label: "Platforms",
    spendchat: "Any browser, phone or desktop.",
    competitor: "Android. SMS reading isn't possible on iPhone, and we couldn't confirm what the iOS app includes. No web version found.",
  },
  {
    label: "Sharing",
    spendchat: "Workspaces with roles; invite family by email.",
    competitor: "Single phone, single user.",
  },
  {
    label: "Export",
    spendchat: "Everything to CSV, or print to PDF.",
    competitor: "Not listed on the current app page; we couldn't confirm it.",
  },
  {
    label: "Code",
    spendchat: "Open source, AGPL-3.0.",
    competitor: "Proprietary.",
  },
];

const faqs = [
  {
    q: "Is the Walnut app gone?",
    a: "No. The same Android app, with the same package on Google Play, is now published as axio: Income & Expense Tracker by Axio Digital. The listing describes axio as formerly Capital Float, Walnut and Walnut 369, and as the brand of an NBFC registered with the RBI. The SMS-based tracking is still there, alongside pay-later credit, personal loans and fixed deposits.",
  },
  {
    q: "Which is more accurate, SMS tracking or typing it yourself?",
    a: "SMS tracking catches every card and bank transaction without effort, but it can only see what sends an SMS, guesses the category from the merchant name, and misses cash and in-person UPI payments where the bank's message is a bare debit. Typing catches everything you decide to record, with the category and note you meant, and misses whatever you forget. SpendChat makes the typing fast enough that forgetting is rarer than you'd expect.",
  },
  {
    q: "Does SpendChat read my SMS or connect to my bank?",
    a: "No. There is no SMS permission, no account aggregator link and no bank integration anywhere in the app. Your data is what you type, paste or say, and the code is public so you can check that.",
  },
  {
    q: "Can I move from Walnut or axio to SpendChat?",
    a: "If you can get your history out as a spreadsheet, SpendChat's bulk add accepts pasted rows and turns them into transactions you confirm before saving. We couldn't confirm whether the current axio app still exports, so try that first.",
  },
];

export default function WalnutComparisonPage() {
  return (
    <ComparePage
      slug={SLUG}
      rows={rows}
      faqs={faqs}
      relatedFeatures={["privacy-and-security", "voice-expense-tracker", "bulk-add", "chat-expense-tracker"]}
      intro={
        <>
          <p>
            Walnut was the app that made expense tracking automatic in India: give it your
            SMS and it built the ledger for you. It still exists, under a new name and
            inside a lending business. SpendChat takes the opposite bet, that typing what
            you spent is worth four seconds. This page is about which bet suits you.
          </p>
        </>
      }
    >
      <CompareSection title="What happened to Walnut">
        <p>
          The Walnut app was never removed. On Google Play it is the same package it always
          was, now titled axio: Income &amp; Expense Tracker, published by Axio Digital. The
          listing says axio was formerly Capital Float, Walnut and Walnut 369, and that it
          is the brand of an NBFC registered with the RBI. The tracker still works the way
          Walnut did: it reads bank, card and wallet SMS, detects spends, manages bills and
          budgets, and lets you add categories, notes, tags and receipt photos.
        </p>
        <p>
          What changed is what surrounds it. The same app now offers pay-later credit,
          personal loans and fixed deposits, and the SMS permission is used for those too,
          including fraud checks and binding your SIM to the device. The tracker is free;
          the business is lending.
        </p>
      </CompareSection>

      <CompareSection title="Automatic capture, and what it misses">
        <p>
          SMS parsing is a genuinely good idea for card and bank transactions. Every debit
          alert becomes a row without you doing anything, and bill reminders come straight
          from the messages. If most of your spending goes through cards and a bank account
          that sends alerts, the ledger builds itself.
        </p>
        <p>
          The gaps are the rest of a day in India. Cash has no SMS. An in-person UPI payment
          produces a bank message that says a debit happened, not what for, so the category
          is a guess from whatever text the bank included. The friend who paid for dinner
          and got 800 rupees from you shows up as a transfer to a name. And all of it lives
          on one Android phone; there is no web version, and the SMS approach can&apos;t
          work on an iPhone at all.
        </p>
      </CompareSection>

      <CompareSection title="What SpendChat does instead">
        <p>
          SpendChat reads nothing from your phone. You{" "}
          <Link href={featureLink("chat-expense-tracker")} className="underline underline-offset-4">
            type what you spent like a message
          </Link>
          , paste the whole day in one go and confirm the drafts, or{" "}
          <Link href={featureLink("voice-expense-tracker")} className="underline underline-offset-4">
            hold a key and say it
          </Link>
          , in whatever mix of languages you actually speak. Cash, UPI, the dinner you paid
          back: all the same four seconds, each with the category and note you meant. It
          runs in the browser on any phone or desktop, a family can share one feed with
          separate profiles, and everything exports to CSV.
        </p>
        <p>
          The honest cost is that you have to do it. Nothing appears unless you put it
          there. People who stick with SpendChat tend to say that moment of typing is
          exactly what changed how they spend, but if you know you won&apos;t type, an
          SMS reader will record more than you will.
        </p>
      </CompareSection>

      <CompareVerdict
        competitor="axio (Walnut)"
        theirs={[
          "Every card, bank and wallet SMS captured with zero effort.",
          "Bill reminders and balances read straight from your messages.",
          "Free, with no typing at all for the transactions it can see.",
        ]}
        ours={[
          "No SMS permission, no lending products, no bank access: your data is what you type, and the code proves it.",
          "Cash and in-person UPI recorded as easily as a card swipe, with the category you meant.",
          "Works in any browser, shares a feed with family, and exports everything.",
        ]}
      />
    </ComparePage>
  );
}
