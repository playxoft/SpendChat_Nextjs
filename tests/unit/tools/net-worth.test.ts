import { describe, expect, it } from "vitest";
import {
  GROUPS,
  MAX_AMOUNT,
  MAX_NAME,
  MAX_ROWS,
  MAX_SNAPSHOTS,
  baselineSnapshot,
  changeBetween,
  decodeRows,
  encodeRows,
  isIsoDate,
  netWorth,
  netWorthSplit,
  readAmount,
  sanitizeSnapshots,
  sideOf,
  toMinor,
  toStored,
  withSnapshot,
  type Entry,
  type Snapshot,
} from "@/lib/tools/net-worth";

function snap(date: string, assets: number, liabilities: number, currency = "USD"): Snapshot {
  return { date, currency, assets, liabilities, netWorth: assets - liabilities, inputs: {} };
}

describe("GROUPS", () => {
  it("has six asset groups and four liability groups with unique, short keys", () => {
    expect(GROUPS.filter((g) => g.side === "asset")).toHaveLength(6);
    expect(GROUPS.filter((g) => g.side === "liability")).toHaveLength(4);
    const keys = GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]{2}$/);
    expect(sideOf("property")).toBe("asset");
    expect(sideOf("cards")).toBe("liability");
  });
});

describe("encodeRows / decodeRows", () => {
  it("round-trips names and amounts as typed", () => {
    const rows = [
      { name: "Savings account", amount: "12,000.50" },
      { name: "", amount: "3000" },
      { name: "Half typed ", amount: "1," },
    ];
    expect(decodeRows(encodeRows(rows))).toEqual(rows);
  });

  it("strips the separators so a name can't split a row", () => {
    const encoded = encodeRows([{ name: "A|B~C", amount: "1~0|0" }]);
    expect(decodeRows(encoded)).toEqual([{ name: "ABC", amount: "100" }]);
  });

  it("caps rows, name length and amount length", () => {
    const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ name: `Row ${i}`, amount: "1" }));
    expect(decodeRows(encodeRows(many))).toHaveLength(MAX_ROWS);
    const long = decodeRows(`${"x".repeat(200)}~${"9".repeat(200)}`);
    expect(long[0]!.name).toHaveLength(MAX_NAME);
    expect(long[0]!.amount.length).toBeLessThanOrEqual(20);
    // A hand-edited link with too many rows is cut on read, too.
    expect(decodeRows(Array.from({ length: 50 }, () => "a~1").join("|"))).toHaveLength(MAX_ROWS);
  });

  it("reads an empty group, missing fields and junk without throwing", () => {
    expect(decodeRows("")).toEqual([]);
    expect(decodeRows("Car")).toEqual([{ name: "Car", amount: "" }]);
    expect(decodeRows("~")).toEqual([{ name: "", amount: "" }]);
    expect(decodeRows("a~1~extra|b")).toEqual([
      { name: "a", amount: "1" },
      { name: "b", amount: "" },
    ]);
    expect(encodeRows([])).toBe("");
  });

  it("always contains a separator, so the URL layer never mistakes a group for a number", () => {
    expect(encodeRows([{ name: "", amount: "5000" }])).toBe("~5000");
  });
});

describe("readAmount", () => {
  it("treats blank as not filled in yet", () => {
    expect(readAmount("", "en-US")).toEqual({ value: null, error: null });
    expect(readAmount("   ", "en-US")).toEqual({ value: null, error: null });
  });

  it("reads the visitor's own number format", () => {
    expect(readAmount("1,00,000", "en-IN").value).toBe(100000);
    expect(readAmount("1.500,25", "de-DE").value).toBe(1500.25);
    expect(readAmount("0", "en-US")).toEqual({ value: 0, error: null });
  });

  it("explains negatives, junk and huge values", () => {
    expect(readAmount("-50", "en-US").error).toMatch(/minus/);
    expect(readAmount("abc", "en-US").error).toMatch(/number/);
    expect(readAmount(String(MAX_AMOUNT * 10), "en-US").error).toMatch(/more than/);
    expect(readAmount(String(MAX_AMOUNT), "en-US").value).toBe(MAX_AMOUNT);
  });
});

describe("netWorth", () => {
  const example: Entry[] = [
    { group: "cash", amount: 15_000 },
    { group: "investments", amount: 25_000 },
    { group: "retirement", amount: 40_000 },
    { group: "property", amount: 300_000 },
    { group: "vehicles", amount: 12_000 },
    { group: "homeLoan", amount: 220_000 },
    { group: "loans", amount: 8_000 },
    { group: "cards", amount: 2_500 },
  ];

  it("is assets minus liabilities, with a subtotal per group", () => {
    const r = netWorth(example);
    expect(r.assets).toBe(392_000);
    expect(r.liabilities).toBe(230_500);
    expect(r.netWorth).toBe(161_500);
    expect(r.byGroup.property).toBe(300_000);
    expect(r.byGroup.otherAssets).toBe(0);
    expect(r.byGroup.cards).toBe(2_500);
    expect(r.debtToAsset).toBeCloseTo((230_500 / 392_000) * 100, 10);
    expect(r.debtToAsset!.toFixed(1)).toBe("58.8");
  });

  it("adds several rows in one group", () => {
    const r = netWorth([
      { group: "cash", amount: 100 },
      { group: "cash", amount: 250 },
      { group: "cards", amount: 50 },
      { group: "cards", amount: 25 },
    ]);
    expect(r.byGroup.cash).toBe(350);
    expect(r.byGroup.cards).toBe(75);
    expect(r.netWorth).toBe(275);
  });

  it("adds cents exactly, where floats would drift", () => {
    const tenths = Array.from({ length: 10 }, () => ({ group: "cash" as const, amount: 0.1 }));
    expect(netWorth(tenths).assets).toBe(1);
    expect(netWorth([
      { group: "cash", amount: 0.1 },
      { group: "investments", amount: 0.2 },
    ]).assets).toBe(0.3);
  });

  it("goes negative when you owe more than you own", () => {
    const r = netWorth([
      { group: "cash", amount: 2_000 },
      { group: "loans", amount: 30_000 },
    ]);
    expect(r.netWorth).toBe(-28_000);
    expect(r.debtToAsset).toBe(1500);
  });

  it("is all zeros with nothing entered, and has no ratio without assets", () => {
    const empty = netWorth([]);
    expect(empty).toMatchObject({ assets: 0, liabilities: 0, netWorth: 0, debtToAsset: null });
    expect(netWorth([{ group: "cards", amount: 500 }]).debtToAsset).toBeNull();
    expect(netWorth([{ group: "cash", amount: 500 }]).debtToAsset).toBe(0);
  });

  it("respects the currency's decimals", () => {
    // Yen has none: ¥100.4 counts as ¥100.
    expect(netWorth([{ group: "cash", amount: 100.4 }], 0).assets).toBe(100);
    // Dinars have three.
    expect(netWorth([
      { group: "cash", amount: 1.001 },
      { group: "cash", amount: 2.002 },
    ], 3).assets).toBe(3.003);
  });

  it("stays exact with every row at the largest amount", () => {
    const all: Entry[] = GROUPS.flatMap((g) =>
      Array.from({ length: MAX_ROWS }, () => ({ group: g.id, amount: MAX_AMOUNT - 0.01 })),
    );
    const r = netWorth(all);
    // In cents, as exact integers: each row is 99,999,999,999,999 cents.
    const rowCents = MAX_AMOUNT * 100 - 1;
    expect(toMinor(r.assets, 2)).toBe(60 * rowCents);
    expect(toMinor(r.liabilities, 2)).toBe(40 * rowCents);
    expect(toMinor(r.netWorth, 2)).toBe(20 * rowCents);
    expect(Number.isSafeInteger(60 * rowCents)).toBe(true);
  });
});

describe("netWorthSplit", () => {
  it("splits assets into owed and yours when you own more", () => {
    const s = netWorthSplit(400, 100);
    expect(s).toEqual({ whole: "assets", owed: 25, yours: 75 });
  });

  it("splits debts into covered and shortfall when you owe more", () => {
    const s = netWorthSplit(100, 400);
    expect(s).toEqual({ whole: "liabilities", covered: 25, shortfall: 75 });
  });

  it("handles one side empty, equal sides and nothing at all", () => {
    expect(netWorthSplit(500, 0)).toEqual({ whole: "assets", owed: 0, yours: 100 });
    expect(netWorthSplit(0, 500)).toEqual({ whole: "liabilities", covered: 0, shortfall: 100 });
    expect(netWorthSplit(300, 300)).toEqual({ whole: "assets", owed: 100, yours: 0 });
    expect(netWorthSplit(0, 0)).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2026-09-30")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-9-30")).toBe(false);
    expect(isIsoDate(20260930)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("sanitizeSnapshots", () => {
  it("reads back what toStored wrote", () => {
    const s = { ...snap("2026-09-30", 392_000, 230_500), inputs: { ca: "Savings~15000" } };
    expect(sanitizeSnapshots([toStored(s)])).toEqual([s]);
  });

  it("derives net worth from the totals rather than trusting a stored one", () => {
    const [s] = sanitizeSnapshots([{ d: "2026-01-01", c: "EUR", a: 100, l: 250, n: 999 }]);
    expect(s!.netWorth).toBe(-150);
    expect(s!.inputs).toEqual({});
  });

  it("drops anything malformed and never throws", () => {
    expect(sanitizeSnapshots(null)).toEqual([]);
    expect(sanitizeSnapshots("[]")).toEqual([]);
    expect(sanitizeSnapshots({ d: "2026-01-01" })).toEqual([]);
    const junk = [
      null,
      42,
      { d: "2026-02-30", c: "USD", a: 1, l: 0 },
      { d: "2026-01-01", c: "XXX", a: 1, l: 0 },
      { d: "2026-01-01", c: "USD", a: -1, l: 0 },
      { d: "2026-01-01", c: "USD", a: Number.NaN, l: 0 },
      { d: "2026-01-01", c: "USD", a: 1, l: "5" },
      { d: "2026-01-01", c: "USD", a: 1e20, l: 0 },
      { d: "2026-03-01", c: "USD", a: 10, l: 5 },
    ];
    expect(sanitizeSnapshots(junk).map((s) => s.date)).toEqual(["2026-03-01"]);
  });

  it("keeps only known group keys, capped like a link", () => {
    const rows = Array.from({ length: 30 }, () => "x~1").join("|");
    const [s] = sanitizeSnapshots([
      { d: "2026-01-01", c: "USD", a: 1, l: 0, i: { ca: rows, zz: "a~1", iv: 7, __proto__: "x" } },
    ]);
    expect(Object.keys(s!.inputs)).toEqual(["ca"]);
    expect(decodeRows(s!.inputs.ca!)).toHaveLength(MAX_ROWS);
  });

  it("sorts oldest first, keeps one per day, and caps the list", () => {
    const stored = [
      toStored(snap("2026-03-01", 3, 0)),
      toStored(snap("2026-01-01", 1, 0)),
      toStored(snap("2026-03-01", 30, 0)),
    ];
    const list = sanitizeSnapshots(stored);
    expect(list.map((s) => [s.date, s.assets])).toEqual([
      ["2026-01-01", 1],
      ["2026-03-01", 30],
    ]);

    const many = Array.from({ length: 40 }, (_, i) =>
      toStored(snap(`2026-01-${String(i + 1).padStart(2, "0")}`, i, 0)),
    ).filter((s) => isIsoDate(s.d));
    const capped = sanitizeSnapshots(many);
    expect(capped).toHaveLength(MAX_SNAPSHOTS);
    expect(capped.at(-1)!.date).toBe("2026-01-31");
  });
});

describe("withSnapshot", () => {
  it("replaces a snapshot from the same day instead of adding a second", () => {
    const list = [snap("2026-08-01", 100, 0), snap("2026-09-30", 200, 0)];
    const next = withSnapshot(list, snap("2026-09-30", 250, 0));
    expect(next.map((s) => s.assets)).toEqual([100, 250]);
  });

  it("keeps the list in date order and drops the oldest past the cap", () => {
    let list: Snapshot[] = [];
    for (let m = 1; m <= 30; m++) {
      const date = `${2024 + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12) + 1).padStart(2, "0")}-15`;
      list = withSnapshot(list, snap(date, m, 0));
    }
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0]!.assets).toBe(7);
    expect(list.at(-1)!.assets).toBe(30);
    // Saving an older date lands in order, and the oldest falls off.
    const back = withSnapshot(list, snap("2024-12-31", 99, 0));
    expect(back.map((s) => s.date)).toEqual([...back.map((s) => s.date)].sort());
  });
});

describe("baselineSnapshot", () => {
  const list = [
    snap("2026-06-01", 100, 0),
    snap("2026-07-01", 200, 0, "EUR"),
    snap("2026-08-01", 300, 0),
    snap("2026-09-30", 400, 0),
  ];

  it("is the newest snapshot before today, skipping today's own", () => {
    expect(baselineSnapshot(list, "2026-09-30", "USD")!.date).toBe("2026-08-01");
    expect(baselineSnapshot(list, "2026-10-15", "USD")!.date).toBe("2026-09-30");
  });

  it("only compares like with like currency", () => {
    expect(baselineSnapshot(list, "2026-09-30", "EUR")!.date).toBe("2026-07-01");
    expect(baselineSnapshot(list, "2026-09-30", "INR")).toBeNull();
  });

  it("is null with nothing earlier", () => {
    expect(baselineSnapshot([], "2026-09-30", "USD")).toBeNull();
    expect(baselineSnapshot([snap("2026-09-30", 1, 0)], "2026-09-30", "USD")).toBeNull();
  });
});

describe("changeBetween", () => {
  it("is the difference, and a percentage of the earlier figure", () => {
    expect(changeBetween(150_000, 161_500)).toEqual({ amount: 11_500, percent: (11_500 / 150_000) * 100 });
    expect(changeBetween(200, 150)).toEqual({ amount: -50, percent: -25 });
  });

  it("reads a shrinking negative net worth as a rise", () => {
    expect(changeBetween(-10_000, -5_000)).toEqual({ amount: 5_000, percent: 50 });
  });

  it("has no percentage from zero", () => {
    expect(changeBetween(0, 500)).toEqual({ amount: 500, percent: null });
  });
});
