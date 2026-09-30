import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { CPI_COUNTRIES, CPI_SOURCE } from "@/lib/tools/data/cpi";
import { countryInSentence } from "@/lib/tools/inflation";
import { InflationTool } from "./_components/inflation-tool";

const SLUG = "inflation-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const link = "font-medium text-foreground underline underline-offset-4";

// The data's reach, from the snapshot itself so the copy can't drift from it.
const LATEST = Math.max(...CPI_COUNTRIES.map((c) => c.lastYear));
const BEHIND = CPI_COUNTRIES.filter((c) => c.lastYear < LATEST);
const behindText = BEHIND.map((c) => `${countryInSentence(c)} to ${c.lastYear}`).join(", ");

const faqs = [
  {
    q: "What is $100 in 2000 worth today?",
    a: "In the United States, about $182.17 in 2024 money — 2024 being the latest full year the World Bank has published for the US. Prices rose 82.17% over those 24 years, 2.53% a year on average. Put the other way, $100 in 2024 had the buying power of $54.90 in 2000.",
  },
  {
    q: "What is ₹100 from 1990 worth today in India?",
    a: "About ₹1,015.57 in 2025 money: Indian consumer prices rose roughly tenfold between 1990 and 2025, 6.85% a year on average. ₹100 from 2000 is worth about ₹428.91 in 2025.",
  },
  {
    q: "How do you calculate inflation between two years?",
    a: "Divide the consumer price index (CPI) for the later year by the CPI for the earlier year, and multiply your amount by the result. Take one away from that ratio for the cumulative inflation, or raise it to the power of 1 ÷ the number of years and take one away for the average yearly rate. The calculator does all three from World Bank CPI data.",
  },
  {
    q: "Why doesn't the calculator go up to this year?",
    a: `It uses one average price index per full calendar year, and the latest year for each country is the last full year the World Bank has published — ${LATEST} for most countries${BEHIND.length ? ` (${behindText})` : ""}. A year's figure appears once the year is over and national statistics offices have reported it, and the data here is refreshed once a year.`,
  },
  {
    q: "What's the difference between cumulative and average inflation?",
    a: "Cumulative inflation is the total rise in prices between the two years: 82.17% in the US from 2000 to 2024. The average yearly rate is the steady rate that compounds to the same total — 2.53% a year. Some years were well above the average (8% in the US in 2022) and some below it.",
  },
  {
    q: "Can I use it for years before the euro?",
    a: "Yes. For euro-area countries, enter an amount from before the euro in euros, converted at the fixed rate the old currency joined at — 1.95583 Deutsche Mark or 6.55957 French francs to €1, for example. The country's note in the calculator gives its rate. Countries whose currency was replaced at an odd rate, like Brazil, start in the first full year of today's currency.",
  },
];

export default function InflationCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Prices keep rising — see what your own spending is doing each month."
      faqs={faqs}
      intro={
        <p>
          See what money from any year is worth in another — and how much prices
          rose in between — from official consumer price data for{" "}
          {CPI_COUNTRIES.length} countries.
        </p>
      }
      tool={<InflationTool />}
    >
      <ToolSection title="How to use the inflation calculator">
        <p>
          Enter an amount, pick the country and the two years, and the answer
          updates as you go. The amount is always in the country&apos;s own
          currency, so there&apos;s nothing else to choose. It works in both
          directions: 2000 to 2024 shows what an old price comes to today,
          and 2024 to 2000 shows what today&apos;s money would have been worth
          back then.
        </p>
        <p>
          Under the answer you get the cumulative inflation between the two
          years, the average rate per year and how much buying power the money
          lost. The chart and the year-by-year table show the whole path,
          including the inflation rate in each single year. Copy link shares the
          exact calculation.
        </p>
      </ToolSection>

      <ToolSection title="The inflation formula">
        <p>
          A consumer price index (CPI) tracks what the same basket of everyday
          goods and services costs each year. Money moves between years in
          proportion to it:
        </p>
        <Formula>
          Value = amount × CPI(to year) ÷ CPI(from year)
          <br />
          Cumulative inflation = CPI(later) ÷ CPI(earlier) − 1
          <br />
          Average per year = (CPI(later) ÷ CPI(earlier))^(1 ÷ years) − 1
        </Formula>
        <p>
          The average is a compound rate, so applying it year after year lands
          exactly on the cumulative figure. Buying power lost is 1 − CPI(earlier)
          ÷ CPI(later): the share of the later year&apos;s money that the rise in
          prices has eaten.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: $100 in 2000">
        <p>
          The US consumer price index was 78.97 in 2000 and 143.86 in 2024 (both
          on the World Bank&apos;s 2010 = 100 scale).
        </p>
        <Formula>
          Value = 100 × 143.857 ÷ 78.9707 = $182.17
          <br />
          Cumulative inflation = 143.857 ÷ 78.9707 − 1 = 82.17%
          <br />
          Average per year = 1.82165^(1 ÷ 24) − 1 = 2.53%
        </Formula>
        <p>
          So something that cost $100 in 2000 cost about $182.17 in 2024, and
          $100 lost 45.10% of its buying power over the period. Prices rose at
          very different speeds elsewhere. From 2000 to 2025, £100 in the UK
          became £187.97 (2.56% a year), €100 in Germany €160.79, ₹100 in India
          ₹428.91 (6.00% a year) — and ¥100 in Japan just ¥115.
        </p>
      </ToolSection>

      <ToolSection title="Where the numbers come from">
        <p>
          The figures are the World Bank&apos;s{" "}
          <a href={CPI_SOURCE.url} className={link}>
            consumer price index (2010 = 100)
          </a>
          , indicator {CPI_SOURCE.indicator} in the World Development Indicators,
          which the World Bank publishes under the{" "}
          <a href={CPI_SOURCE.licenseUrl} className={link} rel="license">
            {CPI_SOURCE.license}
          </a>{" "}
          licence. Each country&apos;s series runs to the last full year the World
          Bank has published — {LATEST} for most countries
          {BEHIND.length ? `, ${behindText}` : ""} — and starts when today&apos;s
          currency began, where that&apos;s later than the data.
        </p>
        <p>
          A CPI is an average household&apos;s basket, so your own inflation can
          differ: rent, school fees or fuel may have risen much faster than the
          average for you, and gadgets much slower. The only way to know your
          personal rate is to{" "}
          <Link href="/features/analytics" className={link}>
            track what you actually spend
          </Link>{" "}
          and compare the same months a year apart.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
