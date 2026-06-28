import { describe, it, expect, afterEach, vi } from "vitest";
import {
  todayISO,
  parseISODate,
  toISODate,
  monthRange,
  formatDateLabel,
  dayDividerLabel,
  monthLabel,
} from "@/lib/dates";

afterEach(() => vi.useRealTimers());

describe("todayISO", () => {
  it("returns the viewer's local date for a given zone", () => {
    vi.useFakeTimers();
    // 20:00 UTC: still the 27th in New York, already the 28th in Kolkata.
    vi.setSystemTime(new Date("2026-06-27T20:00:00Z"));
    expect(todayISO("UTC")).toBe("2026-06-27");
    expect(todayISO("America/New_York")).toBe("2026-06-27");
    expect(todayISO("Asia/Kolkata")).toBe("2026-06-28");
  });

  it("falls back to the runtime zone when none is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00Z"));
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseISODate / toISODate", () => {
  it("round-trips without timezone drift", () => {
    expect(toISODate(parseISODate("2026-06-15"))).toBe("2026-06-15");
    expect(toISODate(parseISODate("2026-01-01"))).toBe("2026-01-01");
    expect(toISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
  });

  it("defaults missing month/day components to January 1st", () => {
    expect(toISODate(parseISODate("2026"))).toBe("2026-01-01");
  });

  it("pads single-digit months and days", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("monthRange", () => {
  it("returns the first and last day of a 28-day February", () => {
    expect(monthRange("2026-02-15")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("handles a leap February", () => {
    expect(monthRange("2024-02-10")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });

  it("handles December (month rollover)", () => {
    expect(monthRange("2026-12-10")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
  });
});

describe("formatDateLabel", () => {
  it("renders a human label in UTC regardless of runtime zone", () => {
    expect(formatDateLabel("2026-06-17")).toBe("Jun 17, 2026");
    expect(formatDateLabel("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("dayDividerLabel", () => {
  const today = "2026-06-27";
  it("labels today and yesterday relatively", () => {
    expect(dayDividerLabel("2026-06-27", today)).toBe("Today");
    expect(dayDividerLabel("2026-06-26", today)).toBe("Yesterday");
  });
  it("falls back to a full date for older days", () => {
    expect(dayDividerLabel("2026-06-01", today)).toBe("Jun 1, 2026");
  });
  it("computes 'yesterday' across a month boundary without drift", () => {
    expect(dayDividerLabel("2026-05-31", "2026-06-01")).toBe("Yesterday");
  });
});

describe("monthLabel", () => {
  it("formats YYYY-MM and YYYY-MM-DD alike", () => {
    expect(monthLabel("2026-06")).toBe("Jun 2026");
    expect(monthLabel("2026-06-15")).toBe("Jun 2026");
  });
  it("defaults a missing month to January", () => {
    expect(monthLabel("2026")).toBe("Jan 2026");
  });
});
