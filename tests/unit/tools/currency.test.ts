import { describe, expect, it } from "vitest";
import {
  MAX_LABEL,
  MAX_TARGETS,
  MAX_TRIP_ROWS,
  RATES_MAX_AGE_MS,
  convert,
  crossRate,
  currencyDecimals,
  decodeTargets,
  decodeTripRows,
  defaultTargets,
  defaultTripCurrency,
  encodeTargets,
  encodeTripRows,
  formatRateDate,
  hasRate,
  isFresh,
  parseCurrencyApiRates,
  parseFrankfurterRates,
  restoreRateTable,
  roundTo,
  roundToCurrency,
  tripTotals,
  unitRateDecimals,
  type RateList,
  type RateTable,
} from "@/lib/tools/currency";

// Fixture rates, units per 1 USD (shaped like late-September 2026 data).
const RATES: RateList = {
  base: "USD",
  date: "2026-09-30",
  rates: {
    USD: 1,
    EUR: 0.88,
    GBP: 0.75,
    INR: 96,
    JPY: 157.12,
    KWD: 0.30871,
    AED: 3.6725,
    IDR: 17922,
    SGD: 1.2773,
  },
};

describe("parseFrankfurterRates", () => {
  const body = [
    { date: "2026-09-30", base: "USD", quote: "EUR", rate: 0.88052 },
    { date: "2026-09-29", base: "USD", quote: "GBP", rate: 0.7548 },
    { date: "2026-09-30", base: "USD", quote: "INR", rate: 95.92 },
    { date: "2026-09-30", base: "USD", quote: "XAU", rate: 0.0003 }, // not a currency the tools list
    { date: "2026-09-30", base: "USD", quote: "JPY", rate: 0 }, // not a rate
    { date: "2026-09-30", base: "USD", quote: "CHF", rate: "0.83" }, // not a number
    { date: "2026-10-01", base: "EUR", quote: "SGD", rate: 1.45 }, // another base
    { date: "yesterday", base: "USD", quote: "AED", rate: 3.67 }, // bad date
    null,
    "junk",
  ];

  it("keeps valid rows for known currencies and adds the base at 1", () => {
    const list = parseFrankfurterRates(body)!;
    expect(list.base).toBe("USD");
    expect(list.rates).toEqual({ USD: 1, EUR: 0.88052, GBP: 0.7548, INR: 95.92 });
  });

  it("dates the list by its newest accepted rate", () => {
    // The EUR-based SGD row is dated later but isn't accepted.
    expect(parseFrankfurterRates(body)!.date).toBe("2026-09-30");
  });

  it("returns null for error bodies and empty lists", () => {
    expect(parseFrankfurterRates({ message: "not found" })).toBeNull();
    expect(parseFrankfurterRates([])).toBeNull();
    expect(parseFrankfurterRates(null)).toBeNull();
    expect(parseFrankfurterRates([{ date: "2026-09-30", base: "USD", quote: "XAU", rate: 1 }])).toBeNull();
  });
});

describe("parseCurrencyApiRates", () => {
  it("reads lower-case codes and drops crypto and unknown codes", () => {
    const list = parseCurrencyApiRates({
      date: "2026-09-29",
      usd: { eur: 0.8802, inr: 96.08, btc: 0.000012, "1inch": 9.9, usd: 1, kwd: 0.3087, aed: -1 },
    })!;
    expect(list).toEqual({ base: "USD", date: "2026-09-29", rates: { USD: 1, EUR: 0.8802, INR: 96.08, KWD: 0.3087 } });
  });

  it("returns null without a date, a rate list, or any usable rate", () => {
    expect(parseCurrencyApiRates({ usd: { eur: 0.88 } })).toBeNull();
    expect(parseCurrencyApiRates({ date: "2026-09-29" })).toBeNull();
    expect(parseCurrencyApiRates({ date: "2026-09-29", usd: [] })).toBeNull();
    expect(parseCurrencyApiRates({ date: "2026-09-29", usd: { btc: 0.00001 } })).toBeNull();
    expect(parseCurrencyApiRates([])).toBeNull();
    expect(parseCurrencyApiRates("oops")).toBeNull();
  });
});

describe("restoreRateTable", () => {
  const table: RateTable = { ...RATES, source: "frankfurter", fetchedAt: 1_790_000_000_000 };

  it("round-trips through JSON", () => {
    expect(restoreRateTable(JSON.parse(JSON.stringify(table)))).toEqual(table);
  });

  it("drops bad entries but keeps the rest", () => {
    const restored = restoreRateTable({ ...table, rates: { EUR: 0.88, GBP: "x", toString: 5, INR: -2 } })!;
    expect(restored.rates).toEqual({ USD: 1, EUR: 0.88 });
  });

  it("rejects anything that isn't a table", () => {
    expect(restoreRateTable(null)).toBeNull();
    expect(restoreRateTable("{}")).toBeNull();
    expect(restoreRateTable({ ...table, source: "elsewhere" })).toBeNull();
    expect(restoreRateTable({ ...table, fetchedAt: "today" })).toBeNull();
    expect(restoreRateTable({ ...table, date: "30/09/2026" })).toBeNull();
    expect(restoreRateTable({ ...table, base: "XXX" })).toBeNull();
    expect(restoreRateTable({ ...table, rates: {} })).toBeNull();
  });
});

describe("isFresh", () => {
  const now = 1_790_000_000_000;
  it("is fresh for 12 hours after the download", () => {
    expect(isFresh(now, now)).toBe(true);
    expect(isFresh(now - RATES_MAX_AGE_MS + 1, now)).toBe(true);
    expect(isFresh(now - RATES_MAX_AGE_MS, now)).toBe(false);
    expect(isFresh(now - 3 * RATES_MAX_AGE_MS, now)).toBe(false);
  });

  it("treats a download stamped in the future as stale", () => {
    expect(isFresh(now + 60_000, now)).toBe(false);
  });
});

describe("crossRate", () => {
  it("reads rates against the base both ways", () => {
    expect(crossRate(RATES, "USD", "INR")).toBe(96);
    expect(crossRate(RATES, "INR", "USD")).toBeCloseTo(1 / 96, 15);
  });

  it("crosses two non-base currencies through the base", () => {
    // 1 EUR = 96 ÷ 0.88 INR.
    expect(crossRate(RATES, "EUR", "INR")).toBeCloseTo(109.0909090909, 9);
    expect(crossRate(RATES, "GBP", "EUR")).toBeCloseTo(0.88 / 0.75, 15);
    // A → B → A comes back to 1.
    expect(crossRate(RATES, "EUR", "JPY")! * crossRate(RATES, "JPY", "EUR")!).toBeCloseTo(1, 12);
  });

  it("is 1 for the same currency, even one the list lacks", () => {
    expect(crossRate(RATES, "EUR", "EUR")).toBe(1);
    expect(crossRate(RATES, "BGN", "BGN")).toBe(1);
  });

  it("is null when either currency is missing", () => {
    expect(crossRate(RATES, "USD", "BGN")).toBeNull();
    expect(crossRate(RATES, "BGN", "USD")).toBeNull();
    expect(crossRate(RATES, "USD", "toString")).toBeNull();
    expect(crossRate(RATES, "constructor", "USD")).toBeNull();
    expect(hasRate(RATES, "BGN")).toBe(false);
    expect(hasRate(RATES, "USD")).toBe(true);
  });
});

describe("rounding", () => {
  it("rounds half away from zero, as the number reads", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(0.5, 0)).toBe(1);
    expect(roundTo(1.0005, 3)).toBe(1.001);
    expect(roundTo(1.2344, 3)).toBe(1.234);
  });

  it("leaves values past minor-unit precision, and non-numbers, alone", () => {
    expect(roundTo(1e20 + 0.3, 2)).toBe(1e20 + 0.3);
    expect(roundTo(Number.NaN, 2)).toBeNaN();
    expect(roundTo(Infinity, 2)).toBe(Infinity);
  });

  it("uses each currency's own decimals", () => {
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
    expect(currencyDecimals("XYZ")).toBe(2);
    expect(roundToCurrency(1234.5678, "USD")).toBe(1234.57);
    expect(roundToCurrency(1234.5678, "JPY")).toBe(1235);
    expect(roundToCurrency(1234.5678, "KWD")).toBe(1234.568);
  });
});

describe("convert", () => {
  it("converts and rounds to the target currency", () => {
    expect(convert(100, "USD", "INR", RATES)).toBe(9600);
    expect(convert(100, "USD", "EUR", RATES)).toBe(88);
    expect(convert(100, "USD", "JPY", RATES)).toBe(15712);
    expect(convert(1, "USD", "JPY", RATES)).toBe(157);
    expect(convert(100, "USD", "KWD", RATES)).toBe(30.871);
    // 1 EUR = 109.0909… INR.
    expect(convert(1, "EUR", "INR", RATES)).toBe(109.09);
    // 1,000 INR in euros: 1000 × 0.88 ÷ 96 = 9.1666…
    expect(convert(1000, "INR", "EUR", RATES)).toBe(9.17);
  });

  it("handles zero, negatives and small amounts", () => {
    expect(convert(0, "USD", "EUR", RATES)).toBe(0);
    expect(convert(-100, "USD", "EUR", RATES)).toBe(-88);
    // Too small to show in yen.
    expect(convert(0.001, "USD", "JPY", RATES)).toBe(0);
  });

  it("stays finite for huge amounts", () => {
    const v = convert(1e15, "USD", "IDR", RATES)!;
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(1.7922e19, -5);
  });

  it("is null for a missing currency or a non-number", () => {
    expect(convert(100, "USD", "BGN", RATES)).toBeNull();
    expect(convert(100, "BGN", "USD", RATES)).toBeNull();
    expect(convert(Number.NaN, "USD", "EUR", RATES)).toBeNull();
  });
});

describe("unitRateDecimals", () => {
  it("shows about six significant figures", () => {
    expect(unitRateDecimals(95.92)).toBe(4);
    expect(unitRateDecimals(1.2773)).toBe(4);
    expect(unitRateDecimals(1)).toBe(4);
    expect(unitRateDecimals(1353.36)).toBe(2);
    expect(unitRateDecimals(17922)).toBe(1);
    expect(unitRateDecimals(1_500_000)).toBe(0);
  });

  it("keeps small rates from rounding to zero", () => {
    expect(unitRateDecimals(0.88)).toBe(5);
    expect(unitRateDecimals(0.010425)).toBe(6);
    expect(unitRateDecimals(0.0000558)).toBe(9);
    expect(unitRateDecimals(1e-12)).toBe(10);
  });

  it("falls back to 2 for nonsense", () => {
    expect(unitRateDecimals(0)).toBe(2);
    expect(unitRateDecimals(-1)).toBe(2);
    expect(unitRateDecimals(Number.NaN)).toBe(2);
  });
});

describe("tripTotals", () => {
  // The page's worked example: 1 EUR = 1.14 USD.
  const EXAMPLE: RateList = { base: "USD", date: "2026-09-30", rates: { USD: 1, EUR: 1 / 1.14 } };

  it("adds up the expenses and converts the total", () => {
    const t = tripTotals([360, 180, 95, 48], "EUR", "USD", EXAMPLE, 3)!;
    expect(t.rate).toBeCloseTo(1.14, 12);
    expect(t.totalTrip).toBe(683);
    expect(t.totalHome).toBe(778.62);
    expect(t.rowsHome).toEqual([410.4, 205.2, 108.3, 54.72]);
    expect(t.totalWithMarkup).toBe(801.98);
  });

  it("has no markup total without a markup", () => {
    expect(tripTotals([10], "EUR", "USD", EXAMPLE)!.totalWithMarkup).toBeNull();
    expect(tripTotals([10], "EUR", "USD", EXAMPLE, 0)!.totalWithMarkup).toBeNull();
  });

  it("sums exactly in the trip currency", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floats; in cents it's 30.
    expect(tripTotals([0.1, 0.2], "EUR", "EUR", RATES)!.totalTrip).toBe(0.3);
    expect(tripTotals([0.1, 0.2], "EUR", "EUR", RATES)!.totalHome).toBe(0.3);
  });

  it("rounds each row so the rows add up to the total", () => {
    // Amounts whose shares, each rounded on its own, would drift off the total.
    const cases: [number[], string, string][] = [
      [[1, 1, 1], "USD", "JPY"],
      [[0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01], "USD", "EUR"],
      [[12.34, 56.78, 90.12, 3.45], "EUR", "INR"],
      [[1000, 2500, 333.33], "INR", "KWD"],
      [[5, 5, 5], "GBP", "IDR"],
    ];
    for (const [amounts, trip, home] of cases) {
      const t = tripTotals(amounts, trip, home, RATES)!;
      const scale = 10 ** currencyDecimals(home);
      const sum = t.rowsHome.reduce((s, r) => s + Math.round(r * scale), 0);
      expect(sum).toBe(Math.round(t.totalHome * scale));
      // And each row is within one minor unit of its exact share.
      amounts.forEach((a, i) => {
        const exact = a * t.rate;
        expect(Math.abs(t.rowsHome[i]! - exact)).toBeLessThanOrEqual(1 / scale + 1e-9);
      });
    }
  });

  it("works for zero-decimal and three-decimal currencies", () => {
    const t = tripTotals([1000, 2000], "JPY", "KWD", RATES)!;
    // 3,000 yen × 0.30871 ÷ 157.12 = 5.8944… KWD.
    expect(t.totalTrip).toBe(3000);
    expect(t.totalHome).toBe(5.894);
    // Yen amounts round to whole yen.
    expect(tripTotals([10.6], "JPY", "JPY", RATES)!.totalTrip).toBe(11);
  });

  it("handles an empty list and zero amounts", () => {
    const empty = tripTotals([], "EUR", "USD", RATES)!;
    expect(empty.totalTrip).toBe(0);
    expect(empty.totalHome).toBe(0);
    expect(empty.rowsHome).toEqual([]);
    expect(tripTotals([0, 0], "EUR", "USD", RATES)!.rowsHome).toEqual([0, 0]);
  });

  it("stays finite for huge amounts", () => {
    const t = tripTotals([1e13, 1e13], "USD", "IDR", RATES)!;
    expect(Number.isFinite(t.totalHome)).toBe(true);
    expect(t.rowsHome.every(Number.isFinite)).toBe(true);
  });

  it("is null for a missing currency", () => {
    expect(tripTotals([10], "BGN", "USD", RATES)).toBeNull();
    expect(tripTotals([10], "EUR", "BGN", RATES)).toBeNull();
  });
});

describe("target list", () => {
  it("starts with the visitor's currency, then the popular ones, without the from currency", () => {
    expect(defaultTargets("JPY", "USD")).toEqual(["JPY", "EUR", "GBP", "INR", "AED", "SGD"]);
    expect(defaultTargets("INR", "USD")).toEqual(["INR", "EUR", "GBP", "AED", "SGD"]);
    expect(defaultTargets("USD", "USD")).toEqual(["EUR", "GBP", "INR", "AED", "SGD"]);
    expect(defaultTargets("USD", "EUR")).toEqual(["USD", "GBP", "INR", "AED", "SGD"]);
    expect(defaultTargets("nope", "USD")).toEqual(["EUR", "GBP", "INR", "AED", "SGD"]);
  });

  it("round-trips, de-duplicated and capped", () => {
    expect(encodeTargets(["INR", "eur", "INR", "XYZ"])).toBe("INR,EUR");
    expect(decodeTargets("INR,EUR")).toEqual(["INR", "EUR"]);
    const many = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "JPY", "CAD", "AUD", "CHF"];
    expect(decodeTargets(encodeTargets(many))).toHaveLength(MAX_TARGETS);
    expect(decodeTargets(many.join(","))).toEqual(many.slice(0, MAX_TARGETS));
  });

  it("tells an empty list apart from 'use the defaults'", () => {
    expect(encodeTargets([])).toBe("-");
    expect(decodeTargets("-")).toEqual([]);
    expect(decodeTargets("")).toBeNull();
    expect(decodeTargets("  ")).toBeNull();
  });

  it("reads a hand-edited link without throwing", () => {
    expect(decodeTargets(" inr , ,eur,toString,<script>")).toEqual(["INR", "EUR"]);
    expect(decodeTargets(",,,")).toEqual([]);
  });
});

describe("trip rows", () => {
  it("round-trips the list", () => {
    const rows = [
      { label: "Hotel, 3 nights", amount: "360" },
      { label: "Food", amount: "180.50" },
      { label: "", amount: "" },
    ];
    expect(encodeTripRows(rows)).toBe("Hotel, 3 nights~360|Food~180.50|~");
    expect(decodeTripRows(encodeTripRows(rows))).toEqual(rows);
  });

  it("keeps separators out of labels and amounts", () => {
    const encoded = encodeTripRows([{ label: "Taxi | tips ~ bus", amount: "1 2|3~4" }]);
    expect(decodeTripRows(encoded)).toEqual([{ label: "Taxi  tips  bus", amount: "1234" }]);
  });

  it("keeps a trailing space while typing", () => {
    expect(decodeTripRows(encodeTripRows([{ label: "Hotel ", amount: "1" }]))[0]!.label).toBe("Hotel ");
  });

  it("caps rows and label length", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ label: "x".repeat(60), amount: String(i) }));
    const decoded = decodeTripRows(encodeTripRows(rows));
    expect(decoded).toHaveLength(MAX_TRIP_ROWS);
    expect(decoded[0]!.label).toHaveLength(MAX_LABEL);
    expect(decodeTripRows(rows.map((r) => `${r.label}~${r.amount}`).join("|"))).toHaveLength(MAX_TRIP_ROWS);
  });

  it("reads missing fields as blanks", () => {
    expect(decodeTripRows("")).toEqual([]);
    expect(decodeTripRows("Hotel")).toEqual([{ label: "Hotel", amount: "" }]);
    expect(decodeTripRows("|")).toEqual([
      { label: "", amount: "" },
      { label: "", amount: "" },
    ]);
  });

  it("picks a trip currency that isn't home", () => {
    expect(defaultTripCurrency("USD")).toBe("EUR");
    expect(defaultTripCurrency("INR")).toBe("EUR");
    expect(defaultTripCurrency("EUR")).toBe("USD");
  });
});

describe("formatRateDate", () => {
  it("writes the date in the reader's order, without shifting the day", () => {
    // "Sep" or "Sept", depending on the ICU version.
    expect(formatRateDate("2026-09-30", "en-GB")).toMatch(/^30 Sept? 2026$/);
    expect(formatRateDate("2026-09-30", "en-US")).toBe("Sep 30, 2026");
    expect(formatRateDate("2024-02-29", "en-US")).toBe("Feb 29, 2024");
  });

  it("returns anything that isn't a date unchanged", () => {
    expect(formatRateDate("soon", "en-US")).toBe("soon");
  });
});
