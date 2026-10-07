import {
  RECURRING_MONTHS,
  addDays,
  daysIn,
  median,
  monthStart,
  normsFrom,
  shiftMonth,
  weekdayOf,
  type AdvancedRaw,
  type BreakdownRow,
  type CategoryInfo,
  type DailyTotal,
  type DayWindow,
  type MonthCategoryRow,
} from "@/lib/insights";

/**
 * Made-up numbers for the locked "Insights & trends" preview on Free — a
 * plausible year of a household's spending, generated deterministically from
 * today's date and pushed through the same aggregation and the same
 * `buildAdvancedAnalytics` as the real thing. Nothing here comes from the
 * workspace: a Free request never reads a transaction for this section.
 */

const CATEGORIES: CategoryInfo[] = [
  { id: "sample-housing", name: "Housing", icon: "🏠" },
  { id: "sample-groceries", name: "Groceries", icon: "🛒" },
  { id: "sample-food", name: "Food & Dining", icon: "🍽️" },
  { id: "sample-transport", name: "Transport", icon: "🚆" },
  { id: "sample-bills", name: "Bills & Utilities", icon: "💡" },
  { id: "sample-shopping", name: "Shopping", icon: "🛍️" },
  { id: "sample-salary", name: "Salary", icon: "💼" },
];

type Entry = {
  id: string;
  date: string;
  type: "income" | "expense";
  categoryId: string;
  amount: number;
  title: string | null;
  tag: string | null;
  profile: "Personal" | "Household";
};

/** A small seeded PRNG (mulberry32), so the preview is the same on every render. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entries(today: string): Entry[] {
  const rand = seeded(20261007);
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) / 50) * 50;
  const out: Entry[] = [];
  const add = (e: Omit<Entry, "id">) => out.push({ ...e, id: `sample-${out.length}` });
  const start = monthStart(shiftMonth(today.slice(0, 7), -12));
  const bigDay = addDays(today, -2);

  for (let date = start; date <= today; date = addDays(date, 1)) {
    const day = Number(date.slice(8, 10));
    const weekend = [0, 6].includes(weekdayOf(date));
    const base = { date, tag: null, profile: "Household" as const };
    if (day === 1) {
      add({ ...base, type: "income", categoryId: "sample-salary", amount: 520000, title: "Salary", profile: "Personal" });
      add({ ...base, type: "expense", categoryId: "sample-housing", amount: 180000, title: "Rent" });
    }
    if (day === 6) add({ ...base, type: "expense", categoryId: "sample-bills", amount: between(9000, 13000), title: "Electricity" });
    if (day === 12) add({ ...base, type: "expense", categoryId: "sample-bills", amount: 1549, title: "Streaming" });
    if (day === Math.min(20, daysIn(date.slice(0, 7)))) {
      add({ ...base, type: "expense", categoryId: "sample-bills", amount: 4000, title: "Gym", profile: "Personal" });
    }
    if (weekend) {
      add({ ...base, type: "expense", categoryId: "sample-groceries", amount: between(6000, 14000), title: "Groceries" });
      if (rand() < 0.7) {
        add({ ...base, type: "expense", categoryId: "sample-food", amount: between(2500, 9000), title: "Dinner out", tag: "Weekends", profile: "Personal" });
      }
    } else {
      if (rand() < 0.7) add({ ...base, type: "expense", categoryId: "sample-transport", amount: between(300, 1500), title: "Metro", tag: "Work", profile: "Personal" });
      if (rand() < 0.35) add({ ...base, type: "expense", categoryId: "sample-food", amount: between(800, 2500), title: "Lunch", tag: "Work", profile: "Personal" });
    }
    if (rand() < 0.07) add({ ...base, type: "expense", categoryId: "sample-shopping", amount: between(2000, 15000), title: "Clothes", profile: "Personal" });
    if (date === bigDay) add({ ...base, type: "expense", categoryId: "sample-shopping", amount: 125000, title: "New laptop", profile: "Personal" });
  }
  return out;
}

function totalsBy<K>(list: Entry[], keyOf: (e: Entry) => K): Map<K, { total: number; count: number }> {
  const out = new Map<K, { total: number; count: number }>();
  for (const e of list) {
    const k = keyOf(e);
    const t = out.get(k) ?? { total: 0, count: 0 };
    t.total += e.amount;
    t.count += 1;
    out.set(k, t);
  }
  return out;
}

function daily(list: Entry[], from: string, to: string): DailyTotal[] {
  const byDate = totalsBy(
    list.filter((e) => e.type === "expense" && e.date >= from && e.date <= to),
    (e) => e.date,
  );
  return [...byDate].map(([date, t]) => ({ date, total: t.total })).sort((a, b) => a.date.localeCompare(b.date));
}

function ranked(map: Map<string, { total: number; count: number }>, row: (k: string) => Partial<BreakdownRow>): BreakdownRow[] {
  return [...map]
    .map(([key, t]) => ({ key, label: key, ...row(key), total: t.total, count: t.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

/** The sample year, aggregated exactly as `insights-queries.ts` aggregates a real one. */
export function sampleAdvancedRaw(today: string, window: DayWindow): AdvancedRaw {
  const all = entries(today);
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const expenses = all.filter((e) => e.type === "expense");
  const inWindow = expenses.filter((e) => e.date >= window.from && e.date <= window.to);

  const monthly = new Map<string, MonthCategoryRow>();
  for (const e of all) {
    const key = `${e.date.slice(0, 7)}|${e.type}|${e.categoryId}`;
    const row = monthly.get(key) ?? {
      month: e.date.slice(0, 7),
      type: e.type,
      categoryId: e.categoryId,
      total: 0,
      toDate: 0,
    };
    row.total += e.amount;
    if (Number(e.date.slice(8, 10)) <= day) row.toDate += e.amount;
    monthly.set(key, row);
  }

  const normsWindow = expenses.filter((e) => e.date >= normsFrom(window.to) && e.date <= window.to);
  const byCategory = new Map<string, number[]>();
  for (const e of normsWindow) byCategory.set(e.categoryId, [...(byCategory.get(e.categoryId) ?? []), e.amount]);

  const candidates = [...new Set(inWindow.map((e) => e.categoryId))].flatMap((id) =>
    inWindow
      .filter((e) => e.categoryId === id)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((e) => ({ id: e.id, categoryId: e.categoryId, amount: e.amount, date: e.date, title: e.title })),
  );

  const recurringFrom = monthStart(shiftMonth(month, -RECURRING_MONTHS));
  const byTitle = new Map<string, Entry[]>();
  for (const e of expenses) {
    if (e.date < recurringFrom || !e.title) continue;
    byTitle.set(e.title, [...(byTitle.get(e.title) ?? []), e]);
  }

  return {
    categories: CATEGORIES,
    monthly: [...monthly.values()],
    paceDaily: daily(all, monthStart(shiftMonth(month, -3)), today),
    heatDaily: daily(all, window.from, window.to),
    norms: [...byCategory].map(([categoryId, amounts]) => ({
      categoryId,
      median: median(amounts),
      count: amounts.length,
    })),
    candidates,
    recurring: [...byTitle]
      .filter(([, list]) => new Set(list.map((e) => e.date.slice(0, 7))).size >= 3)
      .map(([title, list]) => ({
        key: title.toLowerCase(),
        title,
        categoryId: list[0].categoryId,
        dates: list.map((e) => e.date),
        amounts: list.map((e) => e.amount),
      })),
    payees: ranked(totalsBy(inWindow.filter((e) => e.title), (e) => e.title!), () => ({})),
    tags: ranked(totalsBy(inWindow.filter((e) => e.tag), (e) => e.tag!), (k) => ({
      color: k === "Work" ? "#64748b" : "#0ea5e9",
    })),
    profiles: ranked(totalsBy(inWindow, (e) => e.profile), (k) => ({
      icon: k === "Personal" ? "🙂" : "🏡",
    })),
  };
}
