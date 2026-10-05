import { describe, expect, it } from "vitest";
import { matchMonth, matchQuarter, monthPeriod, quarterPeriod, startsAfter } from "@/lib/period-ranges";

describe("monthPeriod", () => {
  it("covers the whole month", () => {
    expect(monthPeriod(2026, 0)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(monthPeriod(2026, 3)).toEqual({ from: "2026-04-01", to: "2026-04-30" });
    expect(monthPeriod(2026, 11)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("knows February in leap and common years", () => {
    expect(monthPeriod(2028, 1).to).toBe("2028-02-29");
    expect(monthPeriod(2026, 1).to).toBe("2026-02-28");
  });
});

describe("quarterPeriod", () => {
  it("spans three months", () => {
    expect(quarterPeriod(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(quarterPeriod(2026, 2)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(quarterPeriod(2026, 3)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(quarterPeriod(2026, 4)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });
});

describe("matchMonth / matchQuarter", () => {
  it("recognise an exact month and quarter", () => {
    expect(matchMonth("2026-02-01", "2026-02-28")).toEqual({ year: 2026, month: 1 });
    expect(matchQuarter("2026-07-01", "2026-09-30")).toEqual({ year: 2026, quarter: 3 });
  });

  it("reject partial and spanning ranges", () => {
    expect(matchMonth("2026-02-01", "2026-02-27")).toBeNull();
    expect(matchMonth("2026-02-02", "2026-02-28")).toBeNull();
    expect(matchMonth("2026-01-01", "2026-02-28")).toBeNull();
    expect(matchQuarter("2026-07-01", "2026-09-29")).toBeNull();
    expect(matchQuarter("2026-07-01", "2026-07-31")).toBeNull();
  });

  it("match nothing when either end is missing", () => {
    expect(matchMonth("", "2026-02-28")).toBeNull();
    expect(matchQuarter("2026-07-01", "")).toBeNull();
  });
});

describe("startsAfter", () => {
  it("is true only for periods that begin after today", () => {
    expect(startsAfter(monthPeriod(2026, 10), "2026-10-04")).toBe(true);
    expect(startsAfter(monthPeriod(2026, 9), "2026-10-04")).toBe(false);
    expect(startsAfter(quarterPeriod(2026, 4), "2026-10-04")).toBe(false);
  });
});
