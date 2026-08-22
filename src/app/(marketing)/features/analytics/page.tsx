import Link from "next/link";
import { AnalyticsDemo } from "@/components/marketing/demo/analytics-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "analytics";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "How do I see where my money goes each month?",
    a: "Open Analytics. You get income, expenses and the net between them for the range you pick, a category breakdown as a chart and a ranked list, and the last six months as income against expenses. There is nothing to configure first.",
  },
  {
    q: "Can I analyse any date range, or only whole months?",
    a: "Any range. Whole months are the common case, but a quarter, a tax year, a two-week trip or \"since I changed jobs\" all work the same way.",
  },
  {
    q: "Does it show income by category too?",
    a: "Yes. The breakdown flips between expenses and income, which is worth doing if you have more than one income source — freelancers especially tend to find the split is not what they assumed.",
  },
  {
    q: "Are analytics per profile?",
    a: "They follow whichever profile you're in, so business figures never mix with personal ones. The \"All profiles\" view combines them when you want the total picture.",
  },
  {
    q: "Why don't my category totals add up to what I expected?",
    a: "Almost always because some transactions are uncategorised — they count toward your balance but sit outside every category. The fastest fix is the transactions table: filter to no category and fill them in.",
  },
  {
    q: "Can I export or print a report?",
    a: "Yes. There's a print layout that strips the interface, which your browser will save as a PDF, and the underlying transactions export as CSV from the transactions page.",
  },
];

export default function AnalyticsPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<AnalyticsDemo />}
      demoAction="change the range, or flip the breakdown between expenses and income"
      faqs={faqs}
      intro={
        <>
          <p>
            Knowing your balance tells you where you are. It doesn&apos;t tell
            you why. Analytics answers the second question: what you earned, what
            you spent, which categories took it, and whether the last six months
            were getting better or worse.
          </p>
          <p>
            The demo below is live — change the range and every number, the chart
            and the ranked list move together.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Pick a range",
            body: "This month, a quarter, a year, or any two dates. Everything on the page follows it.",
          },
          {
            title: "Read the breakdown",
            body: "A chart for the shape, a ranked list with amounts and percentages for the detail. Flip it to income when you want the other side.",
          },
          {
            title: "Check the trend",
            body: "Six months of income against expenses, so a bad month reads as a bad month rather than as a trend — or the other way round.",
          },
        ]}
      />

      <FeatureSection title="Three numbers, then the detail">
        <p>
          The page leads with income, expenses and the net between them, because
          that&apos;s the question people actually arrive with: did I come out
          ahead? Everything below explains that number rather than competing with
          it.
        </p>
        <p>
          It&apos;s a deliberately small page. There are no widgets to arrange,
          no saved views to maintain, and no configuration step between you and
          an answer — which is what makes it something you&apos;ll open on a
          Sunday evening rather than something you mean to set up one day.
        </p>
      </FeatureSection>

      <FeatureSection title="A chart and a list, not a chart alone">
        <p>
          The category breakdown appears twice on purpose: as a ring, and as a
          ranked list with amounts and percentages. The ring shows you the shape
          — that housing dwarfs everything, that three categories are basically
          your whole month. The list gives you the numbers you&apos;d actually
          quote.
        </p>
        <p>
          Reading a value off a pie chart is genuinely hard, and charts that make
          you hover each slice to learn what it&apos;s worth are answering a
          question they invented. Having both means you never have to.
        </p>
      </FeatureSection>

      <FeatureSection title="Six months is the right amount of history">
        <p>
          One month tells you nothing — every month has something unusual in it.
          Two years is a research project. Six months is enough to see whether
          something is a spike or a pattern, and short enough to take in at a
          glance.
        </p>
        <p>
          Income and expense sit as separate bars per month rather than a single
          net line, because the two move for different reasons. A month where
          income dropped and a month where spending jumped can net out
          identically and mean completely different things.
        </p>
      </FeatureSection>

      <FeatureSection title="It's only as good as your categories">
        <p>
          Analytics is downstream of categorisation. An uncategorised transaction
          still counts toward your balance but belongs to no slice, so a page
          full of them is a page that quietly under-reports everything.
        </p>
        <p>
          That&apos;s why entry is built to make the category cheap — one click
          in the composer, or a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">#</code> tag
          while you type, or a guess from the{" "}
          <Link href={featureLink("ai-expense-tracker")} className="underline underline-offset-4">
            AI
          </Link>{" "}
          that you confirm. If the numbers here look off, the{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            transactions table
          </Link>{" "}
          is where you&apos;ll spot it — an uncategorised row shows with an empty
          category column, so they stand out as you scan. Your categories are
          yours to shape — see{" "}
          <Link href={featureLink("categories")} className="underline underline-offset-4">
            custom categories
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Anyone trying to cut back",
            body: "The ranked breakdown usually makes the answer obvious within seconds, and it's rarely the category people expect.",
          },
          {
            title: "Freelancers with uneven income",
            body: "Six months of income bars beside expense bars is the clearest read on whether a quiet month was a blip.",
          },
          {
            title: "Households comparing months",
            body: "Everyone in a shared workspace uses the same categories, so the totals are comparable rather than a matter of who logged it.",
          },
        ]}
      />
    </FeaturePage>
  );
}
