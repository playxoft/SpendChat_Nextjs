import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addDays,
  age,
  businessDaysBetween,
  countWeekdays,
  dateSpan,
  daysBetween,
  daysInMonth,
  diffYMD,
  formatCount,
  formatDate,
  formatYMD,
  isLeapYear,
  isWeekend,
  nextBirthday,
  parseDate,
  resolveDateInput,
  toISODate,
  weekday,
  weekdayName,
} from "@/lib/tools/date-math";

/** Walks day by day — slow but obviously right, to check the O(1) shortcuts against. */
function naiveWeekdays(first: string, last: string): number {
  let count = 0;
  for (let d = first; d <= last; d = addDays(d, 1)!) {
    if (!isWeekend(d)) count++;
  }
  return count;
}

function naiveAddBusinessDays(date: string, n: number): string {
  let d = date;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d = addDays(d, n > 0 ? 1 : -1)!;
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

describe("isLeapYear / daysInMonth", () => {
  it("follows the Gregorian century rule", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
  });

  it("knows February's length", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2023, 4)).toBe(30);
    expect(daysInMonth(2023, 12)).toBe(31);
  });
});

describe("parseDate / toISODate", () => {
  it("reads a real date", () => {
    expect(parseDate("2026-09-28")).toEqual({ y: 2026, m: 9, d: 28 });
    expect(parseDate(" 2024-02-29 ")).toEqual({ y: 2024, m: 2, d: 29 });
  });

  it("rejects days that don't exist instead of rolling them over", () => {
    expect(parseDate("2023-02-29")).toBeNull();
    expect(parseDate("2026-04-31")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2026-00-10")).toBeNull();
    expect(parseDate("2026-01-00")).toBeNull();
  });

  it("rejects other shapes and out-of-range years", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("2026-9-1")).toBeNull();
    expect(parseDate("28/09/2026")).toBeNull();
    expect(parseDate("0000-01-01")).toBeNull();
    expect(parseDate("+10000-01-01")).toBeNull();
  });

  it("pads short years back out", () => {
    expect(toISODate({ y: 1, m: 1, d: 1 })).toBe("0001-01-01");
    expect(toISODate({ y: 2026, m: 9, d: 8 })).toBe("2026-09-08");
  });

  it("throws on a malformed date passed to the maths", () => {
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow(RangeError);
    expect(() => weekday("nope")).toThrow(RangeError);
  });
});

describe("weekday", () => {
  it("names the day of the week", () => {
    expect(weekday("2026-09-28")).toBe(1); // Monday
    expect(weekday("1970-01-01")).toBe(4); // Thursday
    expect(weekday("2000-01-01")).toBe(6); // Saturday
    expect(weekdayName("2026-09-28")).toBe("Monday");
    expect(weekdayName("1992-05-17")).toBe("Sunday");
  });

  it("works at both ends of the supported range, and before 1970", () => {
    expect(weekday("0001-01-01")).toBe(1); // Monday, proleptic Gregorian
    expect(weekday("0099-12-31")).toBe(4); // two-digit years aren't read as 19xx
    expect(weekday("1900-01-01")).toBe(1);
    expect(weekday("9999-12-31")).toBe(5);
  });

  it("spots weekends", () => {
    expect(isWeekend("2026-10-03")).toBe(true);
    expect(isWeekend("2026-10-04")).toBe(true);
    expect(isWeekend("2026-10-05")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts days, excluding the end by default", () => {
    expect(daysBetween("2026-03-01", "2026-03-02")).toBe(1);
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-09-28", "2027-05-17")).toBe(231);
  });

  it("adds one day when the end is included", () => {
    expect(daysBetween("2026-03-01", "2026-03-02", { includeEnd: true })).toBe(2);
    expect(daysBetween("2026-01-01", "2026-12-31", { includeEnd: true })).toBe(365);
  });

  it("is zero on the same day — or one, counting the day itself", () => {
    expect(daysBetween("2026-09-28", "2026-09-28")).toBe(0);
    expect(daysBetween("2026-09-28", "2026-09-28", { includeEnd: true })).toBe(1);
  });

  it("goes negative when the end is first, inclusive or not", () => {
    expect(daysBetween("2026-12-31", "2026-01-01")).toBe(-364);
    expect(daysBetween("2026-12-31", "2026-01-01", { includeEnd: true })).toBe(-365);
  });

  it("includes 29 February in leap years", () => {
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(daysBetween("2023-01-01", "2024-01-01")).toBe(365);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
  });

  it("isn't thrown by daylight-saving changes", () => {
    // US clocks change 8 Mar / 1 Nov 2026, EU 29 Mar / 25 Oct 2026.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-11-02")).toBe(9);
  });

  it("handles century-long spans", () => {
    expect(daysBetween("1900-01-01", "2000-01-01")).toBe(36_524); // 1900 wasn't a leap year
    expect(daysBetween("2000-01-01", "2100-01-01")).toBe(36_525); // 2000 was
    expect(daysBetween("0001-01-01", "9999-12-31")).toBe(3_652_058);
  });
});

describe("addDays", () => {
  it("moves across month, year and leap-day boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-15", 90)).toBe("2027-04-15");
    expect(addDays("2026-09-28", 30)).toBe("2026-10-28");
  });

  it("goes back with a negative count, and stays put on zero", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-09-28", 0)).toBe("2026-09-28");
  });

  it("round-trips with daysBetween", () => {
    for (const n of [1, 45, 365, 1_000, 36_525, -7, -10_000]) {
      const d = addDays("2026-09-28", n)!;
      expect(daysBetween("2026-09-28", d)).toBe(n);
    }
  });

  it("has no answer outside the years 1–9999", () => {
    expect(addDays("9999-12-31", 1)).toBeNull();
    expect(addDays("0001-01-01", -1)).toBeNull();
    expect(addDays("2026-09-28", 10_000_000)).toBeNull();
  });

  it("refuses fractional days", () => {
    expect(() => addDays("2026-09-28", 1.5)).toThrow(RangeError);
  });
});

describe("diffYMD", () => {
  it("counts years, then months, then days", () => {
    expect(diffYMD("1992-05-17", "2026-09-28")).toEqual({ years: 34, months: 4, days: 11 });
    expect(diffYMD("2026-01-15", "2026-03-10")).toEqual({ years: 0, months: 1, days: 23 });
    expect(diffYMD("2025-12-20", "2026-01-05")).toEqual({ years: 0, months: 0, days: 16 });
  });

  it("is order-independent", () => {
    expect(diffYMD("2026-09-28", "1992-05-17")).toEqual(diffYMD("1992-05-17", "2026-09-28"));
  });

  it("is zero on the same day", () => {
    expect(diffYMD("2026-09-28", "2026-09-28")).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("completes a month on the same day of the month", () => {
    expect(diffYMD("2026-01-15", "2026-02-14")).toEqual({ years: 0, months: 0, days: 30 });
    expect(diffYMD("2026-01-15", "2026-02-15")).toEqual({ years: 0, months: 1, days: 0 });
    expect(diffYMD("2026-01-01", "2026-02-01")).toEqual({ years: 0, months: 1, days: 0 });
  });

  it("rolls a missing month-end day over to the 1st of the next month", () => {
    expect(diffYMD("2023-01-31", "2023-02-28")).toEqual({ years: 0, months: 0, days: 28 });
    expect(diffYMD("2023-01-31", "2023-03-01")).toEqual({ years: 0, months: 1, days: 0 });
    expect(diffYMD("2023-01-31", "2023-03-02")).toEqual({ years: 0, months: 1, days: 1 });
    expect(diffYMD("2023-01-31", "2023-03-31")).toEqual({ years: 0, months: 2, days: 0 });
    expect(diffYMD("2023-01-31", "2023-04-30")).toEqual({ years: 0, months: 2, days: 30 });
    expect(diffYMD("2024-01-31", "2024-02-29")).toEqual({ years: 0, months: 0, days: 29 });
    expect(diffYMD("2026-03-31", "2026-05-01")).toEqual({ years: 0, months: 1, days: 0 });
  });

  it("treats 29 February as reaching its anniversary on 1 March in a common year", () => {
    expect(diffYMD("2000-02-29", "2001-02-28")).toEqual({ years: 0, months: 11, days: 30 });
    expect(diffYMD("2000-02-29", "2001-03-01")).toEqual({ years: 1, months: 0, days: 0 });
    expect(diffYMD("2000-02-29", "2004-02-29")).toEqual({ years: 4, months: 0, days: 0 });
    expect(diffYMD("2000-02-29", "2004-02-28")).toEqual({ years: 3, months: 11, days: 30 });
  });

  it("handles 100+ year spans", () => {
    expect(diffYMD("1920-05-17", "2026-09-28")).toEqual({ years: 106, months: 4, days: 11 });
    expect(diffYMD("0001-01-01", "9999-12-31")).toEqual({ years: 9998, months: 11, days: 30 });
  });

  it("adds back up to the day count", () => {
    const pairs: [string, string][] = [
      ["1992-05-17", "2026-09-28"],
      ["2023-01-31", "2023-04-30"],
      ["2000-02-29", "2001-02-28"],
      ["1999-12-31", "2026-02-28"],
    ];
    for (const [a, b] of pairs) {
      const { years, months, days } = diffYMD(a, b);
      const parsed = parseDate(a)!;
      const index = parsed.y * 12 + parsed.m - 1 + years * 12 + months;
      const y = Math.floor(index / 12);
      const m = (index % 12) + 1;
      // The anniversary, rolled forward when the day doesn't exist, plus `days`, lands on `b`.
      const anniversary =
        parsed.d <= daysInMonth(y, m) ? toISODate({ y, m, d: parsed.d }) : toISODate({ y, m: m + 1, d: 1 });
      expect(addDays(anniversary, days)).toBe(b);
    }
  });
});

describe("countWeekdays / businessDaysBetween", () => {
  it("counts Monday to Friday, excluding the end by default", () => {
    // Mon 28 Sep → Fri 2 Oct 2026
    expect(businessDaysBetween("2026-09-28", "2026-10-02")).toBe(4);
    expect(businessDaysBetween("2026-09-28", "2026-10-02", { includeEnd: true })).toBe(5);
    expect(countWeekdays("2026-09-28", "2026-10-02")).toBe(5);
  });

  it("skips weekends at either end", () => {
    // Sat 3 Oct → Mon 5 Oct 2026
    expect(businessDaysBetween("2026-10-03", "2026-10-05")).toBe(0);
    expect(businessDaysBetween("2026-10-03", "2026-10-05", { includeEnd: true })).toBe(1);
    expect(countWeekdays("2026-10-03", "2026-10-04")).toBe(0);
  });

  it("is zero on the same day unless it's counted and a weekday", () => {
    expect(businessDaysBetween("2026-09-28", "2026-09-28")).toBe(0);
    expect(businessDaysBetween("2026-09-28", "2026-09-28", { includeEnd: true })).toBe(1);
    expect(businessDaysBetween("2026-10-03", "2026-10-03", { includeEnd: true })).toBe(0);
  });

  it("is order-independent", () => {
    expect(businessDaysBetween("2026-10-02", "2026-09-28")).toBe(4);
    expect(countWeekdays("2026-10-02", "2026-09-28")).toBe(5);
  });

  it("counts whole years", () => {
    expect(countWeekdays("2026-01-01", "2026-12-31")).toBe(261); // starts on a Thursday
    expect(countWeekdays("2024-01-01", "2024-12-31")).toBe(262); // leap, starts on a Monday
    expect(businessDaysBetween("2026-01-01", "2026-01-31", { includeEnd: true })).toBe(22);
  });

  it("agrees with a day-by-day count", () => {
    const starts = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-10-01", "2024-02-27"];
    for (const start of starts) {
      for (const len of [0, 1, 2, 5, 6, 7, 8, 13, 14, 29, 60, 400]) {
        const end = addDays(start, len)!;
        expect(countWeekdays(start, end), `${start} +${len}`).toBe(naiveWeekdays(start, end));
      }
    }
  });

  it("handles a century", () => {
    // 36,525 days = 5,217 weeks and 6 days, the leftover 6 days holding 5 weekdays.
    expect(countWeekdays("2000-01-01", "2099-12-31")).toBe(naiveWeekdays("2000-01-01", "2099-12-31"));
  });
});

describe("addBusinessDays", () => {
  it("steps over weekends", () => {
    expect(addBusinessDays("2026-10-02", 1)).toBe("2026-10-05"); // Fri → Mon
    expect(addBusinessDays("2026-10-03", 1)).toBe("2026-10-05"); // Sat → Mon
    expect(addBusinessDays("2026-10-04", 1)).toBe("2026-10-05"); // Sun → Mon
    expect(addBusinessDays("2026-09-28", 5)).toBe("2026-10-05"); // Mon → next Mon
    expect(addBusinessDays("2026-09-28", 10)).toBe("2026-10-12");
    expect(addBusinessDays("2026-10-03", 5)).toBe("2026-10-09"); // Sat → Fri
    expect(addBusinessDays("2026-10-03", 6)).toBe("2026-10-12");
  });

  it("goes back with a negative count", () => {
    expect(addBusinessDays("2026-10-05", -1)).toBe("2026-10-02"); // Mon → Fri
    expect(addBusinessDays("2026-10-04", -1)).toBe("2026-10-02"); // Sun → Fri
    expect(addBusinessDays("2026-10-05", -5)).toBe("2026-09-28");
  });

  it("leaves the date alone for zero, even on a weekend", () => {
    expect(addBusinessDays("2026-10-03", 0)).toBe("2026-10-03");
  });

  it("agrees with a day-by-day walk", () => {
    const starts = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-30", "2026-10-02"];
    for (const start of starts) {
      for (const n of [1, 2, 4, 5, 6, 9, 10, 11, 23, 250, -1, -4, -5, -6, -11, -250]) {
        expect(addBusinessDays(start, n), `${start} ${n}`).toBe(naiveAddBusinessDays(start, n));
      }
    }
  });

  it("lands n working days on, counted the businessDaysBetween way", () => {
    for (const n of [1, 7, 20, 260]) {
      const end = addBusinessDays("2026-09-28", n)!;
      // Start excluded, end included.
      expect(countWeekdays(addDays("2026-09-28", 1)!, end)).toBe(n);
    }
  });

  it("has no answer past the year 9999", () => {
    expect(addBusinessDays("9999-12-31", 1)).toBeNull();
    expect(addBusinessDays("0001-01-01", -1)).toBeNull();
  });
});

describe("nextBirthday", () => {
  it("finds the coming birthday", () => {
    expect(nextBirthday("1992-05-17", "2026-09-28")).toEqual({
      date: "2027-05-17",
      turns: 35,
      daysUntil: 231,
    });
    expect(nextBirthday("1992-12-01", "2026-09-28")).toEqual({
      date: "2026-12-01",
      turns: 34,
      daysUntil: 64,
    });
  });

  it("is today on the birthday itself", () => {
    expect(nextBirthday("1992-09-28", "2026-09-28")).toEqual({
      date: "2026-09-28",
      turns: 34,
      daysUntil: 0,
    });
  });

  it("is a year away for someone born today", () => {
    expect(nextBirthday("2026-09-28", "2026-09-28")).toEqual({
      date: "2027-09-28",
      turns: 1,
      daysUntil: 365,
    });
  });

  it("puts a 29 February birthday on 1 March in common years", () => {
    expect(nextBirthday("2000-02-29", "2026-02-28")).toEqual({
      date: "2026-03-01",
      turns: 26,
      daysUntil: 1,
    });
    expect(nextBirthday("2000-02-29", "2026-03-01")?.daysUntil).toBe(0);
    expect(nextBirthday("2000-02-29", "2027-12-01")).toEqual({
      date: "2028-02-29",
      turns: 28,
      daysUntil: 90,
    });
  });

  it("agrees with age about when the year ticks over", () => {
    const dob = "2000-02-29";
    const { date, turns } = nextBirthday(dob, "2026-01-10")!;
    expect(age(dob, date)).toMatchObject({ years: turns, months: 0, days: 0 });
    expect(age(dob, addDays(date, -1)!)?.years).toBe(turns - 1);
  });

  it("has no answer before birth or past 9999", () => {
    expect(nextBirthday("2026-09-28", "2026-09-27")).toBeNull();
    expect(nextBirthday("9998-06-01", "9999-07-01")).toBeNull();
  });
});

describe("age", () => {
  it("gives the exact age and the totals", () => {
    expect(age("1992-05-17", "2026-09-28")).toEqual({
      years: 34,
      months: 4,
      days: 11,
      totalMonths: 412,
      totalWeeks: 1793,
      weekDays: 1,
      totalDays: 12_552,
    });
  });

  it("is all zeros on the day of birth", () => {
    expect(age("2026-09-28", "2026-09-28")).toMatchObject({ years: 0, months: 0, days: 0, totalDays: 0 });
  });

  it("turns over on the birthday", () => {
    expect(age("1992-09-28", "2026-09-27")).toMatchObject({ years: 33, months: 11, days: 30 });
    expect(age("1992-09-28", "2026-09-28")).toMatchObject({ years: 34, months: 0, days: 0 });
  });

  it("handles centenarians", () => {
    expect(age("1920-02-29", "2026-02-28")).toMatchObject({ years: 105, months: 11, days: 30 });
    expect(age("1920-02-29", "2026-03-01")).toMatchObject({ years: 106, months: 0, days: 0 });
  });

  it("has no answer before birth", () => {
    expect(age("2026-09-28", "2026-09-27")).toBeNull();
  });
});

describe("dateSpan", () => {
  it("summarises a span, end excluded", () => {
    expect(dateSpan("2026-01-01", "2026-01-31")).toEqual({
      days: 30,
      totalDays: 30,
      weeks: 4,
      weekDays: 2,
      ymd: { years: 0, months: 0, days: 30 },
      totalMonths: 0,
      workingDays: 22, // 31 Jan 2026 is a Saturday, so leaving it out costs nothing
    });
  });

  it("counts the last day in every figure when it's included", () => {
    const span = dateSpan("2026-01-01", "2026-01-31", { includeEnd: true });
    expect(span.days).toBe(31);
    expect(span.ymd).toEqual({ years: 0, months: 1, days: 0 });
    expect(span.totalMonths).toBe(1);
    expect(span.workingDays).toBe(22);
  });

  it("reports a reversed span as negative, with positive parts", () => {
    const span = dateSpan("2027-05-17", "2026-09-28");
    expect(span.days).toBe(-231);
    expect(span.totalDays).toBe(231);
    expect(span.weeks).toBe(33);
    expect(span.weekDays).toBe(0);
    expect(span.ymd).toEqual({ years: 0, months: 7, days: 19 });
    expect(span.totalMonths).toBe(7);
  });

  it("gives whole months beyond a year", () => {
    const span = dateSpan("2025-01-10", "2026-09-28");
    expect(span.ymd).toEqual({ years: 1, months: 8, days: 18 });
    expect(span.totalMonths).toBe(20);
  });

  it("handles the last supported day inclusively", () => {
    const span = dateSpan("9999-12-01", "9999-12-31", { includeEnd: true });
    expect(span.days).toBe(31);
    expect(span.ymd).toEqual({ years: 0, months: 1, days: 0 });
  });
});

describe("resolveDateInput", () => {
  it("passes real dates through", () => {
    expect(resolveDateInput("2026-12-25", null)).toBe("2026-12-25");
    expect(resolveDateInput("2026-12-25", "2026-09-28")).toBe("2026-12-25");
  });

  it("resolves today-relative values once today is known", () => {
    expect(resolveDateInput("today", "2026-09-28")).toBe("2026-09-28");
    expect(resolveDateInput("today+30", "2026-09-28")).toBe("2026-10-28");
    expect(resolveDateInput("today-1", "2026-09-28")).toBe("2026-09-27");
    // A "+" in a query string arrives as a space.
    expect(resolveDateInput("today 30", "2026-09-28")).toBe("2026-10-28");
  });

  it("is pending while today is unknown", () => {
    expect(resolveDateInput("today", null)).toBeUndefined();
    expect(resolveDateInput("today+30", null)).toBeUndefined();
  });

  it("is null for anything else", () => {
    expect(resolveDateInput("", "2026-09-28")).toBeNull();
    expect(resolveDateInput("2026-02-30", "2026-09-28")).toBeNull();
    expect(resolveDateInput("tomorrow", "2026-09-28")).toBeNull();
    expect(resolveDateInput("today+9999999", "2026-09-28")).toBeNull();
  });
});

describe("display", () => {
  it("formats dates in the visitor's order, always in English", () => {
    expect(formatDate("2026-09-28", "en-US")).toBe("Monday, Sep 28, 2026");
    expect(formatDate("2026-09-28", "en-US", "short")).toBe("Mon, Sep 28, 2026");
    expect(formatDate("2026-09-28", "en-US", "plain")).toBe("September 28, 2026");
    expect(formatDate("2026-09-28", "de-DE")).toMatch(/^Monday,? 28 Sept?\.? 2026$/);
  });

  it("doesn't shift the day in any time zone", () => {
    expect(formatDate("2026-03-29", "en-US", "plain")).toBe("March 29, 2026");
    expect(formatDate("0001-01-01", "en-US", "plain")).toBe("January 1, 1");
  });

  it("pluralises counts", () => {
    expect(formatCount(1, "day")).toBe("1 day");
    expect(formatCount(0, "day")).toBe("0 days");
    expect(formatCount(12_552, "day")).toBe("12,552 days");
    expect(formatCount(12_552, "day", "en-IN")).toBe("12,552 days");
    expect(formatYMD({ years: 1, months: 0, days: 1 })).toBe("1 year, 0 months, 1 day");
    expect(formatYMD({ years: 34, months: 4, days: 11 })).toBe("34 years, 4 months, 11 days");
  });
});
