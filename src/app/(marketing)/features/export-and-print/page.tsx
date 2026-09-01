import Link from "next/link";
import { ExportDemo } from "@/components/marketing/demo/export-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "export-and-print";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "How do I export my expenses to CSV?",
    a: "Filter the transactions table to what you want — date range, type, category, profile, a search term — and press CSV. The download carries the same filters as the screen, so the file is the view you were reading rather than a dump you have to trim afterwards. It is always ordered newest first, whichever way you had the table sorted.",
  },
  {
    q: "Can I print an expense report as a PDF?",
    a: "Yes. Press Print (or ⌘P / Ctrl+P) and the page reformats itself: sidebar, filters and buttons drop out, the table gains thin gridlines, and a header appears with the workspace, profile and date range. Choose \"Save as PDF\" in your browser's print dialog and you have a report you can attach to an email.",
  },
  {
    q: "Is there a limit on exports?",
    a: "There's no cap on how often you export, no paid tier that unlocks it, and no watermark. One file covers up to 5,000 transactions; if you have more than that, export a year at a time using the date filter.",
  },
  {
    q: "Will my export open in Excel?",
    a: "Yes — and in Numbers, Google Sheets, LibreOffice and anything else that reads CSV. The file is UTF-8 with a header row and CRLF line endings, which is what RFC 4180 specifies and what Excel is happiest with. Commas and quotes inside your own text are escaped properly, so a title with punctuation doesn't shift the columns.",
  },
  {
    q: "What's actually in the file?",
    a: "A short header naming the workspace, profile and date range, then total income, total expense and net, then the table itself: date, type, category, title, amount and currency. Amounts are signed, so expenses are negative and a SUM over the column gives you the net without any further work.",
  },
  {
    q: "Can I move my data to another app later?",
    a: "That's the point of exporting well. Nothing is locked to us: your transactions leave as CSV whenever you like, SpendChat is free and open source under the AGPL, and you can read the exporter — or the whole app — on GitHub. Attachments are a separate matter: files download individually from the vault, and there isn't a one-click archive of all of them yet.",
  },
];

export default function ExportAndPrintPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<ExportDemo />}
      demoAction="switch between income and expenses, or pick a category, and watch the file rewrite itself"
      faqs={faqs}
      intro={
        <>
          <p>
            Every tracker is glad to take your data. The ones worth trusting are
            equally glad to hand it back. SpendChat downloads the exact view
            you&apos;re looking at as a CSV, and prints that same view as a clean
            report your browser will save as a PDF.
          </p>
          <p>
            The demo below runs the app&apos;s real exporter. Change a filter and
            the file rewrites itself — the one you&apos;d actually download,
            character for character.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Filter to what you need",
            body: "Date range, income or expense, one category, one profile, a search term. Whatever the table is showing is what the export is about to contain.",
          },
          {
            title: "Download or print",
            body: "One button for the CSV, one for print. The print layout strips the interface, so \"Save as PDF\" produces a report rather than a screenshot of an app.",
          },
          {
            title: "Open it anywhere",
            body: "Excel, Numbers, Google Sheets, your accountant's software, a script. It's a plain text file with a header row and no proprietary anything.",
          },
        ]}
      />

      <FeatureSection title="The file is the view, not the database">
        <p>
          Most export buttons give you everything you have ever entered, which
          means the real work starts after the download: opening the file,
          sorting it, and deleting the rows you didn&apos;t want. That&apos;s the
          step where the wrong rows get deleted, and it happens most often when
          the stakes are highest — a reimbursement claim, a tax return, a
          landlord asking for twelve months of something.
        </p>
        <p>
          SpendChat&apos;s export link carries the filters you already set: the
          same date range, the same type, the same category, the same{" "}
          <Link href={featureLink("multiple-profiles")} className="underline underline-offset-4">
            profile
          </Link>
          . Narrow the{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            transactions table
          </Link>{" "}
          to the business profile for last tax year, press download, and those
          are exactly the rows in the file, with nothing extra to remove. The
          one thing that doesn&apos;t carry across is the sort: the file is
          always newest first, whichever column you had the table ordered by. One number worth knowing up front: a single
          file covers up to 5,000 transactions, so a very long history is
          exported a year at a time rather than in one go.
        </p>
      </FeatureSection>

      <FeatureSection title="Print is a layout, not a screenshot">
        <p>
          Printing a web app usually prints the web app. You get the navigation
          down the left, a row of buttons that do nothing on paper, a table cut
          off at the margin, and a second page containing a footer. It&apos;s the
          reason most people screenshot instead, and screenshots are worse.
        </p>
        <p>
          SpendChat has a print layout. The sidebar, the filter bar, the toolbar
          and the loading indicators are all marked to disappear on paper; the
          table switches to thin gridlines that survive being printed in black
          and white; and a header appears that isn&apos;t on screen at all,
          naming the workspace, the profile and the date range, with income,
          expense and net totals underneath. Your browser&apos;s
          &ldquo;Save as PDF&rdquo; then produces a document you can send to
          someone without an apology attached.{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            Analytics
          </Link>{" "}
          prints the same way, charts included, when the shape of the spending is
          the thing you need to show.
        </p>
        <p>
          The shortcut is ⌘P (Ctrl+P on Windows and Linux), listed with
          everything else in the keyboard sheet you can open by pressing{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">/</code>. It is
          deliberately your browser&apos;s own print dialog rather than a
          reimplementation of one — you already know how it works, and it can
          already save PDFs. One caveat that&apos;s better said than discovered:
          the table loads more rows as you scroll, and printing captures what has
          loaded, so scroll to the end of a long range before you print. The CSV
          never has that caveat.
        </p>
      </FeatureSection>

      <FeatureSection title="Amounts come out exact, because they were never floats">
        <p>
          Money in SpendChat is stored as whole minor units — 4,000 rather than
          40.00 — and never as a floating-point number, at any point between the
          keyboard and the file. That&apos;s not pedantry. Floats are why
          spreadsheets full of imported financial data develop totals ending in
          .999999999, and why two systems that agree on every row can disagree on
          the sum.
        </p>
        <p>
          The exporter converts back to major units once, at the very end, and
          writes each amount to the exact number of decimals your currency uses
          — two for dollars and euros, none for yen. Amounts are signed, so
          expenses are negative and income is positive, and the currency travels
          in its own column. The amount column is always written with a dot
          decimal rather than your locale&apos;s, so add it up and you&apos;ll
          get the same net the app shows you, to the cent — if your spreadsheet
          expects a comma decimal, point it at that format on import.
        </p>
      </FeatureSection>

      <FeatureSection title="Leaving should be as easy as arriving">
        <p>
          A money tracker earns its position through months of small entries. That
          accumulated effort is a switching cost, and switching costs are what
          let software get worse without losing anyone. Plenty of finance apps
          understand this precisely: export sits behind the paid plan, or returns
          a format nothing else reads, or arrives as an emailed archive some
          hours later, or quietly omits the categories and notes that made your
          history worth keeping.
        </p>
        <p>
          The position here is the opposite one, and it is easier to state than
          to hedge. Export is free, unmetered and immediate. There is no
          watermark, no upsell in front of the button, no queue, and no plan on
          which it behaves differently — there is no other plan. The whole
          application is open source under the AGPL, so the exporter is a file
          you can read, the schema is a file you can read, and if you ever want
          to run the thing yourself, that&apos;s a supported outcome rather than
          a threat. The same export is available over the API with a bearer
          token, which is what makes scripting a monthly backup possible at all.
        </p>
        <p>
          Being honest about the edges: attachments aren&apos;t rows, so they
          aren&apos;t in the CSV. Receipts and bills live in the{" "}
          <Link href={featureLink("receipts-and-files")} className="underline underline-offset-4">
            file vault
          </Link>{" "}
          and download individually or through share links; there isn&apos;t a
          single button that packages the entire vault yet. Everything that is a
          transaction — every amount, date, category, title and profile — comes
          out in full, today, in a format that will still open in thirty years.
        </p>
      </FeatureSection>

      <FeatureSection title="The small things that decide whether a CSV survives">
        <p>
          A CSV is a simple format with a handful of ways to ruin an afternoon.
          Someone writes a title like{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">
            Dinner at &ldquo;The Laughing Fig&rdquo;, split three ways
          </code>{" "}
          and a naive exporter shifts every column after it by one. SpendChat
          quotes any cell containing a comma, a quote or a line break, and
          doubles the quotes inside it — RFC 4180, the rules Excel and Sheets
          both implement. You can watch it happen in the demo above: that title
          is in the seed data on purpose.
        </p>
        <p>
          The other one is nastier. A cell beginning with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">=</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">+</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">-</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">@</code> is
          treated by spreadsheets as a formula to execute, which turns a shared
          expense list into a way of running code on a colleague&apos;s machine.
          Every such cell is prefixed with an apostrophe so it opens as text —
          while plain numbers are exempted, because otherwise every negative
          amount in the file would be mangled by the fix. It&apos;s the kind of
          detail nobody asks about and everybody depends on; more of the same
          thinking is on{" "}
          <Link href={featureLink("privacy-and-security")} className="underline underline-offset-4">
            privacy and security
          </Link>
          . And if you got your history into SpendChat by{" "}
          <Link href={featureLink("bulk-add")} className="underline underline-offset-4">
            pasting rows in bulk
          </Link>
          , every field you pasted in is a column in the file that comes out.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Anyone with an accountant",
            body: "One filtered CSV per profile per year, categorised and signed, instead of a folder of screenshots and a covering apology.",
          },
          {
            title: "People claiming expenses back",
            body: "Filter to the trip, check the rows on screen, print the same view as a PDF. What you send is what you checked.",
          },
          {
            title: "Anyone who has been burned before",
            body: "If you've ever lost a year of records to an app that shut down or changed its plans, the export is the feature to evaluate first.",
          },
        ]}
      />
    </FeaturePage>
  );
}
