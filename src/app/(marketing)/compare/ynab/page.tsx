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

const SLUG = "ynab";
const c = getComparison(SLUG)!;

export const metadata = createMetadata({
  title: c.title,
  description: c.description,
  path: `/compare/${SLUG}`,
});

const rows: CompareRow[] = [
  {
    label: "Made for",
    spendchat: "Recording what you spent, quickly, and seeing where it went.",
    competitor: "Deciding what every unit of money is for before you spend it, and sticking to it.",
  },
  {
    label: "Method",
    spendchat: "None imposed. A feed, categories, a monthly balance.",
    competitor: "Envelope budgeting: assign money to categories, spend from them, adjust.",
  },
  {
    label: "Adding an entry",
    spendchat: "Type it like a message, paste a day, or say it.",
    competitor: "Bank import where supported, plus manual entry in a form.",
  },
  {
    label: "Bank connection",
    spendchat: "None, by design.",
    competitor: "Direct import for select US, Canadian, UK and EU banks; file import elsewhere.",
  },
  {
    label: "Price",
    spendchat: "Free. No paid tier.",
    competitor: "$109 a year or $14.99 a month, after a 34-day trial with no card.",
  },
  {
    label: "Platforms",
    spendchat: "Any browser, phone or desktop.",
    competitor: "Web, iOS and Android.",
  },
  {
    label: "Sharing",
    spendchat: "Workspaces with viewer, editor and admin roles.",
    competitor: "Up to six people on one subscription.",
  },
  {
    label: "Export",
    spendchat: "Everything to CSV, or print to PDF.",
    competitor: "CSV export of budget and register.",
  },
  {
    label: "Code",
    spendchat: "Open source, AGPL-3.0.",
    competitor: "Proprietary.",
  },
];

const faqs = [
  {
    q: "Is SpendChat a budgeting app like YNAB?",
    a: "No. YNAB is a method: you assign every unit of income to a category before spending and keep the plan honest as the month goes on. SpendChat is a record of what you actually spent, with categories, a monthly balance and reports. Many people find the record is the habit they can keep, and that the budget follows once the record exists.",
  },
  {
    q: "How much does YNAB cost?",
    a: "YNAB's pricing page lists $109 a year or $14.99 a month, after a 34-day free trial that doesn't ask for a card. Up to six people can share one subscription. SpendChat has no paid tier.",
  },
  {
    q: "Can I use YNAB without linking my bank?",
    a: "Yes. YNAB supports manual entry alongside direct import, and direct import only covers select US, Canadian, UK and EU banks anyway; elsewhere you import files. SpendChat is manual by design and has no bank integration at all.",
  },
  {
    q: "Can I keep a budget in SpendChat?",
    a: "Not as envelopes. You can see this month's total and the split by category on the analytics page and compare it with last month, and many people set a number in their head or a note against that. If you want the discipline of assigning money before it's spent, YNAB is built for exactly that.",
  },
];

export default function YnabComparisonPage() {
  return (
    <ComparePage
      slug={SLUG}
      rows={rows}
      faqs={faqs}
      relatedFeatures={["analytics", "categories", "chat-expense-tracker", "workspaces"]}
      intro={
        <>
          <p>
            YNAB is a budgeting method with software attached; SpendChat is a spending record
            with no method attached. People who thrive on the first often find the second too
            loose, and people who bounced off the first often find the second is the thing
            they actually keep doing. Here is how to tell which you are.
          </p>
        </>
      }
    >
      <CompareSection title="What YNAB is">
        <p>
          YNAB, short for You Need A Budget, is built around envelope budgeting: when money
          comes in, you assign all of it to categories, you spend from those categories, and
          when one runs dry you move money from another rather than overspending. The
          software exists to make that loop easy, with bank import for select US, Canadian,
          UK and EU banks, manual entry everywhere, goals, reports, and apps for web, iOS and
          Android. Up to six people can share a subscription, which suits couples running one
          plan.
        </p>
        <p>
          It costs $109 a year or $14.99 a month after a 34-day trial. For a method that
          many people credit with changing their finances, that is the price of the
          discipline as much as the software.
        </p>
      </CompareSection>

      <CompareSection title="Where the method becomes the obstacle">
        <p>
          Envelope budgeting asks for a decision about every unit of money before it is
          spent, and for the plan to be reconciled when reality drifts. That is the point,
          and it is also why the most common YNAB story is starting three times. Each entry
          is a form with an account, a payee and a category that must match a budget line.
          If income is irregular, if much of life is cash, or if the goal is simply to know
          where the money went, the method can feel like homework on top of the tracking.
        </p>
      </CompareSection>

      <CompareSection title="What SpendChat does instead">
        <p>
          SpendChat asks only that you write down what happened.{" "}
          <Link href={featureLink("chat-expense-tracker")} className="underline underline-offset-4">
            Type &ldquo;coffee 120&rdquo;, pick a category, send
          </Link>
          . Paste a whole day and confirm the drafts, or say it. The{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            analytics
          </Link>{" "}
          page then shows the month by category and against previous months, which is the
          information a budget is built from. There is no plan to reconcile because there is
          no plan, only the record, and the record is the habit most people can keep.
        </p>
        <p>
          That is also its limit. SpendChat will not stop you overspending a category, will
          not roll an envelope forward, and has no goals. If those are the tools you want,
          YNAB is a better product for you, and its method is worth the money for the people
          it fits.
        </p>
      </CompareSection>

      <CompareVerdict
        competitor={c.competitor}
        theirs={[
          "A budgeting method that decides spending in advance and keeps you accountable to it.",
          "Bank import for supported banks, goals, and reports built around the plan.",
          "One subscription shared by up to six people running the same budget.",
        ]}
        ours={[
          "A record you can keep: entries in seconds by message, paste or voice, no plan to reconcile.",
          "Free, no bank connection, works in any country.",
          "Shared workspaces with roles, receipts on entries, full export, and code you can read.",
        ]}
      />
    </ComparePage>
  );
}
