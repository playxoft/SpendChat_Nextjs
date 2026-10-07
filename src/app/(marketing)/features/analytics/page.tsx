import Link from "next/link";
import { AnalyticsDemo } from "@/components/marketing/demo/analytics-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { plansWith } from "@/lib/plan-copy";
import { PLAN_NAMES } from "@/lib/plans";
import { createMetadata } from "@/lib/seo";

const SLUG = "analytics";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

// Plan names are read from the plan catalogue, never typed out, so the page
// can't promise Insights & trends on a plan that doesn't include them.
/** "Plus and Pro" — the plans with Insights & trends. */
const PAID = plansWith("advancedAnalytics");
const FREE = PLAN_NAMES.free;

const link = "underline underline-offset-4";

const faqs = [
  {
    q: "How do I see where my money goes each month?",
    a: "Open Analytics. You get income, expenses and the net between them for the range you pick, a category breakdown as a ring and a ranked list, and a trend of recent months. There is nothing to configure first.",
  },
  {
    q: "What's included on the Free plan?",
    a: `On ${FREE}: the income, expenses and net cards and the category breakdown — expenses or income — for any range and any profile, plus the last six months of income against expenses, this month's budgets and a print layout. Insights & trends shows on ${FREE} too, over sample numbers under a lock, so you can see what it adds; none of your transactions are read for it.`,
  },
  {
    q: "What do Insights & trends add?",
    a: `On ${PAID}: a projection of where this month's spending will land, compared with last month, your usual month and the same month last year; category trends against your usual by the same day; twelve months of cash flow with how much income you kept; a spending calendar; recurring payments and unusual spends; spending by payee, tag and profile; and a few plain-language notes on what stands out.`,
  },
  {
    q: "How is the month-end projection worked out?",
    a: "It's what you've spent so far plus what the rest of a month usually costs you, taken from up to three earlier months — so rent paid on the 1st counts once instead of being projected across the month. With no history yet it falls back to your pace so far, and before the 7th it says it's too early to tell.",
  },
  {
    q: "What counts as an unusual spend or a recurring payment?",
    a: "An entry is unusual when it's at least three times the typical (median) entry in its category over the past year, the category has enough entries to judge by, and the amount is big enough to matter. A payment is recurring when it has come round in at least three different months about a month apart, at about the same amount each time, and the last one was recent. Both are worked out from what you've logged — nothing is sent anywhere to be classified.",
  },
  {
    q: "Can I analyse any date range, or only whole months?",
    a: "Any range: this month, three, six or twelve months, all time, or two dates of your choosing. The cards, the category breakdown, the spending calendar, unusual spends and the payee, tag and profile breakdowns follow it; the projection, category trends, cash flow and recurring payments are about now, so they stay anchored to today.",
  },
  {
    q: "Are analytics per profile?",
    a: "They follow whichever profile you pick, so business figures never mix with personal ones. All profiles combines them — and on the paid plans adds a breakdown by profile.",
  },
  {
    q: "Why don't my category totals add up to what I expected?",
    a: "The breakdown shows one side at a time — expenses by default, income when you switch — so it won't reconcile against the net. And everything you didn't categorise is pooled into one Uncategorized line rather than dropped. To clear that line, sort the transactions table by its Category column so those rows come together, then pick a category for each.",
  },
];

export default function AnalyticsPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<AnalyticsDemo />}
      demoAction="change the range, then switch to Insights & trends to see where the month is heading"
      faqs={faqs}
      intro={
        <>
          <p>
            Your balance tells you where you are. Analytics tells you why: what
            came in, what went out, which categories took it — and, on {PAID},
            where this month is heading before it gets there.
          </p>
          <p>
            Pick a range and every number on the page follows it. There&apos;s
            no dashboard to build first.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Pick a range and a profile",
            body: "This month, a quarter, a year, all time or any two dates — for one profile or all of them together.",
          },
          {
            title: "Read the overview",
            body: "Income, expenses and the net first, then the categories behind them, as a ring and a ranked list.",
          },
          {
            title: "See what's changing",
            body: `On ${PAID}, Insights & trends projects the month, flags what moved and finds what repeats.`,
          },
        ]}
      />

      <FeatureSection title="Three numbers, then the detail">
        <p>
          The page leads with income, expenses and the net between them, because
          that&apos;s the question people arrive with: did I come out ahead?
          Under them, the category breakdown answers where it went — a ring for
          the shape, and a ranked list with amounts and percentages for the
          numbers you&apos;d actually quote. Switch it to income when you have
          more than one source; freelancers are often surprised by the split.
        </p>
        <p>
          On {FREE}, the last six months sit underneath as income against
          expenses, one bar each, because the two move for different reasons: a
          month where income dropped and one where spending jumped can net out
          the same and mean completely different things. When the range is this
          month, your{" "}
          <Link href={featureLink("budgets")} className={link}>
            budgets
          </Link>{" "}
          show too, each against its limit. All of it prints as a clean report
          your browser can save as a PDF.
        </p>
      </FeatureSection>

      <FeatureSection title={`Insights & trends, on ${PAID}`}>
        <p>
          The overview tells you what happened. Insights &amp; trends tells you
          what it means while there&apos;s still time to do something about it.
          It opens with a few plain-language notes — &ldquo;At this pace
          you&apos;ll spend about 1,940 this month — 9% more than usual&rdquo;,
          &ldquo;You&apos;ve spent 40% more on Food &amp; Dining than usual by
          this point in the month&rdquo; — and each note is only written when
          there&apos;s enough data behind it.
        </p>
        <p>
          <strong>This month&apos;s pace</strong> shows what you&apos;ve spent so
          far and where the month will land: what&apos;s gone out, plus what the
          rest of a month usually costs you. Rent paid on the 1st counts once,
          rather than being multiplied across the month the way a straight-line
          average would. Beside it sit the same day last month, your usual month
          and the same month last year, so &ldquo;more than usual&rdquo; comes
          with a number.
        </p>
        <p>
          <strong>Category trends</strong> compare each of your biggest
          categories with your usual <em>by the same day of the month</em> —
          comparing a half-finished month with whole ones would make everything
          look like it&apos;s falling. <strong>Cash flow</strong> lays twelve
          months of income and spending side by side, with how much you kept —
          your savings rate, for the year and month by month.
        </p>
      </FeatureSection>

      <FeatureSection title="The calendar, the repeats and the surprises">
        <p>
          The <strong>spending calendar</strong> shades every day in your range
          by what it cost, up to a year at a time, and tells you which weekday
          costs the most on average.
        </p>
        <p>
          <strong>Recurring payments</strong> are found, not configured: anything
          that has come round in at least three months, about a month apart, at
          about the same amount — rent, a phone plan, a subscription you forgot —
          with what it usually costs and when it should come round next.{" "}
          <strong>Unusual spending</strong> picks out entries several times
          bigger than what&apos;s typical for their category, ignoring the ones
          too small to matter: a coffee at three times the usual coffee isn&apos;t
          news; a repair at eight times the usual shopping is.
        </p>
        <p>
          <strong>Where it goes</strong> breaks the range down by payee (the
          titles you type, however you capitalise them), by tag, and — across
          all your{" "}
          <Link href={featureLink("multiple-profiles")} className={link}>
            profiles
          </Link>{" "}
          — by profile.
        </p>
        <p>
          On {FREE}, the whole section is there under a lock, drawn over sample
          numbers so you can see what each part does. Not one of your
          transactions is read for it.
        </p>
      </FeatureSection>

      <FeatureSection title="It's only as good as your categories">
        <p>
          Analytics is downstream of categorisation. Nothing goes missing when
          you skip a category — uncategorised entries are pooled into a single
          &ldquo;Uncategorized&rdquo; line, so the slices still add up — but that
          line explains nothing.
        </p>
        <p>
          That&apos;s why entry makes the category cheap: one click in the
          composer, a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">/</code> while
          you type, or a guess from the{" "}
          <Link href={featureLink("ai-expense-tracker")} className={link}>
            AI
          </Link>{" "}
          that you confirm. If the numbers look off, sort the{" "}
          <Link href={featureLink("transactions")} className={link}>
            transactions table
          </Link>{" "}
          by its Category column and every uncategorised row comes together,
          ready to fill in. Your categories are yours to shape — see{" "}
          <Link href={featureLink("categories")} className={link}>
            custom categories
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Anyone trying to cut back",
            body: "The ranked breakdown usually makes the answer obvious within seconds — and the month-end projection tells you in week two, not on the statement.",
          },
          {
            title: "Freelancers with uneven income",
            body: "Income beside spending, month by month, with how much you kept, is the clearest read on whether a quiet month was a blip.",
          },
          {
            title: "Households comparing months",
            body: "Everyone in a shared workspace files into the same categories, so the trends compare like with like rather than who logged it.",
          },
        ]}
      />
    </FeaturePage>
  );
}
