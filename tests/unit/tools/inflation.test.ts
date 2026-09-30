import { describe, expect, it } from "vitest";
import { isSupportedCurrency } from "@/lib/currencies";
import { COUNTRY_TO_CURRENCY } from "@/lib/geo";
import { CPI_COUNTRIES, CPI_FETCHED_ON, CPI_SOURCE, findCpiCountry } from "@/lib/tools/data/cpi";
import { adjustForInflation, clampYear, countryInSentence, cpiFor } from "@/lib/tools/inflation";

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

  it("covers the countries the page promises", () => {
    expect(CPI_COUNTRIES.length).toBeGreaterThanOrEqual(20);
    for (const code of ["IN", "US", "GB", "DE", "FR", "CA", "AU", "JP", "SG", "AE", "NG", "KE"]) {
      expect(findCpiCountry(code), code).not.toBeNull();
    }
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
    expect(countryInSentence(findCpiCountry("NL")!)).toBe("the Netherlands");
    expect(countryInSentence(IN)).toBe("India");
  });
});
