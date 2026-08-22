import Link from "next/link";
import { TransactionsDemo } from "@/components/marketing/demo/transactions-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "transactions";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "Can I search my transaction history?",
    a: "Yes. The search box covers both the title and the description, so a note you wrote months ago — \"deposit for the flat\", \"Dad's birthday\" — finds the transaction even if you can't remember the amount or the month.",
  },
  {
    q: "How do I filter expenses by date range?",
    a: "Pick any two dates. It isn't limited to whole months, so \"the fortnight I was travelling\" or \"since I started the new job\" are both single filters rather than something you assemble by hand afterwards.",
  },
  {
    q: "Can I choose which columns to show?",
    a: "Yes — date, category, title, description, amount, attachments and, in a shared workspace, who added it. You choose which appear, drag them into the order you want, and drag their edges to set widths. The layout is remembered per device.",
  },
  {
    q: "Does the export match what I'm looking at?",
    a: "Exactly. The CSV is the current view — same filters, same sort — so there's no step where you export everything and then delete rows in a spreadsheet.",
  },
  {
    q: "Can I sort by amount to find my biggest expenses?",
    a: "Yes. Click the amount header to sort, and click again to reverse it. Combined with a category filter, that answers \"what were my five biggest grocery shops this year\" in two clicks.",
  },
  {
    q: "Is there a limit on how many transactions I can store?",
    a: "No. There is no cap on transactions and no paid tier that raises one.",
  },
];

export default function TransactionsPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<TransactionsDemo />}
      demoAction="filter by type or category, search the notes, or sort by amount"
      faqs={faqs}
      intro={
        <>
          <p>
            The chat feed is for putting money in. The transactions table is for
            getting answers out: every entry in one sortable list, with filters
            for date range, type and category, and a search that reads your notes
            as well as your titles.
          </p>
          <p>
            The demo below is filtering and sorting real rows. Try searching for
            a word that only appears in a note.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Narrow it down",
            body: "Any date range, income or expense, one category or all of them. Filters combine, so \"groceries, last quarter\" is one view rather than three steps.",
          },
          {
            title: "Sort it",
            body: "By date to read chronologically, or by amount to put the biggest items at the top. Click a header again to reverse it.",
          },
          {
            title: "Take it with you",
            body: "Export the view as CSV or print it. What you exported is what you were looking at — same filters, same order.",
          },
        ]}
      />

      <FeatureSection title="Search reads your notes, not just your titles">
        <p>
          Most people don&apos;t remember transactions by their amount. They
          remember them by the thing that happened — the deposit, the repair, the
          present. That&apos;s the sort of detail that ends up in the description
          field, and it&apos;s where a search that only covers titles quietly
          fails you.
        </p>
        <p>
          SpendChat searches both. So a note reading &ldquo;deposit for the
          flat&rdquo; is findable by typing &ldquo;deposit&rdquo;, months later,
          without knowing the date or the amount. It&apos;s a small thing that
          decides whether your history is a record you can interrogate or an
          archive you scroll.
        </p>
      </FeatureSection>

      <FeatureSection title="Columns you choose, in the order you want them">
        <p>
          Seven columns are available — date, category, title, description,
          amount, attachments, and (in a shared workspace) who added the entry.
          You pick which of them show, drag the headers to reorder, and drag
          their edges to set widths.
        </p>
        <p>
          The layout is a per-device preference rather than a per-account one,
          which is deliberate: what fits on a 27-inch monitor is not what fits on
          a laptop, and the right answer on one shouldn&apos;t follow you to the
          other. Someone reviewing a shared household&apos;s spending might keep
          the author column on their desktop and drop it on a phone, and neither
          choice disturbs the other.
        </p>
      </FeatureSection>

      <FeatureSection title="What you see is what you export">
        <p>
          Every filter you apply narrows the export in the same way. Filter to
          the business{" "}
          <Link href={featureLink("multiple-profiles")} className="underline underline-offset-4">
            profile
          </Link>{" "}
          for the last tax year, hit download, and the CSV contains exactly those
          rows — no post-processing, no deleting rows in a spreadsheet
          afterwards, no wondering whether the file matched the screen.
        </p>
        <p>
          The print layout follows the same rule: it strips the interface and
          prints the rows you filtered to, which your browser will happily save
          as a PDF. More on both in{" "}
          <Link href={featureLink("export-and-print")} className="underline underline-offset-4">
            export and print
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureSection title="A table, deliberately — not a dashboard">
        <p>
          There&apos;s a version of this page that greets you with twelve widgets
          and a date picker you have to configure before anything means anything.
          It looks impressive and it answers no question you actually had.
        </p>
        <p>
          A sortable table with good filters answers most of them directly: what
          did I spend on this, when, and how much. When you want the shape rather
          than the rows —{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            where the money went
          </Link>{" "}
          — that&apos;s a different page, and it&apos;s one click away.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Anyone assembling a claim",
            body: "Expenses for an employer, a landlord, or an insurer: filter, check, export. The rows you send are the rows you checked.",
          },
          {
            title: "People doing a monthly review",
            body: "Sort by amount and the month explains itself in about fifteen seconds — the top five rows are usually the whole story.",
          },
          {
            title: "Anyone with an accountant",
            body: "One filtered CSV per profile per year, with your notes intact, instead of a shoebox and an apology.",
          },
        ]}
      />
    </FeaturePage>
  );
}
