import { describe, expect, it } from "vitest";
import {
  feedDaysOf,
  jumpDate,
  jumpNotice,
  landingFor,
  pickFeedDay,
  pickLoadedFeedDay,
} from "@/lib/feed-days";

const DAYS = ["2026-06-01", "2026-06-03", "2026-06-10", "2026-07-02"];

describe("landingFor", () => {
  it("says which side of the asked date a day is", () => {
    expect(landingFor("2026-06-03", "2026-06-03")).toEqual({ day: "2026-06-03", side: "on" });
    expect(landingFor("2026-06-01", "2026-06-03")).toEqual({ day: "2026-06-01", side: "before" });
    expect(landingFor("2026-06-10", "2026-06-03")).toEqual({ day: "2026-06-10", side: "after" });
  });
});

describe("jumpDate", () => {
  it("asks for the day itself", () => {
    expect(jumpDate({ kind: "day", date: "2026-06-03" })).toBe("2026-06-03");
  });

  it("asks for a month's last day, so it lands on the month's latest day with transactions", () => {
    expect(jumpDate({ kind: "month", month: "2026-06" })).toBe("2026-06-30");
    expect(jumpDate({ kind: "month", month: "2028-02" })).toBe("2028-02-29");
    expect(jumpDate({ kind: "month", month: "2026-12" })).toBe("2026-12-31");
  });
});

describe("pickFeedDay", () => {
  it("lands on the day when it has transactions", () => {
    expect(pickFeedDay(DAYS, "2026-06-03")).toEqual({ day: "2026-06-03", side: "on" });
  });

  it("otherwise on the nearest earlier day", () => {
    expect(pickFeedDay(DAYS, "2026-06-09")).toEqual({ day: "2026-06-03", side: "before" });
    expect(pickFeedDay(DAYS, "2026-06-30")).toEqual({ day: "2026-06-10", side: "before" });
    expect(pickFeedDay(DAYS, "2030-01-01")).toEqual({ day: "2026-07-02", side: "before" });
  });

  it("and with nothing that early, on the first day after it", () => {
    expect(pickFeedDay(DAYS, "2020-01-01")).toEqual({ day: "2026-06-01", side: "after" });
  });

  it("is null with no days at all", () => {
    expect(pickFeedDay([], "2026-06-03")).toBeNull();
  });
});

describe("pickLoadedFeedDay", () => {
  const all = { olderComplete: true, newerComplete: true };
  const middle = { olderComplete: false, newerComplete: false };

  it("answers any date inside the loaded stretch", () => {
    expect(pickLoadedFeedDay(DAYS, "2026-06-10", middle)).toEqual({ day: "2026-06-10", side: "on" });
    expect(pickLoadedFeedDay(DAYS, "2026-06-20", middle)).toEqual({ day: "2026-06-10", side: "before" });
  });

  it("asks the server past the newest loaded day unless that's the present", () => {
    expect(pickLoadedFeedDay(DAYS, "2026-08-01", middle)).toBeNull();
    expect(pickLoadedFeedDay(DAYS, "2026-08-01", { ...middle, newerComplete: true })).toEqual({
      day: "2026-07-02",
      side: "before",
    });
  });

  it("asks the server before the oldest loaded day unless that's the start of history", () => {
    expect(pickLoadedFeedDay(DAYS, "2026-05-01", middle)).toBeNull();
    expect(pickLoadedFeedDay(DAYS, "2026-05-01", { ...middle, olderComplete: true })).toEqual({
      day: "2026-06-01",
      side: "after",
    });
  });

  it("won't land on the oldest loaded day while more of it may still be above", () => {
    expect(pickLoadedFeedDay(DAYS, "2026-06-01", middle)).toBeNull();
    expect(pickLoadedFeedDay(DAYS, "2026-06-02", middle)).toBeNull();
    expect(pickLoadedFeedDay(DAYS, "2026-06-01", all)).toEqual({ day: "2026-06-01", side: "on" });
  });

  it("asks the server when nothing is loaded", () => {
    expect(pickLoadedFeedDay([], "2026-06-01", all)).toBeNull();
  });
});

describe("feedDaysOf", () => {
  it("lists each day once, in the feed's order", () => {
    const rows = ["2026-06-01", "2026-06-01", "2026-06-03", "2026-06-10", "2026-06-10"].map(
      (occurredOn) => ({ occurredOn }),
    );
    expect(feedDaysOf(rows)).toEqual(["2026-06-01", "2026-06-03", "2026-06-10"]);
    expect(feedDaysOf([])).toEqual([]);
  });
});

describe("jumpNotice", () => {
  it("says nothing when the jump landed where it was asked", () => {
    expect(jumpNotice({ kind: "day", date: "2026-06-03" }, landingFor("2026-06-03", "2026-06-03"))).toBeNull();
    expect(jumpNotice({ kind: "month", month: "2026-06" }, landingFor("2026-06-10", "2026-06-30"))).toBeNull();
  });

  it("names the day asked for and the day shown", () => {
    expect(jumpNotice({ kind: "day", date: "2026-06-09" }, landingFor("2026-06-03", "2026-06-09"))).toBe(
      "No transactions on Jun 9, 2026 — showing Jun 3, 2026.",
    );
  });

  it("names the month when a whole month was empty", () => {
    expect(jumpNotice({ kind: "month", month: "2026-08" }, landingFor("2026-07-02", "2026-08-31"))).toBe(
      "No transactions in August 2026 — showing Jul 2, 2026.",
    );
  });

  it("says when it had to go forward, because nothing was that early", () => {
    expect(jumpNotice({ kind: "day", date: "2020-01-01" }, landingFor("2026-06-01", "2020-01-01"))).toBe(
      "No transactions on or before Jan 1, 2020 — showing the first, Jun 1, 2026.",
    );
    expect(jumpNotice({ kind: "month", month: "2020-01" }, landingFor("2026-06-01", "2020-01-31"))).toBe(
      "No transactions in or before January 2020 — showing the first, Jun 1, 2026.",
    );
  });

  it("speaks the workspace's locale", () => {
    expect(
      jumpNotice({ kind: "day", date: "2026-06-09" }, landingFor("2026-06-03", "2026-06-09"), "en-GB"),
    ).toBe("No transactions on 9 Jun 2026 — showing 3 Jun 2026.");
  });
});

describe("a quarter as a jump target", () => {
  const q3 = { kind: "quarter" as const, year: 2026, quarter: 3 as const };
  it("asks for the quarter's last day", () => {
    expect(jumpDate(q3)).toBe("2026-09-30");
  });
  it("counts a landing anywhere in the quarter as a hit", () => {
    expect(jumpNotice(q3, { day: "2026-08-20", side: "before" })).toBeNull();
    expect(jumpNotice(q3, { day: "2026-07-01", side: "before" })).toBeNull();
  });
  it("says so when the quarter had nothing", () => {
    expect(jumpNotice(q3, { day: "2026-06-30", side: "before" })).toMatch(/No transactions in Q3 2026/);
    expect(jumpNotice(q3, { day: "2026-10-02", side: "after" })).toMatch(/in or before Q3 2026/);
  });
});
