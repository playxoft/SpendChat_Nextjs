import { describe, it, expect } from "vitest";
import {
  CALENDAR_MAX_MONTHS,
  addDays,
  buildAdvancedAnalytics,
  buildInsights,
  calendarMonths,
  calendarWindow,
  cashFlow,
  categoryTrends,
  daysBetween,
  daysIn,
  detectRecurring,
  findAnomalies,
  firstDayOfWeek,
  formatCompact,
  formatRounded,
  heatLevel,
  heatThresholds,
  median,
  monthCount,
  monthsEnding,
  nextMonthSameDay,
  normsFrom,
  paceSummary,
  pctChange,
  percentLabel,
  PACE_MIN_DAY,
  projectMonthEnd,
  projectionCurve,
  recurringLabel,
  ratioLabel,
  savingsRate,
  shiftMonth,
  weekdayOf,
  weekdayPattern,
  type AdvancedRaw,
  type CategoryInfo,
  type DailyTotal,
  type InsightInput,
  type MonthCategoryRow,
  type PaceSummary,
  type RecurringGroup,
} from "@/lib/insights";
import { sampleAdvancedRaw } from "@/lib/insights-sample";

const CATS: CategoryInfo[] = [
  { id: "food", name: "Food", icon: "🍽️" },
  { id: "rent", name: "Housing", icon: "🏠" },
  { id: "shop", name: "Shopping", icon: null },
];

const exp = (month: string, categoryId: string | null, total: number, toDate = total): MonthCategoryRow => ({
  month,
  type: "expense",
  categoryId,
  total,
  toDate,
});
const inc = (month: string, total: number, toDate = total): MonthCategoryRow => ({
  month,
  type: "income",
  categoryId: null,
  total,
  toDate,
});

describe("calendar arithmetic", () => {
  it("moves months across year ends and knows their lengths", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-11", 3)).toBe("2026-02");
    expect(shiftMonth("2026-10", -12)).toBe("2025-10");
    expect(daysIn("2024-02")).toBe(29);
    expect(daysIn("2026-02")).toBe(28);
    expect(daysIn("2026-10")).toBe(31);
    expect(monthsEnding("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("counts days on calendar dates, never the runtime's zone", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-31", "2026-03-01")).toBe(29);
    expect(daysBetween("2026-03-29", "2026-03-30")).toBe(1); // across a DST change in many zones
    expect(weekdayOf("2026-10-07")).toBe(3); // a Wednesday
  });

  it("clamps the same day next month to the month's length", () => {
    expect(nextMonthSameDay("2026-01-31")).toBe("2026-02-28");
    expect(nextMonthSameDay("2026-12-15")).toBe("2027-01-15");
  });
});

describe("small numbers", () => {
  it("takes medians, changes and savings rates without dividing by nothing", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(pctChange(132, 100)).toBeCloseTo(0.32);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
    expect(savingsRate(1000, 820)).toBeCloseTo(0.18);
    expect(savingsRate(0, 50)).toBeNull();
  });

  it("labels percentages and ratios the way the sentences use them", () => {
    expect(percentLabel(0.318)).toBe("32%");
    expect(percentLabel(-0.4)).toBe("40%");
    expect(ratioLabel(3)).toBe("3×");
    expect(ratioLabel(3.24)).toBe("3.2×");
    expect(ratioLabel(12.6)).toBe("13×");
  });

  it("rounds money to whole units in the currency's own format", () => {
    expect(formatRounded(123456, "USD", "en-US")).toBe("$1,235");
    expect(formatRounded(-5000, "USD", "en-US")).toBe("−$50");
    expect(formatRounded(1500, "JPY", "en-US")).toBe("¥1,500");
  });

  it("abbreviates axis ticks", () => {
    expect(formatCompact(1_250_000, "USD", "en-US")).toBe("$12.5K");
    expect(formatCompact(0, "USD", "en-US")).toBe("$0");
  });
});

describe("calendarWindow", () => {
  const today = "2026-10-07";

  it("stops at today, so this month's window is the 1st to today", () => {
    expect(calendarWindow(today, "2026-10-01", "2026-10-31")).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
      clamped: false,
    });
  });

  it("shows the last 12 months of all time, and says so", () => {
    expect(calendarWindow(today)).toEqual({ from: "2025-11-01", to: today, clamped: true });
    expect(calendarWindow(today, "2020-01-01", "2026-10-31")).toEqual({
      from: "2025-11-01",
      to: today,
      clamped: true,
    });
  });

  it("keeps a past range as it is, and a 12-month range unclamped", () => {
    expect(calendarWindow(today, "2025-01-01", "2025-03-31")).toEqual({
      from: "2025-01-01",
      to: "2025-03-31",
      clamped: false,
    });
    expect(calendarWindow(today, "2025-11-01", today).clamped).toBe(false);
    const w = calendarWindow(today);
    const months = new Set<string>();
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) months.add(d.slice(0, 7));
    expect(months.size).toBe(CALENDAR_MAX_MONTHS);
  });

  it("collapses a range that hasn't started to today", () => {
    expect(calendarWindow(today, "2026-11-01", "2026-11-30")).toEqual({
      from: today,
      to: today,
      clamped: false,
    });
  });

  it("measures norms over the 12 months ending with the window", () => {
    expect(normsFrom("2026-10-07")).toBe("2025-11-01");
  });
});

describe("projectMonthEnd", () => {
  it("is what was spent once the month is over", () => {
    expect(projectMonthEnd({ soFar: 900, day: 31, daysInMonth: 31, history: [] })).toEqual({
      projected: 900,
      method: "complete",
    });
  });

  it("uses straight-line pace with no history", () => {
    expect(projectMonthEnd({ soFar: 300, day: 10, daysInMonth: 30, history: [] })).toEqual({
      projected: 900,
      method: "pace",
    });
  });

  it("won't guess on pace alone in the first week", () => {
    // Rent on the 1st, nothing to compare with: day 3 would project ten rents.
    expect(projectMonthEnd({ soFar: 1000, day: 3, daysInMonth: 30, history: [] })).toEqual({
      projected: null,
      method: "early",
    });
    expect(projectionCurve({ soFar: 1000, day: 6, daysInMonth: 30, history: [] })).toEqual({
      method: "early",
      rest: [],
    });
    expect(projectMonthEnd({ soFar: 700, day: PACE_MIN_DAY, daysInMonth: 28, history: [] })).toEqual({
      projected: 2800,
      method: "pace",
    });
  });

  it("adds what the rest of a month usually costs — so rent on the 1st counts once", () => {
    // Every month: rent 1,000 on the 1st, then 10 a day.
    const month = (days: number) => Array.from({ length: days }, (_, i) => (i === 0 ? 1000 : 10));
    const soFar = 1000 + 10 * 2; // day 3
    const { projected, method } = projectMonthEnd({
      soFar,
      day: 3,
      daysInMonth: 30,
      history: [month(30), month(31), month(30)],
    });
    expect(method).toBe("history");
    // 1,020 so far + 27 more days at 10 a day — whatever each earlier month's length.
    expect(projected).toBe(1020 + 270);
    // Straight-line pace would have said ten rents.
    expect(Math.round((soFar / 3) * 30)).toBeGreaterThan(10_000);
  });

  it("projects a short month by this month's days left, not the earlier months' own", () => {
    // 20 February at a steady 100 a day, after 31-, 31- and 30-day months.
    const steady = (days: number) => new Array<number>(days).fill(100);
    const input = { soFar: 2000, day: 20, daysInMonth: 28, history: [steady(31), steady(31), steady(30)] };
    expect(projectMonthEnd(input)).toEqual({ projected: 2800, method: "history" });
    // Day by day the line keeps the same 100 a day, and ends on the headline.
    expect(projectionCurve(input).rest).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
    // And a long month after a short one is stretched the same way.
    const march = { soFar: 2000, day: 20, daysInMonth: 31, history: [steady(28)] };
    expect(projectMonthEnd(march).projected).toBe(3100);
    expect(projectionCurve(march).rest.map(Math.round)).toEqual(
      Array.from({ length: 11 }, (_, i) => 100 * (i + 1)),
    );
  });

  it("follows the shape of the usual rest of the month", () => {
    // Earlier month: nothing, then a 600 bill on its last day.
    const bill = [...new Array<number>(29).fill(0), 600];
    expect(projectionCurve({ soFar: 0, day: 27, daysInMonth: 30, history: [bill] }).rest).toEqual([0, 0, 600]);
  });

  it("reads a shorter month's end against this month's end", () => {
    // 30 March, seen against a 28-day February: its last day maps to the 31st.
    const feb = new Array<number>(28).fill(100);
    expect(projectMonthEnd({ soFar: 3000, day: 30, daysInMonth: 31, history: [feb] })).toEqual({
      projected: 3100,
      method: "history",
    });
  });

  it("keeps a one-off as a one-off, whatever the earlier months' lengths", () => {
    // 20,000 paid on each month's last day; 27th of a 31-day month, 4 days left.
    const lastDayBill = (days: number) => [...new Array<number>(days - 1).fill(0), 20000];
    for (const history of [[28], [29], [30], [31], [28, 31, 30], [29, 31, 31]]) {
      const curve = projectionCurve({
        soFar: 0,
        day: 27,
        daysInMonth: 31,
        history: history.map(lastDayBill),
      });
      expect(curve.rest, `histories ${history.join("/")}`).toEqual([0, 0, 0, 20000]);
    }
    // A bill early in the month isn't still to come on the 27th.
    const firstDayBill = (days: number) => [20000, ...new Array<number>(days - 1).fill(0)];
    expect(projectMonthEnd({ soFar: 20000, day: 27, daysInMonth: 31, history: [28, 31].map(firstDayBill) }))
      .toEqual({ projected: 20000, method: "history" });
  });

  it("matches a longer month's days left by dropping its most ordinary days, not its bills", () => {
    // 10 February (18 days left) against January: 100 a day and a 5,000 bill on the 31st.
    const jan = [...new Array<number>(30).fill(100), 5100];
    const { rest } = projectionCurve({ soFar: 1000, day: 10, daysInMonth: 28, history: [jan] });
    expect(rest).toHaveLength(18);
    expect(rest.at(-1)).toBe(17 * 100 + 5100);
  });

  it("tops a shorter month up with its ordinary day", () => {
    // 3 March (28 days left) against a steady 28-day February.
    const feb = new Array<number>(28).fill(100);
    expect(projectionCurve({ soFar: 300, day: 3, daysInMonth: 31, history: [feb] }).rest.at(-1)).toBe(2800);
  });
});

describe("paceSummary", () => {
  const today = "2026-10-10";
  const monthly: MonthCategoryRow[] = [
    exp("2026-10", "food", 500, 500),
    exp("2026-09", "food", 1200, 400),
    exp("2026-08", "food", 900, 300),
    // July has nothing at all: it isn't "usual", it's untracked.
    exp("2025-10", "food", 1000, 350),
    inc("2026-09", 3000),
  ];
  const daily: DailyTotal[] = [
    { date: "2026-10-02", total: 200 },
    { date: "2026-10-09", total: 300 },
    { date: "2026-10-20", total: 999 }, // planned — after today
    { date: "2026-09-05", total: 400 },
    { date: "2026-09-25", total: 800 },
    { date: "2026-08-08", total: 300 },
    { date: "2026-08-28", total: 600 },
  ];

  it("compares this month so far with last month, the usual month and a year ago", () => {
    const p = paceSummary(monthly, daily, today);
    expect(p.soFar).toBe(500);
    expect(p.day).toBe(10);
    expect(p.daysInMonth).toBe(31);
    expect(p.lastMonth).toEqual({ total: 1200, toDate: 400 });
    expect(p.usual).toEqual({ total: 1050, toDate: 350, months: 2 });
    expect(p.lastYear).toEqual({ total: 1000, toDate: 350 });
    expect(p.method).toBe("history");
    // 500 + the mean of what was still to come at this point in Sep (its 800
    // bill on the 25th) and Aug (600 on the 28th): one-offs stay one-offs.
    expect(p.projected).toBe(1200);
  });

  it("draws so-far up to today, the projection from today to the end, and last month", () => {
    const p = paceSummary(monthly, daily, today);
    expect(p.points).toHaveLength(31);
    expect(p.points[1].thisMonth).toBe(200);
    expect(p.points[9]).toMatchObject({ day: 10, thisMonth: 500, projection: 500 });
    expect(p.points[10].thisMonth).toBeNull(); // the planned row isn't "so far"
    expect(p.points[30].projection).toBe(p.projected);
    expect(p.points[29].projection).toBeLessThanOrEqual(p.projected!); // no jump on the last day
    expect(p.points[8].projection).toBeNull();
    expect(p.points[29].lastMonth).toBe(1200);
    expect(p.points[30].lastMonth).toBeNull(); // September has 30 days
  });

  it("draws no projection on the month's last day", () => {
    const p = paceSummary([exp("2026-10", "food", 500)], [{ date: "2026-10-05", total: 500 }], "2026-10-31");
    expect(p.method).toBe("complete");
    expect(p.projected).toBe(500);
    expect(p.points.every((pt) => pt.projection === null)).toBe(true);
  });

  it("draws no projection while it's too early to tell", () => {
    const p = paceSummary([exp("2026-10", "food", 1000)], [{ date: "2026-10-01", total: 1000 }], "2026-10-03");
    expect(p).toMatchObject({ method: "early", projected: null, soFar: 1000 });
    expect(p.points.every((pt) => pt.projection === null)).toBe(true);
    expect(p.points[2].thisMonth).toBe(1000);
  });

  it("has no comparisons, and projects on pace, with no history", () => {
    const p = paceSummary([exp("2026-10", "food", 500)], [{ date: "2026-10-05", total: 500 }], today);
    expect(p.lastMonth).toBeNull();
    expect(p.usual).toBeNull();
    expect(p.lastYear).toBeNull();
    expect(p.method).toBe("pace");
    expect(p.projected).toBe(Math.round((500 / 10) * 31));
    expect(p.points[20].projection).toBe(Math.round(500 + 50 * 11));
  });
});

describe("cashFlow", () => {
  it("sums income, spending and what was kept per month and overall", () => {
    const months = monthsEnding("2026-10", 12);
    const flow = cashFlow(
      [inc("2026-09", 5000), exp("2026-09", "food", 4000), exp("2026-10", "food", 1000), exp("2025-01", "food", 99)],
      months,
    );
    expect(flow.months).toHaveLength(12);
    expect(flow.months.at(-2)).toEqual({
      month: "2026-09",
      income: 5000,
      expense: 4000,
      net: 1000,
      savingsRate: 0.2,
    });
    expect(flow.months.at(-1)!.savingsRate).toBeNull();
    expect(flow.income).toBe(5000);
    expect(flow.expense).toBe(5000); // the 2025-01 row is outside the 12 months
    expect(flow.net).toBe(0);
    expect(flow.savingsRate).toBe(0);
    // The mean over months that hold anything, not over 12.
    expect(flow.averageExpense).toBe(2500);
    expect(flow.incomeMonths).toBe(1);
  });
});

describe("categoryTrends", () => {
  const today = "2026-10-10";
  const monthly = [
    exp("2026-10", "food", 900, 600),
    exp("2026-09", "food", 1000, 400),
    exp("2026-08", "food", 1000, 500),
    exp("2026-07", "food", 1000, 600),
    exp("2026-10", "shop", 100, 100),
    exp("2026-09", "shop", 50, 0),
    exp("2026-10", null, 20, 20),
    exp("2026-02", "rent", 9999), // outside the 6 months
    inc("2026-09", 5000),
  ];

  it("compares this month with the usual *at the same point*, biggest first", () => {
    const { months, rows } = categoryTrends(monthly, CATS, today);
    expect(months).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(rows.map((r) => r.name)).toEqual(["Food", "Shopping", "Uncategorized"]);
    const food = rows[0];
    expect(food.series).toEqual([0, 0, 1000, 1000, 1000, 600]); // the last is so far
    expect(food.usualToDate).toBe(500);
    expect(food.change).toBeCloseTo(0.2);
    // Shopping's usual so far is 0 — no percentage against nothing.
    expect(rows[1].usualToDate).toBe(0);
    expect(rows[1].change).toBeNull();
  });

  it("breaks a tie on spend by name", () => {
    const { rows } = categoryTrends([exp("2026-10", "shop", 100), exp("2026-10", "food", 100)], CATS, today);
    expect(rows.map((r) => r.name)).toEqual(["Food", "Shopping"]);
  });

  it("has no usual without earlier months, and honours the limit", () => {
    const { rows } = categoryTrends([exp("2026-10", "food", 100)], CATS, today);
    expect(rows[0].usualToDate).toBeNull();
    expect(rows[0].change).toBeNull();
    expect(categoryTrends(monthly, CATS, today, 1).rows).toHaveLength(1);
  });
});

describe("findAnomalies", () => {
  const norms = [
    { categoryId: "food", median: 1000, count: 20 },
    { categoryId: "shop", median: 2000, count: 3 }, // too few to judge
    { categoryId: null, median: 500, count: 10 },
  ];
  const c = (id: string, categoryId: string | null, amount: number) => ({
    id,
    categoryId,
    amount,
    date: "2026-10-03",
    title: id === "a" ? "Party" : null,
  });

  it("flags entries at least 3× their category's median, biggest ratio first", () => {
    const out = findAnomalies(
      [c("a", "food", 3500), c("b", "food", 2900), c("c", "shop", 50000), c("d", null, 2000)],
      norms,
      CATS,
    );
    expect(out.map((a) => a.id)).toEqual(["d", "a"]);
    expect(out[0]).toMatchObject({ name: "Uncategorized", typical: 500, ratio: 4 });
    expect(out[1]).toMatchObject({ name: "Food", title: "Party", ratio: 3.5 });
  });

  it("breaks ties on ratio by amount, then id", () => {
    const tied = findAnomalies(
      [c("y", "food", 4000), c("x", "food", 4000), c("d", null, 2000)],
      norms,
      CATS,
    );
    expect(tied.map((a) => a.id)).toEqual(["x", "y", "d"]);
  });

  it("ignores entries too small to matter, and keeps to the limit", () => {
    expect(findAnomalies([c("a", "food", 3500)], norms, CATS, { minAmount: 5000 })).toEqual([]);
    expect(findAnomalies([c("a", "food", 3500), c("d", null, 2000)], norms, CATS, { limit: 1 })).toHaveLength(1);
    expect(findAnomalies([c("x", "unknown", 999999)], norms, CATS)).toEqual([]);
  });
});

describe("detectRecurring", () => {
  const today = "2026-10-07";
  const group = (key: string, dates: string[], amounts: number[], extra: Partial<RecurringGroup> = {}) => ({
    key,
    title: key,
    categoryId: "rent",
    dates,
    amounts,
    ...extra,
  });
  const monthly = ["2026-05-01", "2026-06-01", "2026-07-02", "2026-08-01", "2026-09-01", "2026-10-01"];

  it("spots a monthly payment at about the same amount", () => {
    const [rent] = detectRecurring([group("Rent", monthly, monthly.map(() => 150000))], CATS, today);
    expect(rent).toMatchObject({
      label: "Rent",
      categoryName: "Housing",
      typical: 150000,
      occurrences: 6,
      lastDate: "2026-10-01",
      nextDate: "2026-11-01",
    });
  });

  it("tolerates a price rise, but not amounts all over the place", () => {
    const rise = [649, 649, 649, 649, 799, 799].map((x) => x * 100);
    const [streaming] = detectRecurring([group("Streaming", monthly, rise)], CATS, today);
    expect(streaming.typical).toBe(79900); // the new price
    const wild = [100, 900, 300, 1500, 50, 700].map((x) => x * 100);
    expect(detectRecurring([group("Misc", monthly, wild)], CATS, today)).toEqual([]);
  });

  it("rejects weekly spending, too few months, and payments that stopped", () => {
    const weekly = Array.from({ length: 12 }, (_, i) => addDays("2026-07-04", i * 7));
    expect(detectRecurring([group("Groceries", weekly, weekly.map(() => 5000))], CATS, today)).toEqual([]);
    expect(
      detectRecurring([group("Gym", ["2026-09-01", "2026-10-01"], [4000, 4000])], CATS, today),
    ).toEqual([]);
    const stopped = ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"];
    expect(detectRecurring([group("Old", stopped, stopped.map(() => 4000))], CATS, today)).toEqual([]);
  });

  it("rejects entries a month apart on average but not monthly, and free ones", () => {
    const irregular = ["2026-04-28", "2026-05-02", "2026-07-15", "2026-09-30"];
    expect(detectRecurring([group("Odd", irregular, [5000, 5000, 5000, 5000])], CATS, today)).toEqual([]);
    expect(detectRecurring([group("Free", monthly, monthly.map(() => 0))], CATS, today)).toEqual([]);
  });

  it("labels a payment without the month and year its titles carry", () => {
    expect(recurringLabel("Rent Sep 2026")).toBe("Rent");
    expect(recurringLabel("Netflix - October")).toBe("Netflix");
    expect(recurringLabel("Gym (Sept)")).toBe("Gym");
    expect(recurringLabel("Mayur Stores 12/03")).toBe("Mayur Stores"); // "May" only as a whole word
    expect(recurringLabel("2026-10")).toBe("");
    const dates = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
    const [r] = detectRecurring([group("rent", dates, [1, 1, 1, 1].map(() => 90000), { title: "Rent Jul 2026" })], CATS, today);
    expect(r.label).toBe("Rent");
  });

  it("names an untitled group by its category and ignores planned entries", () => {
    const dates = ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"]; // the last is planned
    const [r] = detectRecurring(
      [group("#shop:4900", dates, [4900, 4900, 4900, 4900], { title: null, categoryId: "shop" })],
      CATS,
      today,
    );
    expect(r).toMatchObject({ label: "Shopping", occurrences: 3, lastDate: "2026-09-15", nextDate: "2026-10-15" });
  });

  it("puts the biggest first and keeps to the limit", () => {
    const out = detectRecurring(
      [group("Small", monthly, monthly.map(() => 100)), group("Big", monthly, monthly.map(() => 9000))],
      CATS,
      today,
    );
    expect(out.map((r) => r.label)).toEqual(["Big", "Small"]);
    const tie = detectRecurring(
      [group("Water", monthly, monthly.map(() => 100)), group("Power", monthly, monthly.map(() => 100))],
      CATS,
      today,
    );
    expect(tie.map((r) => r.label)).toEqual(["Power", "Water"]);
    expect(
      detectRecurring([group("Small", monthly, monthly.map(() => 100))], CATS, today, { limit: 0 }),
    ).toEqual([]);
  });
});

describe("weekdays and the calendar", () => {
  it("averages each weekday over the days the window holds", () => {
    // 2026-10-01 (Thu) … 2026-10-14 (Wed): two of every weekday.
    const stats = weekdayPattern(
      [
        { date: "2026-10-03", total: 600 }, // Sat
        { date: "2026-10-10", total: 200 }, // Sat
        { date: "2026-10-05", total: 100 }, // Mon
        { date: "2026-09-30", total: 9999 }, // outside
      ],
      "2026-10-01",
      "2026-10-14",
    );
    expect(stats.every((s) => s.days === 2)).toBe(true);
    expect(stats[6]).toEqual({ weekday: 6, total: 800, days: 2, average: 400 });
    expect(stats[1].average).toBe(50);
    expect(stats[0].average).toBe(0);
  });

  it("averages nothing for a weekday the window doesn't hold", () => {
    const stats = weekdayPattern([{ date: "2026-10-03", total: 300 }], "2026-10-03", "2026-10-04");
    expect(stats[6]).toEqual({ weekday: 6, total: 300, days: 1, average: 300 });
    expect(stats[1]).toEqual({ weekday: 1, total: 0, days: 0, average: 0 });
  });

  it("shades by quartile of the days with spending", () => {
    expect(heatThresholds([0, 0])).toEqual([]);
    const t = heatThresholds([10, 20, 30, 40, 0]);
    expect(t).toEqual([10, 20, 30]);
    expect([0, 5, 10, 15, 25, 40].map((v) => heatLevel(v, t))).toEqual([0, 1, 1, 2, 3, 4]);
  });

  it("lays out whole months in weeks from the locale's first day", () => {
    const daily = [
      { date: "2026-10-02", total: 500 },
      { date: "2026-09-30", total: 100 },
    ];
    const window = { from: "2026-10-01", to: "2026-10-07" };
    const monday = calendarMonths(daily, window, 1);
    expect(monday.months).toHaveLength(1);
    const oct = monday.months[0];
    // 1 October 2026 is a Thursday: three blanks before it from Monday.
    expect(oct.weeks[0].slice(0, 4).map((d) => d?.day ?? null)).toEqual([null, null, null, 1]);
    expect(oct.weeks).toHaveLength(6); // always six rows, so every month is the same size
    expect(oct.weeks.every((w) => w.length === 7)).toBe(true);
    const days = oct.weeks.flat().filter((d) => d !== null);
    expect(days).toHaveLength(31);
    expect(days.find((d) => d!.day === 2)).toMatchObject({ total: 500, level: 1, inWindow: true });
    expect(days.find((d) => d!.day === 8)).toMatchObject({ total: 0, inWindow: false });
    // Sunday-first: four blanks.
    expect(calendarMonths(daily, window, 0).months[0].weeks[0].filter((d) => d === null)).toHaveLength(4);
    // A 28-day February starting on a Monday still has six rows.
    const feb = calendarMonths([], { from: "2027-02-01", to: "2027-02-28" }, 1).months[0];
    expect(feb.weeks).toHaveLength(6);
    expect(feb.weeks[4].every((d) => d === null)).toBe(true);
    // Several months.
    expect(calendarMonths([], { from: "2026-08-15", to: "2026-10-07" }, 1).months.map((m) => m.month)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(monthCount({ from: "2026-08-15", to: "2026-10-07" })).toBe(3);
    expect(monthCount({ from: "2025-11-01", to: "2026-10-07" })).toBe(12);
  });

  it("starts the week where the locale does", () => {
    expect(firstDayOfWeek("en-US")).toBe(0);
    expect(firstDayOfWeek("en-GB")).toBe(1);
    expect(firstDayOfWeek("not a locale!")).toBe(1);
  });

  it("falls back to the older weekInfo getter", () => {
    const proto = Intl.Locale.prototype as unknown as { getWeekInfo?: unknown };
    const original = Object.getOwnPropertyDescriptor(proto, "getWeekInfo");
    delete proto.getWeekInfo;
    try {
      const sunday = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, "weekInfo") ? 0 : 1;
      expect(firstDayOfWeek("en-US")).toBe(sunday);
    } finally {
      if (original) Object.defineProperty(proto, "getWeekInfo", original);
    }
  });
});

describe("buildInsights", () => {
  const fmt = (minor: number) => `$${Math.round(minor / 100)}`;
  const pace = (over: Partial<PaceSummary> = {}): PaceSummary => ({
    month: "2026-10",
    day: 10,
    daysInMonth: 31,
    soFar: 50000,
    projected: 132000,
    method: "history",
    lastMonth: null,
    usual: { total: 100000, toDate: 40000, months: 3 },
    lastYear: null,
    points: [],
    ...over,
  });
  const base = (over: Partial<InsightInput> = {}): InsightInput => ({
    pace: pace(),
    cashFlow: cashFlow([], monthsEnding("2026-10", 12)),
    trends: [],
    anomalies: [],
    recurring: [],
    weekdays: weekdayPattern([], "2026-10-01", "2026-10-10"),
    windowDays: 10,
    ...over,
  });

  it("says where the month is heading against the usual", () => {
    expect(buildInsights(base(), fmt, "en-US")[0]).toEqual({
      id: "pace",
      tone: "up",
      text: "At this pace you'll spend about $1320 this month — 32% more than usual.",
    });
    expect(buildInsights(base({ pace: pace({ projected: 80000 }) }), fmt, "en-US")[0].text).toContain(
      "20% less than usual",
    );
    expect(buildInsights(base({ pace: pace({ projected: 102000 }) }), fmt, "en-US")[0].text).toContain(
      "about the same as usual",
    );
    expect(buildInsights(base({ pace: pace({ usual: null }) }), fmt, "en-US")[0].text).toBe(
      "At this pace you'll spend about $1320 this month.",
    );
    expect(buildInsights(base({ pace: pace({ soFar: 0 }) }), fmt, "en-US")).toEqual([]);
    expect(buildInsights(base({ pace: pace({ method: "complete" }) }), fmt, "en-US")).toEqual([]);
    expect(buildInsights(base({ pace: pace({ method: "early", projected: null }) }), fmt, "en-US")).toEqual([]);
  });

  it("names the category that rose and fell most, if it matters", () => {
    const trend = (name: string, soFar: number, usualToDate: number) => ({
      categoryId: name,
      name,
      icon: null,
      series: [],
      soFar,
      usualToDate,
      change: pctChange(soFar, usualToDate),
    });
    const out = buildInsights(
      base({
        pace: pace({ soFar: 0 }),
        trends: [
          trend("Food", 13200, 10000),
          trend("Shopping", 6000, 10000),
          trend("Gifts", 7000, 10000), // falls too, but less
          trend("Coffee", 300, 100), // +200%, but too small to matter
          trend("Travel", 10500, 10000), // +5%: not a move
          { ...trend("New", 900, 0), usualToDate: null }, // nothing to compare with
        ],
      }),
      fmt,
      "en-US",
    );
    expect(out.map((i) => i.text)).toEqual([
      "You've spent 32% more on Food than usual by this point in the month.",
      "Shopping is 40% below your usual by this point in the month.",
    ]);
    const tripled = buildInsights(
      base({ pace: pace({ soFar: 0 }), trends: [trend("Travel", 30000, 10000)] }),
      fmt,
      "en-US",
    );
    expect(tripled[0].text).toBe("You've spent about 3× your usual on Travel by this point in the month.");
  });

  it("says how much income was kept — over 12 months when there are enough, else last month", () => {
    const months = monthsEnding("2026-10", 12);
    const year = cashFlow(
      ["2026-07", "2026-08", "2026-09"].flatMap((m) => [inc(m, 100000), exp(m, "food", 80000)]),
      months,
    );
    expect(buildInsights(base({ pace: pace({ soFar: 0 }), cashFlow: year }), fmt, "en-US")[0].text).toBe(
      "Over the last 12 months you kept 20% of your income — $600 in all.",
    );
    const overspent = cashFlow(
      ["2026-07", "2026-08", "2026-09"].flatMap((m) => [inc(m, 100000), exp(m, "food", 110000)]),
      months,
    );
    expect(buildInsights(base({ pace: pace({ soFar: 0 }), cashFlow: overspent }), fmt, "en-US")[0]).toMatchObject({
      tone: "up",
      text: "Over the last 12 months you spent $300 more than came in.",
    });
    const lastMonth = cashFlow([inc("2026-09", 100000), exp("2026-09", "food", 75000)], months);
    expect(buildInsights(base({ pace: pace({ soFar: 0 }), cashFlow: lastMonth }), fmt, "en-US")[0].text).toBe(
      "Last month you kept 25% of your income.",
    );
    const lastMonthOver = cashFlow([inc("2026-09", 100000), exp("2026-09", "food", 125000)], months);
    expect(buildInsights(base({ pace: pace({ soFar: 0 }), cashFlow: lastMonthOver }), fmt, "en-US")[0].text).toBe(
      "Last month you spent $250 more than came in.",
    );
  });

  it("totals the recurring payments, names the oddest entry and the priciest weekday", () => {
    const r = (label: string, typical: number) => ({
      key: label,
      label,
      categoryId: null,
      categoryName: "Bills",
      icon: null,
      typical,
      occurrences: 4,
      lastDate: "2026-10-01",
      nextDate: "2026-11-01",
    });
    const weekdays = weekdayPattern(
      [{ date: "2026-10-03", total: 12000 }],
      "2026-09-20",
      "2026-10-10",
    );
    const out = buildInsights(
      base({
        pace: pace({ soFar: 0 }),
        recurring: [r("Rent", 150000), r("Gym", 4000)],
        anomalies: [
          {
            id: "x",
            categoryId: "shop",
            name: "Shopping",
            icon: null,
            title: "New laptop",
            date: "2026-10-05",
            amount: 125000,
            typical: 5000,
            ratio: 25,
          },
        ],
        weekdays,
        windowDays: 21,
      }),
      fmt,
      "en-US",
    );
    expect(out.map((i) => i.text)).toEqual([
      "2 payments come round every month — about $1540 a month together.",
      "“New laptop” on Oct 5 was $1250 — about 25× your usual for Shopping.",
      "You spend the most on Saturdays — about $40 on an average one.",
    ]);
    expect(
      buildInsights(base({ pace: pace({ soFar: 0 }), recurring: [r("Rent", 150000)] }), fmt, "en-US")[0].text,
    ).toBe("Rent looks like a monthly payment, about $1500 each time.");
    const untitled = buildInsights(
      base({
        pace: pace({ soFar: 0 }),
        anomalies: [
          {
            id: "y",
            categoryId: null,
            name: "Uncategorized",
            icon: null,
            title: null,
            date: "2026-10-05",
            amount: 30000,
            typical: 1000,
            ratio: 30,
          },
        ],
      }),
      fmt,
      "en-US",
    );
    expect(untitled[0].text).toBe(
      "An entry in Uncategorized on Oct 5 was $300 — about 30× your usual for Uncategorized.",
    );
  });

  it("keeps quiet about weekdays on a short window, and stops at the limit", () => {
    const weekdays = weekdayPattern([{ date: "2026-10-03", total: 12000 }], "2026-10-01", "2026-10-10");
    expect(buildInsights(base({ pace: pace({ soFar: 0 }), weekdays, windowDays: 10 }), fmt, "en-US")).toEqual([]);
    const many = base({
      recurring: [
        {
          key: "r",
          label: "Rent",
          categoryId: null,
          categoryName: "Bills",
          icon: null,
          typical: 1,
          occurrences: 3,
          lastDate: "2026-10-01",
          nextDate: "2026-11-01",
        },
      ],
      cashFlow: cashFlow([inc("2026-09", 100), exp("2026-09", "food", 50)], monthsEnding("2026-10", 12)),
    });
    expect(buildInsights(many, fmt, "en-US", 2)).toHaveLength(2);
  });
});

describe("buildAdvancedAnalytics", () => {
  const today = "2026-10-07";
  const ctx = {
    today,
    window: calendarWindow(today, "2026-10-01", "2026-10-31"),
    firstDay: 1 as const,
    currency: "USD",
    locale: "en-US",
  };

  it("turns nothing into an empty, well-formed section", () => {
    const empty: AdvancedRaw = {
      categories: [],
      monthly: [],
      paceDaily: [],
      heatDaily: [],
      norms: [],
      candidates: [],
      recurring: [],
      payees: [],
      tags: [],
      profiles: null,
    };
    const d = buildAdvancedAnalytics(empty, ctx);
    expect(d.insights).toEqual([]);
    expect(d.pace).toMatchObject({ soFar: 0, projected: 0, method: "pace" });
    expect(d.cashFlow.months).toHaveLength(12);
    expect(d.trends.rows).toEqual([]);
    expect(d.calendar.months).toHaveLength(1);
    expect(d.calendar.total).toBe(0);
    expect(d.anomalies).toEqual([]);
    expect(d.recurring).toEqual({ items: [], monthly: 0 });
    expect(d.breakdown.profiles).toBeNull();
  });

  it("builds the Free preview from sample numbers, the same way every time", () => {
    const raw = sampleAdvancedRaw(today, ctx.window);
    expect(sampleAdvancedRaw(today, ctx.window)).toEqual(raw);
    const d = buildAdvancedAnalytics(raw, ctx);
    expect(d.insights.length).toBeGreaterThan(0);
    expect(d.recurring.items.map((r) => r.label)).toEqual(expect.arrayContaining(["Rent", "Streaming", "Gym"]));
    expect(d.anomalies[0]?.title).toBe("New laptop");
    expect(d.cashFlow.income).toBeGreaterThan(0);
    expect(d.trends.rows.length).toBeGreaterThan(0);
    expect(d.breakdown.profiles?.length).toBe(2);
    // Every amount is a whole number of minor units.
    const amounts = [
      d.pace.soFar,
      d.pace.projected,
      d.cashFlow.income,
      d.cashFlow.expense,
      ...d.trends.rows.flatMap((t) => t.series),
      ...d.anomalies.map((a) => a.typical),
      ...d.recurring.items.map((r) => r.typical),
    ];
    expect(amounts.every(Number.isInteger)).toBe(true);
  });
});
