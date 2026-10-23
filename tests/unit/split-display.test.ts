import { describe, it, expect } from "vitest";
import {
  acceptAmountInput,
  compareFeed,
  feedCursor,
  keepThroughRefresh,
  mergeFeed,
  balanceChipText,
  balanceStatus,
  dayInZone,
  initialsOf,
  myPart,
  myPartText,
  openPaymentsOf,
  payersLabel,
  peopleNames,
  planSummary,
  planSummaryText,
  SETTLED_UP,
  transferRole,
  transferSentence,
  transfersForViewer,
} from "@/lib/split-display";
import { parseAmountInput } from "@/lib/parse-amount";
import { computeShares } from "@/lib/split-math";

describe("initialsOf", () => {
  it("takes the first and last word's first letters", () => {
    expect(initialsOf("Asha Rao")).toBe("AR");
    expect(initialsOf("  ravi ")).toBe("R");
    expect(initialsOf("Mary Ann Lee")).toBe("ML");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("Émile zola")).toBe("ÉZ");
  });
});

describe("myPart", () => {
  /** One payer; `split` is who's in it, equally. */
  const expense = (payer: string, total: number, split: string[]) => ({
    amountMinor: total,
    payers: [{ memberId: payer, amountMinor: total }],
    shares: computeShares(total, payer, { type: "equal", memberIds: split }),
  });

  it("you paid and others share it: they owe you, by name", () => {
    expect(myPart(expense("me", 9000, ["me", "asha", "ben"]), "me")).toEqual({
      kind: "lent",
      amountMinor: 6000,
      people: [
        { memberId: "asha", amountMinor: 3000 },
        { memberId: "ben", amountMinor: 3000 },
      ],
    });
    expect(myPart(expense("me", 9000, ["asha"]), "me")).toEqual({
      kind: "lent",
      amountMinor: 9000,
      people: [{ memberId: "asha", amountMinor: 9000 }],
    });
  });

  it("you paid only for yourself", () => {
    expect(myPart(expense("me", 500, ["me"]), "me")).toEqual({ kind: "own" });
  });

  it("someone else paid: you owe them your share, or you're not involved", () => {
    expect(myPart(expense("asha", 9000, ["me", "asha", "ben"]), "me")).toEqual({
      kind: "owe",
      amountMinor: 3000,
      people: [{ memberId: "asha", amountMinor: 3000 }],
    });
    expect(myPart(expense("asha", 9000, ["asha", "ben"]), "me")).toEqual({ kind: "none" });
  });

  it("several payers: you owe — or are owed by — the people inside this expense", () => {
    const shared = (mePaid: number) => {
      const payers = [
        { memberId: "asha", amountMinor: 9000 - mePaid },
        { memberId: "me", amountMinor: mePaid },
      ];
      return { amountMinor: 9000, payers, shares: computeShares(9000, "asha", { type: "equal", memberIds: ["asha", "ben", "me"] }) };
    };
    expect(myPart(shared(4500), "me")).toEqual({
      kind: "lent",
      amountMinor: 1500,
      people: [{ memberId: "ben", amountMinor: 1500 }],
    });
    expect(myPart(shared(1000), "me")).toEqual({
      kind: "owe",
      amountMinor: 2000,
      people: [{ memberId: "asha", amountMinor: 2000 }],
    });
    expect(myPart(shared(3000), "me")).toEqual({ kind: "even" });
  });
});

describe("myPartText", () => {
  const fmt = (m: number) => `₹${m / 100}`;
  const names: Record<string, string> = { asha: "Asha", ben: "Ben", cy: "Cy" };
  const nameOf = (id: string) => names[id] ?? "Someone";
  const people = (...xs: [string, number][]) => xs.map(([memberId, amountMinor]) => ({ memberId, amountMinor }));

  it("says whom you owe", () => {
    expect(myPartText({ kind: "owe", amountMinor: 50_000, people: people(["asha", 50_000]) }, fmt, nameOf)).toBe(
      "You owe Asha ₹500",
    );
    expect(
      myPartText({ kind: "owe", amountMinor: 50_000, people: people(["asha", 30_000], ["ben", 20_000]) }, fmt, nameOf),
    ).toBe("You owe Asha ₹300 and Ben ₹200");
    expect(
      myPartText({ kind: "owe", amountMinor: 3000, people: people(["asha", 1000], ["ben", 1000], ["cy", 1000]) }, fmt, nameOf),
    ).toBe("You owe 3 people ₹30");
  });

  it("says who owes you", () => {
    expect(myPartText({ kind: "lent", amountMinor: 25_000, people: people(["ben", 25_000]) }, fmt, nameOf)).toBe(
      "Ben owes you ₹250",
    );
    expect(
      myPartText({ kind: "lent", amountMinor: 50_000, people: people(["asha", 25_000], ["ben", 25_000]) }, fmt, nameOf),
    ).toBe("Asha and Ben owe you ₹500");
    expect(
      myPartText({ kind: "lent", amountMinor: 75_000, people: people(["asha", 1], ["ben", 1], ["cy", 1]) }, fmt, nameOf),
    ).toBe("3 people owe you ₹750");
  });

  it("the rest stay short", () => {
    expect(myPartText({ kind: "even" }, fmt, nameOf)).toBe("You paid your share");
    expect(myPartText({ kind: "own" }, fmt, nameOf)).toBe("Just you");
    expect(myPartText({ kind: "none" }, fmt, nameOf)).toBe("Not involved");
  });
});

describe("payersLabel", () => {
  const you = { name: "Nitheesh", isYou: true };
  const asha = { name: "Asha", isYou: false };
  const ben = { name: "Ben", isYou: false };
  it("names one or two payers, and counts the rest", () => {
    expect(payersLabel([you])).toBe("You");
    expect(payersLabel([asha])).toBe("Asha");
    expect(payersLabel([asha, you])).toBe("Asha and you");
    expect(payersLabel([you, asha])).toBe("Asha and you");
    expect(payersLabel([asha, ben])).toBe("Asha and Ben");
    expect(payersLabel([asha, ben, you])).toBe("You and 2 others");
    expect(payersLabel([ben, asha, { name: "Chloe", isYou: false }])).toBe("Ben and 2 others");
  });
});

describe("balanceStatus", () => {
  it("names the three states, and Settled Up is Title Case", () => {
    expect(balanceStatus(100)).toBe("owed");
    expect(balanceStatus(-1)).toBe("owe");
    expect(balanceStatus(0)).toBe("settled");
    // Square overall, but owing one person what another owes you: not settled.
    expect(balanceStatus(0, 2)).toBe("open");
    expect(balanceStatus(-1, 2)).toBe("owe");
    expect(SETTLED_UP).toBe("Settled Up");
  });
});

describe("acceptAmountInput", () => {
  it("keeps digits from any keypad script — Devanagari, Arabic-Indic, Bengali", () => {
    expect(acceptAmountInput("", "१२३", "hi-IN")).toBe("१२३");
    expect(parseAmountInput(acceptAmountInput("", "१२३", "hi-IN"), "hi-IN")).toBe(123);
    expect(acceptAmountInput("", "١٢٣", "ar-EG")).toBe("١٢٣");
    expect(acceptAmountInput("", "৪৫", "bn-IN")).toBe("৪৫");
  });

  it("drops letters and symbols but keeps the locale's separators", () => {
    expect(acceptAmountInput("", "₹1,250.50abc", "en-IN")).toBe("1,250.50");
    expect(acceptAmountInput("", "1.250,50", "de-DE")).toBe("1.250,50");
  });

  it("refuses a keystroke past 9 whole-number digits", () => {
    expect(acceptAmountInput("123456789", "1234567890", "en-US")).toBe("123456789");
    expect(acceptAmountInput("१२३४५६७८९", "१२३४५६७८९०", "hi-IN")).toBe("१२३४५६७८९");
    expect(acceptAmountInput("123456789", "123456789.99", "en-US")).toBe("123456789.99");
  });
});

describe("balanceChipText", () => {
  it("has a full and a short form", () => {
    expect(balanceChipText(120000, "₹1,200")).toEqual({ full: "You're owed ₹1,200", short: "+₹1,200" });
    expect(balanceChipText(-30000, "₹300")).toEqual({ full: "You owe ₹300", short: "−₹300" });
    expect(balanceChipText(0, "₹0")).toEqual({ full: "Settled Up", short: "Settled Up" });
    expect(balanceChipText(0, "₹0", 2)).toEqual({ full: "Even overall, 2 payments to settle", short: "2 to settle" });
    expect(balanceChipText(0, "₹0", 1)).toEqual({ full: "Even overall, 1 payment to settle", short: "1 to settle" });
    expect(balanceChipText(-30000, "₹300", 2)).toEqual({ full: "You owe ₹300", short: "−₹300" });
  });
});

describe("dayInZone", () => {
  it("is the calendar day in the viewer's timezone", () => {
    const at = new Date("2026-10-01T20:30:00Z");
    expect(dayInZone(at, "UTC")).toBe("2026-10-01");
    expect(dayInZone(at, "Asia/Kolkata")).toBe("2026-10-02");
    expect(dayInZone(at, "America/Los_Angeles")).toBe("2026-10-01");
  });
});

describe("feed paging", () => {
  const item = (id: string, date: string, at: string) => ({ id, date, at: new Date(at) });
  const a = item("00000000-0000-7000-8000-000000000001", "2026-09-01", "2026-09-05T10:00:00.000Z");
  const b = item("00000000-0000-7000-8000-000000000002", "2026-09-03", "2026-09-01T10:00:00.000Z");
  const c = item("00000000-0000-7000-8000-000000000003", "2026-09-03", "2026-09-02T10:00:00.000Z");
  const d = item("00000000-0000-7000-8000-000000000004", "2026-09-03", "2026-09-02T10:00:00.000Z");

  it("orders by date, then when added, then id — like the server", () => {
    expect([d, b, a, c].sort(compareFeed)).toEqual([a, b, c, d]);
  });

  it("asks for the page before the oldest item on screen", () => {
    expect(feedCursor(b)).toEqual({ day: "2026-09-03", at: "2026-09-01T10:00:00.000Z", id: b.id });
  });

  it("keeps earlier pages when a fresh newest page arrives", () => {
    // [a, b] were loaded with "Show earlier"; the new newest page starts at c.
    expect(mergeFeed([a, b, c], [c, d])).toEqual([a, b, c, d]);
  });

  it("drops what the fresh page now covers, and anything newer than its start", () => {
    // b was deleted and c edited: the re-read page [c, d] is the truth from c up.
    const cEdited = { ...c };
    expect(mergeFeed([a, b, c], [b, cEdited, d]).map((i) => i.id)).toEqual([a.id, b.id, c.id, d.id]);
    expect(mergeFeed([a, b, c, d], [d])).toEqual([a, b, c, d]);
    expect(mergeFeed([a, b, c, d], [c]).map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  it("an empty page means nothing is left", () => {
    expect(mergeFeed([a, b], [])).toEqual([]);
  });

  it("a refresh that pushes an item off the newest page keeps it, even if the re-read fails", () => {
    // [a] came from "Show earlier"; the newest page was [b, c]; e was added,
    // so the new newest page is [c, e] and b fell off it.
    const e = item("00000000-0000-7000-8000-000000000005", "2026-09-04", "2026-09-04T10:00:00.000Z");
    expect(mergeFeed([a], [c, e]).map((i) => i.id)).toEqual([a.id, c.id, e.id]); // b lost
    const kept = keepThroughRefresh([a], [b, c]);
    expect(mergeFeed(kept, [c, e])).toEqual([a, b, c, e]); // the re-read failed: b stays
    expect(mergeFeed(mergeFeed(kept, [a, b]), [c, e])).toEqual([a, b, c, e]); // it landed
    expect(keepThroughRefresh([a], [])).toEqual([a]);
  });
});

describe("who pays whom, as the viewer reads it", () => {
  // The server's plan, the same for every member.
  const plan = [
    { fromMemberId: "ravi", toMemberId: "asha", amountMinor: 10_000 },
    { fromMemberId: "me", toMemberId: "ravi", amountMinor: 50_000 },
    { fromMemberId: "ben", toMemberId: "asha", amountMinor: 2_000 },
    { fromMemberId: "me", toMemberId: "asha", amountMinor: 300 },
  ];

  it("names the viewer's part in each payment", () => {
    expect(transferRole(plan[1]!, "me")).toBe("pay");
    expect(transferRole(plan[0]!, "asha")).toBe("receive");
    expect(transferRole(plan[2]!, "me")).toBe("other");
  });

  it("puts the viewer's own payments first, keeping the plan's order in each part", () => {
    expect(transfersForViewer(plan, "me").map((t) => [t.fromMemberId, t.toMemberId, t.role])).toEqual([
      ["me", "ravi", "pay"],
      ["me", "asha", "pay"],
      ["ravi", "asha", "other"],
      ["ben", "asha", "other"],
    ]);
    expect(transfersForViewer(plan, "asha").map((t) => t.role)).toEqual(["receive", "receive", "receive", "other"]);
  });

  it("leaves the plan alone for someone with no part in it, and an empty plan empty", () => {
    expect(transfersForViewer(plan, "zoe").map(({ role, ...t }) => (role === "other" ? t : null))).toEqual(plan);
    expect(transfersForViewer([], "me")).toEqual([]);
  });

  it("keeps every payment and its amount — nothing added, dropped or changed", () => {
    const seen = transfersForViewer(plan, "me");
    expect(seen).toHaveLength(plan.length);
    expect(seen.reduce((a, t) => a + t.amountMinor, 0)).toBe(plan.reduce((a, t) => a + t.amountMinor, 0));
  });

  it("phrases each line from the viewer's side", () => {
    expect(transferSentence("pay", "You", "Ravi")).toBe("You pay Ravi");
    expect(transferSentence("receive", "Asha", "You")).toBe("Asha pays you");
    expect(transferSentence("other", "Ravi", "Asha")).toBe("Ravi pays Asha");
  });
});

describe("openPaymentsOf", () => {
  it("counts the lines someone pays or receives", () => {
    const plan = [
      { fromMemberId: "a", toMemberId: "b" },
      { fromMemberId: "c", toMemberId: "a" },
      { fromMemberId: "c", toMemberId: "b" },
    ];
    expect(openPaymentsOf(plan, "a")).toBe(2);
    expect(openPaymentsOf(plan, "c")).toBe(2);
    expect(openPaymentsOf(plan, "z")).toBe(0);
    expect(openPaymentsOf([], "a")).toBe(0);
  });
});

describe("the settle-up bar's summary", () => {
  const names: Record<string, string> = { me: "Kumar", sen: "Senthil", nan: "Nantha", mut: "Muthumani", ravi: "Ravi" };
  const nameOf = (id: string) => names[id] ?? "Someone";
  const format = (minor: number) => `₹${minor / 100}`;
  // The Goa trip: you pay Senthil; Nantha and Muthumani pay you and Senthil.
  const goa = [
    { fromMemberId: "nan", toMemberId: "sen", amountMinor: 50000 },
    { fromMemberId: "mut", toMemberId: "sen", amountMinor: 50000 },
    { fromMemberId: "me", toMemberId: "sen", amountMinor: 25000 },
    { fromMemberId: "mut", toMemberId: "me", amountMinor: 25000 },
    { fromMemberId: "nan", toMemberId: "me", amountMinor: 25000 },
  ];

  it("sums each side and counts the payments between others", () => {
    expect(planSummary(goa, "me")).toEqual({
      pay: { memberIds: ["sen"], amountMinor: 25000 },
      receive: { memberIds: ["mut", "nan"], amountMinor: 50000 },
      others: 2,
    });
    expect(planSummary(goa, "sen")).toEqual({
      pay: { memberIds: [], amountMinor: 0 },
      receive: { memberIds: ["nan", "mut", "me"], amountMinor: 125000 },
      others: 2,
    });
  });

  it("says whom you pay and who pays you, by name", () => {
    expect(planSummaryText(planSummary(goa, "me"), format, nameOf)).toBe(
      "You pay Senthil ₹250, Muthumani and Nantha pay you ₹500",
    );
    expect(planSummaryText(planSummary(goa, "sen"), format, nameOf)).toBe("Nantha and 2 others pay you ₹1250");
    expect(planSummaryText(planSummary(goa, "nan"), format, nameOf)).toBe("You pay Senthil and Kumar ₹750");
    expect(planSummaryText(planSummary([goa[3]!], "me"), format, nameOf)).toBe("Muthumani pays you ₹250");
  });

  it("says when you're square, and when everyone is", () => {
    expect(planSummaryText(planSummary(goa.slice(0, 2), "me"), format, nameOf)).toBe(
      "You're settled up, 2 payments between others",
    );
    expect(planSummaryText(planSummary(goa.slice(0, 1), "me"), format, nameOf)).toBe(
      "You're settled up, 1 payment between others",
    );
    expect(planSummaryText(planSummary([], "me"), format, nameOf)).toBe("All settled up — nobody owes anyone");
  });

  it("names one person, two, or the first and a count", () => {
    expect(peopleNames(["Ravi"])).toBe("Ravi");
    expect(peopleNames(["Ravi", "Asha"])).toBe("Ravi and Asha");
    expect(peopleNames(["Ravi", "Asha", "Ben"])).toBe("Ravi and 2 others");
    expect(peopleNames([])).toBe("");
  });
});
