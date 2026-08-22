import Link from "next/link";
import { BulkAddDemo } from "@/components/marketing/demo/bulk-add-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "bulk-add";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "How do I import expenses from a spreadsheet?",
    a: "Copy the rows and paste them into Bulk add. Each line is amount, note, category, type, date — and only the amount is required. You'll see every row parsed, with anything broken flagged by line number, before a single record is saved.",
  },
  {
    q: "What format do the rows need to be in?",
    a: "Comma-separated by default, and tab-separated if you pasted straight from a spreadsheet — which is what a spreadsheet copy actually produces, so most pastes need no editing at all. In locales that use a comma for decimals, semicolons separate the fields instead.",
  },
  {
    q: "What happens to rows that don't parse?",
    a: "They're listed with their line number and what went wrong, and they're skipped rather than guessed at. The rows that did parse still import; you fix the rest and paste again.",
  },
  {
    q: "Can I import a CSV file directly?",
    a: "There's no file upload — you paste the contents. In practice that's the same two keystrokes, and it means nothing is uploaded anywhere just to be read.",
  },
  {
    q: "Can I import into a specific profile?",
    a: "Yes. The import goes into whichever profile you choose, so bringing in a year of business records doesn't touch your personal books.",
  },
  {
    q: "Is there a limit on how many rows I can paste?",
    a: "Nothing you're likely to hit in one sitting. A year of transactions pastes and previews in one go.",
  },
];

export default function BulkAddPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<BulkAddDemo />}
      demoAction="edit the rows and watch the preview re-parse — one line is broken on purpose"
      faqs={faqs}
      intro={
        <>
          <p>
            Most people arrive with history: a spreadsheet, a notes file, a year
            of records in another app. Bulk add takes the paste and turns it into
            transactions — showing you exactly what it understood, and exactly
            what it couldn&apos;t, before anything is saved.
          </p>
          <p>
            The demo below runs the real parser on every keystroke. One line in
            the sample is deliberately broken, so you can see how that&apos;s
            reported.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Paste your rows",
            body: "Straight from a spreadsheet, a notes app, or another tracker's export. One transaction per line.",
          },
          {
            title: "Read the preview",
            body: "Every row parsed and priced, with anything broken called out by line number. Nothing has been saved yet.",
          },
          {
            title: "Import",
            body: "One button. The good rows land in the profile you chose; the broken ones are left for you to fix and paste again.",
          },
        ]}
      />

      <FeatureSection title="The preview is the feature">
        <p>
          Any importer can accept a file. The part that decides whether you trust
          it is what happens to the row it doesn&apos;t understand — and there is
          always at least one, because real data has a stray currency symbol, a
          date in the wrong order, or a description containing the delimiter.
        </p>
        <p>
          A tool that guesses will import that row as something plausible and
          wrong, and you will find out months later when a total doesn&apos;t
          reconcile. SpendChat refuses to guess: the row is reported with its
          line number and the reason, the rest still import, and you fix the
          handful that need it. Being told about five bad lines out of two
          hundred is a two-minute job. Discovering five silently wrong records a
          year later is not.
        </p>
      </FeatureSection>

      <FeatureSection title="It reads what a spreadsheet actually pastes">
        <p>
          Copying cells out of Excel, Numbers or Google Sheets produces
          tab-separated text, not commas. Bulk add detects that and uses tabs, so
          the most common paste in the world needs no reformatting first.
        </p>
        <p>
          Comma-separated text works too — with one subtlety worth knowing about.
          When the delimiter is a comma, it&apos;s also the thousands separator,
          so <code className="rounded bg-muted px-1 py-0.5 text-sm">1,250.50</code>{" "}
          would split into two fields and quietly import as{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">1</code>. A
          comma sitting directly between two digits is therefore treated as
          grouping rather than a field break, because a real field break is
          written with a space after it. Quoted fields work as well, so a
          description containing a comma survives intact.
        </p>
        <p>
          If your locale uses a comma for decimals, semicolons separate the
          fields instead — the same rule, arrived at from the other direction.
        </p>
      </FeatureSection>

      <FeatureSection title="Only the amount is required">
        <p>
          The format is amount, note, category, type, date — and everything after
          the amount is optional. A bare list of numbers imports fine. Omit the
          type and it&apos;s an expense, because it nearly always is. Omit the
          date and it&apos;s today. Name a category that doesn&apos;t exist and
          the row imports uncategorised rather than failing.
        </p>
        <p>
          That ordering isn&apos;t arbitrary: it&apos;s how people write these
          lists when nobody is imposing a schema on them. Matching the habit
          means most pastes work on the first try.
        </p>
      </FeatureSection>

      <FeatureSection title="Where this fits">
        <p>
          Bulk add is for catching up. Day to day, the{" "}
          <Link href={featureLink("chat-expense-tracker")} className="underline underline-offset-4">
            chat composer
          </Link>{" "}
          is faster for a single purchase, and{" "}
          <Link href={featureLink("ai-expense-tracker")} className="underline underline-offset-4">
            AI entry
          </Link>{" "}
          is faster for a day&apos;s worth described in a sentence. Bulk add is
          what you use when you&apos;re moving in from somewhere else, or when
          you&apos;ve let a month slide and want it dealt with in one sitting.
        </p>
        <p>
          It also works in the other direction: everything you import can be{" "}
          <Link href={featureLink("export-and-print")} className="underline underline-offset-4">
            exported back out
          </Link>{" "}
          as CSV, so nothing you bring in is trapped here.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "People switching trackers",
            body: "Export from the old one, paste into this one. Your history comes with you rather than starting over at zero.",
          },
          {
            title: "Spreadsheet keepers",
            body: "Years of rows already exist. This is the bridge that doesn't require retyping any of them.",
          },
          {
            title: "Anyone catching up on a backlog",
            body: "A month of receipts entered in one sitting, from a list, with a preview that catches the typos before they land.",
          },
        ]}
      />
    </FeaturePage>
  );
}
