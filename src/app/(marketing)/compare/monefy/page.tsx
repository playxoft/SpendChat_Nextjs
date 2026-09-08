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

const SLUG = "monefy";
const c = getComparison(SLUG)!;

export const metadata = createMetadata({
  title: c.title,
  description: c.description,
  path: `/compare/${SLUG}`,
});

const rows: CompareRow[] = [
  {
    label: "Made for",
    spendchat: "A fast, private record of spending, alone or with a household.",
    competitor: "A fast, private record of spending on one phone.",
  },
  {
    label: "Adding an entry",
    spendchat: "Type it like a message, paste a day, or say it. AI turns a sentence into drafts you confirm.",
    competitor: "Tap a category, type the amount, done. Genuinely quick.",
  },
  {
    label: "Bank connection",
    spendchat: "None, by design.",
    competitor: "None. Manual entry only.",
  },
  {
    label: "Price",
    spendchat: "Free. No paid tier, no ads.",
    competitor:
      "Free with ads. Premium is an in-app purchase for unlimited accounts, recurring transactions and advanced filters; store listings show tiers up to $59.99 and don't state the billing period.",
  },
  {
    label: "Platforms",
    spendchat: "Any browser, phone or desktop. Nothing to install.",
    competitor: "iPhone, iPad, Mac, Apple Watch and Android apps. No web version.",
  },
  {
    label: "Sync and sharing",
    spendchat: "One account, every device. Workspaces with roles for family or a team.",
    competitor: "Device-to-device sync through your own Google Drive or Dropbox. No roles or shared workspace.",
  },
  {
    label: "Receipts",
    spendchat: "Attach the photo to any entry; a file vault for the rest.",
    competitor: "No attachments.",
  },
  {
    label: "Export",
    spendchat: "Everything to CSV, or print to PDF.",
    competitor: "One-click backup and export; the format isn't stated in its help centre.",
  },
  {
    label: "Code",
    spendchat: "Open source, AGPL-3.0.",
    competitor: "Proprietary.",
  },
];

const faqs = [
  {
    q: "Is Monefy free?",
    a: "The core app is free with ads. Monefy Premium is an in-app purchase that unlocks unlimited accounts, recurring transactions, advanced filters and more. The store listings show several price tiers up to $59.99 and don't say whether that is yearly or one-off, and monefy.com doesn't list a price, so check the store in your country.",
  },
  {
    q: "Which is faster for a single entry?",
    a: "For one known amount, Monefy's tap-a-category-then-type flow is about as fast as it gets on a phone. SpendChat's manual composer is close: amount, a word or two, a category chip, send. Where SpendChat pulls ahead is a batch: paste or dictate a whole day and confirm the drafts in one go.",
  },
  {
    q: "Does Monefy have a web version?",
    a: "No. Monefy runs as an app on iPhone, iPad, Mac, Apple Watch and Android, and syncs between your devices through your own Google Drive or Dropbox. SpendChat runs in the browser, so a laptop and a phone see the same feed with nothing to install.",
  },
  {
    q: "Can two people use one Monefy account?",
    a: "Monefy's sync is meant for your own devices, through a database file in your Drive or Dropbox. There are no roles or invitations. SpendChat's workspaces are built for that: invite a partner by email, give them editor or viewer rights, and every entry shows who added it.",
  },
];

export default function MonefyComparisonPage() {
  return (
    <ComparePage
      slug={SLUG}
      rows={rows}
      faqs={faqs}
      relatedFeatures={["chat-expense-tracker", "ai-expense-tracker", "workspaces", "receipts-and-files"]}
      intro={
        <>
          <p>
            This is the closest comparison on the site. Monefy and SpendChat both believe
            you should type your spending yourself, both refuse to touch your bank, and both
            care about entry taking seconds. They differ in where the data lives, how you
            share it, and what you pay.
          </p>
        </>
      }
    >
      <CompareSection title="What Monefy gets right">
        <p>
          Monefy&apos;s pitch is that adding an expense is done in one click and you only
          ever type the amount. Open the app, tap a category, enter the number, and it is
          in. It has categories, multiple accounts, budgets, recurring transactions,
          multi-currency, widgets and a passcode, and it works entirely offline on your
          phone. Ten million installs later that simplicity still holds up, and for someone
          who only ever logs on one phone it is hard to beat.
        </p>
        <p>
          The free app has ads. Premium removes them and unlocks unlimited accounts,
          recurring transactions, advanced filters and hiding archived accounts. Sync
          between your own devices goes through your Google Drive or Dropbox, where Monefy
          keeps an encrypted database file.
        </p>
      </CompareSection>

      <CompareSection title="Where it stops">
        <p>
          Monefy is a phone app, and everything follows from that. There is no web
          version, so a laptop can&apos;t open your feed. Sync is device-to-device through
          your own cloud folder, so there is no notion of a second person with their own
          login and their own rights. Receipts can&apos;t be attached. And the features
          people reach for once a tracker sticks, more than a couple of accounts and real
          filtering, sit behind the paid tier.
        </p>
      </CompareSection>

      <CompareSection title="What SpendChat does instead">
        <p>
          SpendChat starts from the same two-field entry and adds two faster paths.{" "}
          <Link href={featureLink("ai-expense-tracker")} className="underline underline-offset-4">
            Paste a sentence
          </Link>{" "}
          like &ldquo;840 groceries, 60 auto, got 50000 salary&rdquo; and it becomes three
          drafts with categories, which you confirm before anything is saved. Or hold a
          key and say it. Because it runs in the browser, your phone and your laptop show
          the same feed with one login, and a{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            workspace
          </Link>{" "}
          gives a partner their own account with editor or viewer rights. Receipts attach
          to entries, exports are CSV or PDF, and none of it is paywalled.
        </p>
        <p>
          The trade is that SpendChat is a web app: it needs a connection, and your data
          lives in its database rather than in a file on your phone. The code that handles
          it is open source, and export takes one click, but if offline-first on a single
          device is what you want, Monefy is the better fit.
        </p>
      </CompareSection>

      <CompareVerdict
        competitor={c.competitor}
        theirs={[
          "The quickest single entry on a phone: tap a category, type the amount.",
          "Fully offline, with the data file in your own Drive or Dropbox.",
          "Native apps for Apple Watch, iPad and Mac.",
        ]}
        ours={[
          "Batch entry by sentence or voice, with drafts you confirm before anything is saved.",
          "A web app that a household shares, with roles and each entry labelled by who added it.",
          "Free without ads or a paid tier, receipts attached, everything exported, and open source.",
        ]}
      />
    </ComparePage>
  );
}
