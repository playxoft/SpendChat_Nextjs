import { describe, expect, it } from "vitest";
import { isSupportedCurrency } from "@/lib/currencies";
import { COUNTRY_TO_CURRENCY } from "@/lib/geo";
import { CPI_COUNTRIES, CPI_FETCHED_ON, CPI_SOURCE, findCpiCountry } from "@/lib/tools/data/cpi";
import {
  adjustForInflation,
  clampYear,
  commonLastYear,
  compareInflation,
  countryInSentence,
  coverageNote,
  cpiFor,
  currencyTag,
  defaultCountries,
  flagEmoji,
  indexedPaths,
  MAX_COUNTRIES,
  parseCountryList,
  SERVER_COUNTRIES,
  YEAR_RANGE,
} from "@/lib/tools/inflation";

const US = findCpiCountry("US")!;
const IN = findCpiCountry("IN")!;

/** A tiny made-up series, so the maths can be checked by hand. */
const TOY = {
  firstYear: 2000,
  lastYear: 2004,
  values: { 2000: 100, 2001: 110, 2002: 121, 2003: 115, 2004: 133.1 },
};

describe("CPI data", () => {
  it("has the World Bank spot values it was built from (checked by hand against the API)", () => {
    // api.worldbank.org/v2/country/…/indicator/FP.CPI.TOTL, fetched 2026-09-30, to 6 significant figures.
    expect(cpiFor(IN, 1990)).toBe(22.949);
    expect(cpiFor(IN, 2000)).toBe(54.3383);
    expect(cpiFor(IN, 2025)).toBe(233.063);
    expect(cpiFor(US, 2000)).toBe(78.9707);
    expect(cpiFor(US, 2024)).toBe(143.857);
    expect(cpiFor(findCpiCountry("GB")!, 1990)).toBe(61.0967);
    expect(cpiFor(findCpiCountry("GB")!, 2025)).toBe(153.135);
    expect(cpiFor(findCpiCountry("JP")!, 2000)).toBe(102.668);
    expect(cpiFor(findCpiCountry("BR")!, 1995)).toBe(36.6403);
    expect(cpiFor(findCpiCountry("DE")!, 2025)).toBe(137.798);
  });

  it("has exactly the 20 countries the page promises", () => {
    const want = [
      "US", "IN", "GB", "DE", "FR", "IT", "ES", "CA", "AU", "JP",
      "CN", "BR", "MX", "KR", "ID", "TR", "SA", "ZA", "SG", "AE",
    ];
    expect(CPI_COUNTRIES.map((c) => c.country).sort()).toEqual([...want].sort());
    expect(MAX_COUNTRIES).toBe(20);
  });

  it("has the coverage the copy relies on", () => {
    // The page's FAQ quotes the US to 2024 and everyone else to 2025.
    expect(US.lastYear).toBe(2024);
    expect(CPI_COUNTRIES.filter((c) => c.lastYear !== 2025).map((c) => c.country)).toEqual(["US"]);
    expect(findCpiCountry("TR")!.firstYear).toBe(2005);
    expect(findCpiCountry("AE")!.firstYear).toBe(2007);
    expect(YEAR_RANGE).toEqual({ firstYear: 1960, lastYear: 2025 });
  });

  it("has a gap-free, positive series for every country, based at 2010 = 100", () => {
    for (const c of CPI_COUNTRIES) {
      expect(c.firstYear, c.name).toBeLessThan(c.lastYear);
      expect(c.lastYear, c.name).toBeLessThanOrEqual(Number(CPI_FETCHED_ON.slice(0, 4)) - 1);
      const years = Object.keys(c.values).map(Number);
      expect(years.length, c.name).toBe(c.lastYear - c.firstYear + 1);
      for (let y = c.firstYear; y <= c.lastYear; y++) {
        expect(cpiFor(c, y), `${c.name} ${y}`).not.toBeNull();
      }
      if (c.firstYear <= 2010) expect(c.values[2010], c.name).toBeCloseTo(100, 3);
    }
  });

  it("pairs every country with its own, supported currency", () => {
    for (const c of CPI_COUNTRIES) {
      expect(isSupportedCurrency(c.currency), c.name).toBe(true);
      expect(COUNTRY_TO_CURRENCY[c.country], c.name).toBe(c.currency);
    }
  });

  it("is sorted by name, with unique codes and per-country source links", () => {
    const names = CPI_COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(new Set(CPI_COUNTRIES.map((c) => c.country)).size).toBe(CPI_COUNTRIES.length);
    for (const c of CPI_COUNTRIES) expect(c.source).toBe(`${CPI_SOURCE.url}?locations=${c.country}`);
    expect(CPI_SOURCE.license).toBe("CC BY 4.0");
    expect(CPI_FETCHED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("finds countries in any case and rejects unknown ones", () => {
    expect(findCpiCountry("in")?.name).toBe("India");
    expect(findCpiCountry(" gb ")?.name).toBe("United Kingdom");
    expect(findCpiCountry("XX")).toBeNull();
    expect(findCpiCountry("")).toBeNull();
    expect(findCpiCountry(null)).toBeNull();
  });
});

describe("cpiFor", () => {
  it("returns null outside the series and for part years", () => {
    expect(cpiFor(TOY, 1999)).toBeNull();
    expect(cpiFor(TOY, 2005)).toBeNull();
    expect(cpiFor(TOY, 2000.5)).toBeNull();
    expect(cpiFor(TOY, Number.NaN)).toBeNull();
    expect(cpiFor(TOY, 2002)).toBe(121);
  });
});

describe("clampYear", () => {
  it("pulls a year into the series' range", () => {
    expect(clampYear(1990, TOY, 2000)).toBe(2000);
    expect(clampYear(2010, TOY, 2000)).toBe(2004);
    expect(clampYear(2002, TOY, 2000)).toBe(2002);
    expect(clampYear(2002.6, TOY, 2000)).toBe(2003);
  });

  it("uses the fallback for a missing year, clamped too", () => {
    expect(clampYear(null, TOY, 2001)).toBe(2001);
    expect(clampYear(null, TOY, 1980)).toBe(2000);
    expect(clampYear(Number.NaN, TOY, 2003)).toBe(2003);
  });
});

describe("adjustForInflation", () => {
  it("scales by the ratio of the two indexes", () => {
    const r = adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2002, series: TOY })!;
    expect(r.value).toBeCloseTo(121, 12);
    expect(r.ratio).toBeCloseTo(1.21, 12);
    expect(r.years).toBe(2);
    expect(r.cumulativePercent).toBeCloseTo(21, 12);
    // 1.1² = 1.21, so 10% a year.
    expect(r.averageAnnualPercent).toBeCloseTo(10, 12);
    expect(r.purchasingPowerLossPercent).toBeCloseTo((1 - 1 / 1.21) * 100, 12);
    expect(r.reverseValue).toBeCloseTo(100 / 1.21, 12);
  });

  it("compounds the average rate back to the cumulative change (CAGR)", () => {
    const r = adjustForInflation({ amount: 1, fromYear: 2000, toYear: 2004, series: TOY })!;
    expect((1 + r.averageAnnualPercent! / 100) ** 4).toBeCloseTo(1.331, 12);
  });

  it("runs backwards, with the same summary figures", () => {
    const fwd = adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2004, series: TOY })!;
    const back = adjustForInflation({ amount: 133.1, fromYear: 2004, toYear: 2000, series: TOY })!;
    expect(back.value).toBeCloseTo(100, 9);
    // …and the reverse view goes the other way: 133.1 in 2000 is 177.16 in 2004.
    expect(back.reverseValue).toBeCloseTo(133.1 * 1.331, 9);
    expect(back.earlierYear).toBe(2000);
    expect(back.laterYear).toBe(2004);
    expect(back.cumulativePercent).toBeCloseTo(fwd.cumulativePercent, 12);
    expect(back.averageAnnualPercent).toBeCloseTo(fwd.averageAnnualPercent!, 12);
    expect(back.purchasingPowerLossPercent).toBeCloseTo(fwd.purchasingPowerLossPercent, 12);
  });

  it("round-trips: forward then back gives the amount again", () => {
    const there = adjustForInflation({ amount: 250, fromYear: 1985, toYear: 2025, series: IN })!;
    const back = adjustForInflation({ amount: there.value, fromYear: 2025, toYear: 1985, series: IN })!;
    expect(back.value).toBeCloseTo(250, 9);
  });

  it("reports falling prices as negative inflation and a buying-power gain", () => {
    const r = adjustForInflation({ amount: 100, fromYear: 2002, toYear: 2003, series: TOY })!;
    expect(r.value).toBeCloseTo((100 * 115) / 121, 12);
    expect(r.cumulativePercent).toBeLessThan(0);
    expect(r.averageAnnualPercent).toBeLessThan(0);
    expect(r.purchasingPowerLossPercent).toBeLessThan(0);
  });

  it("returns the amount unchanged for the same year, with no average rate", () => {
    const r = adjustForInflation({ amount: 100, fromYear: 2002, toYear: 2002, series: TOY })!;
    expect(r.value).toBe(100);
    expect(r.years).toBe(0);
    expect(r.cumulativePercent).toBe(0);
    expect(r.averageAnnualPercent).toBeNull();
    expect(r.path).toHaveLength(1);
  });

  it("walks every year in order, in the from-year's money", () => {
    const r = adjustForInflation({ amount: 100, fromYear: 2003, toYear: 2001, series: TOY })!;
    expect(r.path.map((p) => p.year)).toEqual([2001, 2002, 2003]);
    // At the from-year the amount is itself; at the to-year it's the result.
    expect(r.path[2]!.value).toBeCloseTo(100, 12);
    expect(r.path[0]!.value).toBeCloseTo(r.value, 12);
    expect(r.path[1]!.yearlyPercent).toBeCloseTo(10, 12);
    expect(r.path[2]!.yearlyPercent).toBeCloseTo((115 / 121 - 1) * 100, 12);
  });

  it("has no yearly change for the series' first year", () => {
    const r = adjustForInflation({ amount: 1, fromYear: 2000, toYear: 2001, series: TOY })!;
    expect(r.path[0]!.yearlyPercent).toBeNull();
    expect(r.path[1]!.yearlyPercent).toBeCloseTo(10, 12);
  });

  it("handles zero and very large amounts", () => {
    expect(adjustForInflation({ amount: 0, fromYear: 2000, toYear: 2004, series: TOY })!.value).toBe(0);
    const big = adjustForInflation({ amount: 1e12, fromYear: 1960, toYear: 2024, series: US })!;
    expect(Number.isFinite(big.value)).toBe(true);
    expect(big.value / 1e12).toBeCloseTo(143.857 / 13.5631, 9);
  });

  it("guards missing years, gaps and bad amounts", () => {
    expect(adjustForInflation({ amount: 100, fromYear: 1999, toYear: 2002, series: TOY })).toBeNull();
    expect(adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2030, series: TOY })).toBeNull();
    expect(adjustForInflation({ amount: -1, fromYear: 2000, toYear: 2002, series: TOY })).toBeNull();
    expect(adjustForInflation({ amount: Number.NaN, fromYear: 2000, toYear: 2002, series: TOY })).toBeNull();
    const gappy = { values: { 2000: 100, 2002: 121 } };
    expect(adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2002, series: gappy })).toBeNull();
    const broken = { values: { 2000: 0, 2001: 110 } };
    expect(adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2001, series: broken })).toBeNull();
  });

  it("matches the real US figures for 2000 → 2024", () => {
    const r = adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2024, series: US })!;
    expect(r.value).toBeCloseTo((100 * 143.857) / 78.9707, 9);
    expect(r.path).toHaveLength(25);
  });
});

describe("countryInSentence", () => {
  it("adds \"the\" where English needs it", () => {
    expect(countryInSentence(US)).toBe("the United States");
    expect(countryInSentence(findCpiCountry("GB")!)).toBe("the United Kingdom");
    expect(countryInSentence(findCpiCountry("AE")!)).toBe("the United Arab Emirates");
    expect(countryInSentence(findCpiCountry("TR")!)).toBe("Türkiye");
    expect(countryInSentence(IN)).toBe("India");
  });
});

describe("flagEmoji", () => {
  it("builds the flag from regional-indicator letters", () => {
    expect(flagEmoji("IN")).toBe("\u{1F1EE}\u{1F1F3}");
    expect(flagEmoji("us")).toBe("🇺🇸");
    expect(flagEmoji(" gb ")).toBe("🇬🇧");
  });

  it("returns nothing for anything that isn't a two-letter code", () => {
    expect(flagEmoji("")).toBe("");
    expect(flagEmoji("USA")).toBe("");
    expect(flagEmoji("1A")).toBe("");
    expect(flagEmoji("É")).toBe("");
  });
});

describe("currencyTag", () => {
  it("puts the locale's symbol before the code", () => {
    expect(currencyTag("INR", "en-US")).toBe("₹ INR");
    expect(currencyTag("USD", "en-US")).toBe("$ USD");
    expect(currencyTag("GBP", "en-GB")).toBe("£ GBP");
    expect(currencyTag("EUR", "de-DE")).toBe("€ EUR");
  });

  it("falls back to the app's symbol where the locale only knows the code", () => {
    // en-US formats these as "SGD", "ZAR", "TRY"…
    expect(currencyTag("SGD", "en-US")).toBe("S$ SGD");
    expect(currencyTag("ZAR", "en-US")).toBe("R ZAR");
    expect(currencyTag("TRY", "en-US")).toBe("₺ TRY");
    expect(currencyTag("IDR", "en-US")).toBe("Rp IDR");
  });

  it("has a symbol for every country's currency, never the code twice", () => {
    for (const c of CPI_COUNTRIES) {
      const tag = currencyTag(c.currency, "en-US");
      expect(tag.endsWith(` ${c.currency}`), c.name).toBe(true);
      expect(tag.split(c.currency).length - 1, c.name).toBe(1);
    }
  });
});

describe("parseCountryList", () => {
  it("reads known codes in order, once each, in any case", () => {
    expect(parseCountryList("IN,US,GB")).toEqual(["IN", "US", "GB"]);
    expect(parseCountryList(" gb , in ")).toEqual(["GB", "IN"]);
    expect(parseCountryList("US,US,us")).toEqual(["US"]);
  });

  it("drops unknown and malformed entries", () => {
    expect(parseCountryList("")).toEqual([]);
    expect(parseCountryList(",,,")).toEqual([]);
    expect(parseCountryList("XX,NG,NL")).toEqual([]);
    expect(parseCountryList("XX,JP,<script>")).toEqual(["JP"]);
  });

  it("caps the list at every country we have", () => {
    const all = CPI_COUNTRIES.map((c) => c.country);
    const doubled = [...all, ...all].join(",");
    expect(parseCountryList(doubled)).toEqual(all);
    expect(parseCountryList(doubled)).toHaveLength(MAX_COUNTRIES);
  });
});

describe("defaultCountries", () => {
  it("is fixed on the server, so the static page never depends on the visitor", () => {
    expect(defaultCountries(null)).toEqual(["US", "GB", "IN"]);
    expect(defaultCountries(null)).toEqual([...SERVER_COUNTRIES]);
  });

  it("leads with the visitor's own country, then the US and the UK", () => {
    expect(defaultCountries("IN")).toEqual(["IN", "US", "GB"]);
    expect(defaultCountries("de")).toEqual(["DE", "US", "GB"]);
  });

  it("doesn't repeat the US or the UK", () => {
    expect(defaultCountries("US")).toEqual(["US", "GB"]);
    expect(defaultCountries("GB")).toEqual(["GB", "US"]);
  });

  it("falls back to the US and the UK for a region we don't cover, or none", () => {
    expect(defaultCountries("NG")).toEqual(["US", "GB"]);
    expect(defaultCountries("")).toEqual(["US", "GB"]);
  });
});

describe("commonLastYear", () => {
  it("is the newest year every country has", () => {
    expect(commonLastYear([US, IN])).toBe(2024);
    expect(commonLastYear([IN, findCpiCountry("GB")!])).toBe(2025);
    expect(commonLastYear([])).toBe(YEAR_RANGE.lastYear);
  });
});

describe("coverageNote", () => {
  const BR = findCpiCountry("BR")!;
  it("says where the data starts or stops, whichever way round the years are", () => {
    expect(coverageNote(BR, 1990, 2020)).toBe("Data starts in 1995");
    expect(coverageNote(BR, 2020, 1990)).toBe("Data starts in 1995");
    expect(coverageNote(US, 2000, 2025)).toBe("Data runs to 2024");
    expect(coverageNote(US, 2025, 2000)).toBe("Data runs to 2024");
  });

  it("is null when the series covers both years, including its first and last", () => {
    expect(coverageNote(BR, 1995, 2025)).toBeNull();
    expect(coverageNote(US, 1960, 2024)).toBeNull();
  });
});

describe("compareInflation", () => {
  it("gives each country its own answer, in the order given", () => {
    const rows = compareInflation({
      amount: 100,
      fromYear: 2000,
      toYear: 2024,
      countries: [IN, US, findCpiCountry("TR")!],
    });
    expect(rows.map((r) => r.series.country)).toEqual(["IN", "US", "TR"]);
    expect(rows[0]!.result!.value).toBeCloseTo((100 * cpiFor(IN, 2024)!) / 54.3383, 9);
    expect(rows[1]!.result!.value).toBeCloseTo((100 * 143.857) / 78.9707, 9);
    expect(rows[2]!.result).toBeNull();
    expect(rows[2]!.note).toBe("Data starts in 2005");
  });

  it("matches a single-country calculation exactly", () => {
    const [row] = compareInflation({ amount: 250, fromYear: 2024, toYear: 1990, countries: [IN] });
    const single = adjustForInflation({ amount: 250, fromYear: 2024, toYear: 1990, series: IN })!;
    expect(row!.result).toEqual(single);
    expect(row!.note).toBeNull();
  });

  it("returns an empty comparison for no countries", () => {
    expect(compareInflation({ amount: 100, fromYear: 2000, toYear: 2024, countries: [] })).toEqual([]);
  });

  it("covers every country from 2007 on (the UAE's first year) to 2024", () => {
    const rows = compareInflation({ amount: 1, fromYear: 2007, toYear: 2024, countries: CPI_COUNTRIES });
    expect(rows.every((r) => r.result !== null)).toBe(true);
  });
});

describe("indexedPaths", () => {
  it("rebases every country so the from-year is 100", () => {
    const { codes, rows } = indexedPaths([US, IN], 2000, 2024);
    expect(codes).toEqual(["US", "IN"]);
    expect(rows).toHaveLength(25);
    expect(rows[0]!.year).toBe(2000);
    expect(rows[0]!.US).toBeCloseTo(100, 12);
    expect(rows[0]!.IN).toBeCloseTo(100, 12);
    // The end of each line is 100 × the ratio: the single-country answer for 100.
    expect(rows[24]!.US).toBeCloseTo(adjustForInflation({ amount: 100, fromYear: 2000, toYear: 2024, series: US })!.value, 9);
  });

  it("puts the 100 at the from-year when the years run backwards", () => {
    const { rows } = indexedPaths([US], 2024, 2000);
    expect(rows[0]!.year).toBe(2000);
    expect(rows.at(-1)!.year).toBe(2024);
    expect(rows.at(-1)!.US).toBeCloseTo(100, 12);
    expect(rows[0]!.US).toBeCloseTo((78.9707 / 143.857) * 100, 9);
  });

  it("leaves out countries without figures for the whole span", () => {
    const { codes, rows } = indexedPaths([findCpiCountry("TR")!, US, findCpiCountry("GB")!], 2000, 2025);
    expect(codes).toEqual(["GB"]);
    expect(rows[0]).not.toHaveProperty("TR");
    expect(rows[0]).not.toHaveProperty("US");
  });

  it("is a single row for a single year", () => {
    const { rows } = indexedPaths([US], 2010, 2010);
    expect(rows).toEqual([{ year: 2010, US: 100 }]);
  });
});
