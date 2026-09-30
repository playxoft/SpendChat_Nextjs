import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { CPI_COUNTRIES, CPI_SOURCE } from "@/lib/tools/data/cpi";
import { AVERAGE_YEARS, countryInSentence, FUTURE_LAST_YEAR } from "@/lib/tools/inflation";
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
const NAMES = CPI_COUNTRIES.map((c) => c.name);
const namesText = `${NAMES.slice(0, -1).join(", ")} and ${NAMES.at(-1)}`;

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
    q: "What will $100 be worth in 2050?",
    a: "Nobody knows exactly, but you can estimate it. If US prices keep rising at their average for 2004–2024, 2.57% a year, something that cost $100 in 2024 would cost about $193.37 in 2050 and $687.32 in 2100. With one point less or more inflation a year, 2050 lands anywhere from $149.89 to $248.86. Put the other way, $1,000,000 in 2050 would buy about what $517,136 bought in 2024.",
  },
  {
    q: "How accurate are the future estimates?",
    a: `They're estimates, not forecasts. Past a country's last published year, the calculator assumes prices rise at one steady rate — by default the country's own average over its last ${AVERAGE_YEARS} years of data, or a rate you set — and real inflation never runs that smoothly: US prices rose 1.23% in 2020 and 8.00% in 2022. Every estimate is marked with ≈, drawn dashed on the chart and shown with the range for one point less or more a year. Far-off years like 2100 or ${FUTURE_LAST_YEAR} are best read as an illustration of how inflation compounds. It's a planning aid, not financial advice.`,
  },
  {
    q: "Can I compare inflation between countries?",
    a: `Yes. Pick as many of the ${CPI_COUNTRIES.length} countries as you like and each one is worked out from its own price index, in its own currency. Compare the percentages rather than the amounts: from 2000 to 2024 prices rose 82.17% in the United States, 80.94% in the United Kingdom and 318.86% in India. The chart starts every country at 100 in the first year, and the table under it lists the average rate for all ${CPI_COUNTRIES.length}.`,
  },
  {
    q: "How do you calculate inflation between two years?",
    a: "Divide the consumer price index (CPI) for the later year by the CPI for the earlier year, and multiply your amount by the result. Take one away from that ratio for the cumulative inflation — the total rise, 82.17% in the US from 2000 to 2024. Raise the ratio to the power of 1 ÷ the number of years and take one away for the average yearly rate, the steady rate that compounds to the same total: 2.53% a year. Real years were above and below it (8% in the US in 2022).",
  },
  {
    q: "Why doesn't the calculator have this year's figures?",
    a: `It uses one average price index per full calendar year, and the latest year for each country is the last full year the World Bank has published — ${LATEST} for most countries${BEHIND.length ? ` (${behindText})` : ""}. The "to" year starts at the latest year all your countries have. A year's figure appears once the year is over and national statistics offices have reported it, and the data here is refreshed once a year. Until then you can still pick the year: it's estimated from the country's recent average and marked as an estimate.`,
  },
  {
    q: "Can I use it for years before the euro?",
    a: "Yes. For euro-area countries, enter an amount from before the euro in euros, converted at the fixed rate the old currency joined at — 1.95583 Deutsche Mark or 6.55957 French francs to €1, for example. The notes under the country table give each rate. Countries whose currency was replaced at an odd rate, like Brazil, start in the first full year of today's currency.",
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
          rose in between — for up to {CPI_COUNTRIES.length} countries side by
          side, from official consumer price data. Pick a future year, like
          2050 or 2100, for a clearly marked estimate.
        </p>
      }
      tool={<InflationTool />}
    >
      <ToolSection title="How to use the inflation calculator">
        <p>
          Enter an amount, pick the two years and tick the countries you want,
          and the answer updates as you go. The same amount is read in each
          country&apos;s own currency — 100 is $100 in the United States and
          ₹100 in India — so there&apos;s no currency to choose. Your own
          country is picked for you, next to the US and the UK. It works in both
          directions: 2000 to 2024 shows what an old price comes to today, and
          2024 to 2000 shows what today&apos;s money would have been worth back
          then. Pick a year after the data — anything up to{" "}
          {FUTURE_LAST_YEAR} — and you get an estimate instead, explained
          below.
        </p>
        <p>
          The first country you tick is the headline, with its cumulative
          inflation, average rate per year and the buying power lost; every
          other country gets its own line underneath. The chart puts all of
          them at 100 in the first year so their paths compare fairly, and the
          table under it lists the average inflation of all{" "}
          {CPI_COUNTRIES.length} countries for the same years. Copy link shares
          the exact comparison.
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
        <p>
          To compare countries, the chart rebases each one&apos;s index to the
          first year: 100 × CPI(year) ÷ CPI(from year). Every line starts at
          100, and a line at 180 means prices there are 80% higher than they
          were — whatever the currency.
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

      <ToolSection title="Estimating future inflation">
        <p>
          For a year after a country&apos;s latest published figure, the
          calculator carries its price index forward at one steady rate:
        </p>
        <Formula>
          CPI(future year) = CPI(last published year) × (1 + rate)^(years after it)
        </Formula>
        <p>
          By default the rate is each country&apos;s own compound average over
          its last {AVERAGE_YEARS} years of data: 2.57% a year for the United
          States (2004–2024), 2.80% for the United Kingdom, 6.51% for India and
          0.81% for Japan (2005–2025). Twenty years takes in calm years as well
          as shocks like 2008 and 2021–23, so no single year dominates. You can
          set your own rate instead — the 2% many central banks aim for, say —
          and it applies to every country you picked.
        </p>
        <p>
          Real inflation won&apos;t follow any steady rate, so every estimated
          figure is marked: an ≈ before it, a dashed line on the chart, italics
          in the table, and the range you&apos;d get with one point less or
          more inflation a year. That range widens fast. At the US average,
          $100 from 2024 becomes about $193 in 2050, $687 in 2100 and $17.5
          million in 2500 — but a point either way puts 2500 anywhere from
          about $165,000 to $1.77 billion. Treat near years as a planning guide
          and far ones as a lesson in compounding, and none of it as financial
          advice.
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
          licence. It covers {CPI_COUNTRIES.length} of the world&apos;s largest
          economies: {namesText}. Each country&apos;s series runs to the last full
          year the World Bank has published — {LATEST} for most countries
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
