import { describe, it, expect } from "vitest";
import {
  BUCKET_LABEL,
  DAY_TICKS_MAX,
  TREND_MIN_DAYS,
  bucketFor,
  buildTrend,
  dayTicks,
  needsDaily,
  trendColumnName,
  trendSpan,
  type TrendPoint,
} from "@/lib/trend";

describe("trendSpan — the range, never less than a month", () => {
  it("widens a range inside one month to that whole month", () => {
    expect(trendSpan("2026-10-05", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(trendSpan("2026-10-01", "2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(trendSpan("2027-02-10", "2027-02-11")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("widens a short range across two months back to 30 days", () => {
    expect(trendSpan("2026-10-20", "2026-11-05")).toEqual({ from: "2026-10-07", to: "2026-11-05" });
    expect(TREND_MIN_DAYS).toBe(30);
  });

  it("keeps a range of a month or more as it is", () => {
    expect(trendSpan("2026-08-01", "2026-10-07")).toEqual({ from: "2026-08-01", to: "2026-10-07" });
    expect(trendSpan("2026-09-20", "2026-10-25")).toEqual({ from: "2026-09-20", to: "2026-10-25" });
  });
});

describe("bucketFor — readable columns", () => {
  it("uses days to a month, weeks to 14 weeks, months to 3 years, then years", () => {
    expect(bucketFor({ from: "2026-10-01", to: "2026-10-31" })).toBe("day");
    expect(bucketFor({ from: "2026-08-01", to: "2026-10-07" })).toBe("week"); // the "3 months" preset
    expect(bucketFor({ from: "2026-07-01", to: "2026-10-06" })).toBe("week"); // 98 days
    expect(bucketFor({ from: "2026-07-01", to: "2026-10-07" })).toBe("month"); // 99 days
    expect(bucketFor({ from: "2025-11-01", to: "2026-10-07" })).toBe("month"); // "12 months"
    expect(bucketFor({ from: "2023-11-01", to: "2026-10-07" })).toBe("month"); // 36 months
    expect(bucketFor({ from: "2023-10-01", to: "2026-10-07" })).toBe("year");
    expect(needsDaily("day") && needsDaily("week")).toBe(true);
    expect(needsDaily("month") || needsDaily("year")).toBe(false);
    expect(BUCKET_LABEL.week).toBe("By week");
  });
});

describe("buildTrend", () => {
  const daily = [
    { date: "2026-10-01", income: 500000, expense: 150000 },
    { date: "2026-10-05", income: 0, expense: 2000 },
    { date: "2026-10-12", income: 0, expense: 8000 },
    { date: "2026-11-01", income: 0, expense: 99999 }, // outside the span
  ];

  it("has a column for every day of a month, empty ones included", () => {
    const t = buildTrend({ span: { from: "2026-10-01", to: "2026-10-31" }, firstDay: 1, daily });
    expect(t.bucket).toBe("day");
    expect(t.points).toHaveLength(31);
    expect(t.points[0]).toEqual({ key: "2026-10-01", from: "2026-10-01", to: "2026-10-01", income: 500000, expense: 150000 });
    expect(t.points[1]).toMatchObject({ income: 0, expense: 0 });
    expect(t.income).toBe(500000);
    expect(t.expense).toBe(160000);
    // Free: nothing beyond income and expenses.
    expect(t.kept).toBeUndefined();
    expect(t.points.every((p) => p.net === undefined)).toBe(true);
  });

  it("adds what was kept, per column and in all, for Plus and Pro", () => {
    const t = buildTrend({ span: { from: "2026-10-01", to: "2026-10-31" }, firstDay: 1, daily, kept: true });
    expect(t.points[0].net).toBe(350000);
    expect(t.points[4].net).toBe(-2000);
    expect(t.kept).toEqual({ net: 340000, savingsRate: 0.68 });
    const none = buildTrend({ span: { from: "2026-10-01", to: "2026-10-31" }, firstDay: 1, daily: [], kept: true });
    expect(none.kept).toEqual({ net: 0, savingsRate: null });
  });

  it("groups weeks from the locale's first day, clipped to the span", () => {
    // 1 Aug 2026 is a Saturday.
    const span = { from: "2026-08-01", to: "2026-10-07" };
    const monday = buildTrend({ span, firstDay: 1, daily: [{ date: "2026-08-01", income: 0, expense: 700 }, { date: "2026-08-03", income: 0, expense: 300 }] });
    expect(monday.bucket).toBe("week");
    expect(monday.points[0]).toMatchObject({ key: "2026-08-01", from: "2026-08-01", to: "2026-08-02", expense: 700 });
    expect(monday.points[1]).toMatchObject({ key: "2026-08-03", from: "2026-08-03", to: "2026-08-09", expense: 300 });
    expect(monday.points.at(-1)).toMatchObject({ from: "2026-10-05", to: "2026-10-07" });
    const sunday = buildTrend({ span, firstDay: 0 });
    expect(sunday.points[0]).toMatchObject({ from: "2026-08-01", to: "2026-08-01" });
    expect(sunday.points[1]).toMatchObject({ from: "2026-08-02", to: "2026-08-08" });
  });

  it("uses month totals for months, and adds them up for years", () => {
    const monthly = [
      { month: "2025-12", income: 100, expense: 40 },
      { month: "2026-01", income: 100, expense: 60 },
      { month: "2026-10", income: 100, expense: 10 },
    ];
    const months = buildTrend({ span: { from: "2025-11-01", to: "2026-10-07" }, firstDay: 1, monthly });
    expect(months.bucket).toBe("month");
    expect(months.points.map((p) => p.key)).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(months.points.at(-1)).toMatchObject({ from: "2026-10-01", to: "2026-10-07", income: 100, expense: 10 });
    const years = buildTrend({ span: { from: "2022-06-01", to: "2026-10-07" }, firstDay: 1, monthly });
    expect(years.bucket).toBe("year");
    expect(years.points.map((p) => [p.key, p.income, p.expense])).toEqual([
      ["2022", 0, 0],
      ["2023", 0, 0],
      ["2024", 0, 0],
      ["2025", 100, 40],
      ["2026", 200, 70],
    ]);
    expect(years.points[0]).toMatchObject({ from: "2022-06-01", to: "2022-12-31" });
  });
});

describe("labels", () => {
  /** ICU puts thin spaces around the range dash; compare with plain ones. */
  const plain = (s: string) => s.replace(/\s/g, " ");
  const point = (key: string, from: string, to: string): TrendPoint => ({ key, from, to, income: 0, expense: 0 });

  it("names whole periods as such, and clipped ones by the days they cover", () => {
    expect(trendColumnName(point("2026-07", "2026-07-01", "2026-07-31"), "month", "en-US")).toBe("July 2026");
    expect(plain(trendColumnName(point("2026-07", "2026-07-15", "2026-07-31"), "month", "en-US"))).toBe(
      "Jul 15 – 31, 2026",
    );
    expect(trendColumnName(point("2025", "2025-01-01", "2025-12-31"), "year", "en-US")).toBe("2025");
    expect(plain(trendColumnName(point("2026", "2026-01-01", "2026-10-07"), "year", "en-US"))).toBe(
      "Jan 1 – Oct 7, 2026",
    );
    expect(plain(trendColumnName(point("2026-12-28", "2026-12-28", "2027-01-03"), "week", "en-US"))).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
    expect(trendColumnName(point("2026-10-05", "2026-10-05", "2026-10-05"), "day", "en-US")).toBe("Oct 5, 2026");
    expect(plain(trendColumnName(point("2026-07", "2026-07-15", "2026-07-31"), "month", "en-GB"))).toBe(
      "15 – 31 Jul 2026",
    );
  });

  it("labels day columns every few days, with the month first and where it changes", () => {
    const span = { from: "2026-09-08", to: "2026-10-07" };
    const t = buildTrend({ span, firstDay: 1 });
    const ticks = dayTicks(t.points, "en-US");
    expect(ticks.length).toBeLessThanOrEqual(DAY_TICKS_MAX);
    expect(ticks.map((x) => x.label)).toEqual(["Sep 8", "13", "18", "23", "28", "Oct 3"]);
    // Every label is a real column.
    expect(ticks.every((x) => t.points.some((p) => p.key === x.key))).toBe(true);
    const october = dayTicks(buildTrend({ span: { from: "2026-10-01", to: "2026-10-31" }, firstDay: 1 }).points, "en-US");
    expect(october[0].label).toBe("Oct 1");
    expect(october.slice(1).every((x) => /^\d+$/.test(x.label))).toBe(true);
    expect(dayTicks(october.map((x) => point(x.key, x.key, x.key)), "en-US", 100)).toHaveLength(october.length);
  });
});
