import { describe, expect, it } from "vitest";
import { APPLIANCES, CUSTOM_APPLIANCE, getAppliance } from "@/lib/tools/data/appliances";
import {
  DAYS_PER_MONTH,
  MAX_ROWS,
  applianceCost,
  decodeRows,
  electricityTotals,
  encodeRows,
  rowErrors,
  type ApplianceRow,
} from "@/lib/tools/electricity";

describe("applianceCost", () => {
  it("turns watts and hours into kWh and cost", () => {
    // A 1.5 kW AC for 8 hours: 12 kWh a day, 365 a month, 4,380 a year.
    const c = applianceCost({ watts: 1500, hoursPerDay: 8, quantity: 1 }, 8);
    expect(c.kwhPerHour).toBe(1.5);
    expect(c.kwhPerDay).toBe(12);
    expect(c.kwhPerMonth).toBeCloseTo(365, 10);
    expect(c.kwhPerYear).toBe(4380);
    expect(c.perHour).toBe(12);
    expect(c.perDay).toBe(96);
    expect(c.perMonth).toBeCloseTo(2920, 8);
    expect(c.perYear).toBe(35040);
  });

  it("multiplies by quantity", () => {
    const one = applianceCost({ watts: 75, hoursPerDay: 10, quantity: 1 }, 0.2);
    const three = applianceCost({ watts: 75, hoursPerDay: 10, quantity: 3 }, 0.2);
    expect(three.kwhPerDay).toBeCloseTo(one.kwhPerDay * 3, 12);
    expect(three.perYear).toBeCloseTo(one.perYear * 3, 12);
  });

  it("uses an average month, so a month is a twelfth of the year", () => {
    const c = applianceCost({ watts: 100, hoursPerDay: 24, quantity: 1 }, 0.3);
    expect(DAYS_PER_MONTH).toBeCloseTo(30.4167, 4);
    expect(c.kwhPerMonth * 12).toBeCloseTo(c.kwhPerYear, 10);
    expect(c.perMonth).toBeCloseTo(c.perDay * DAYS_PER_MONTH, 10);
  });

  it("is zero at zero watts, hours, quantity or tariff", () => {
    expect(applianceCost({ watts: 0, hoursPerDay: 5, quantity: 1 }, 0.2).perMonth).toBe(0);
    expect(applianceCost({ watts: 100, hoursPerDay: 0, quantity: 1 }, 0.2).perMonth).toBe(0);
    expect(applianceCost({ watts: 100, hoursPerDay: 5, quantity: 0 }, 0.2).perMonth).toBe(0);
    const free = applianceCost({ watts: 100, hoursPerDay: 5, quantity: 1 }, 0);
    expect(free.perMonth).toBe(0);
    expect(free.kwhPerDay).toBe(0.5);
  });

  it("keeps tiny costs as fractions rather than rounding them away", () => {
    // A 9 W bulb for an hour at 0.15/kWh.
    expect(applianceCost({ watts: 9, hoursPerDay: 1, quantity: 1 }, 0.15).perHour).toBeCloseTo(0.00135, 12);
  });
});

describe("electricityTotals", () => {
  it("adds the rows and names the biggest", () => {
    const t = electricityTotals(
      [
        { watts: 75, hoursPerDay: 24, quantity: 1 }, // 1.8 kWh/day
        { watts: 1500, hoursPerDay: 8, quantity: 1 }, // 12 kWh/day
        { watts: 75, hoursPerDay: 10, quantity: 2 }, // 1.5 kWh/day
      ],
      0.2,
    );
    expect(t.total.kwhPerDay).toBeCloseTo(15.3, 10);
    expect(t.total.perDay).toBeCloseTo(3.06, 10);
    expect(t.total.perYear).toBeCloseTo(15.3 * 365 * 0.2, 8);
    expect(t.total.perMonth).toBeCloseTo(t.rows.reduce((s, r) => s + r.perMonth, 0), 10);
    expect(t.biggest).toBe(1);
  });

  it("still names the biggest user at a zero tariff", () => {
    const t = electricityTotals(
      [
        { watts: 10, hoursPerDay: 1, quantity: 1 },
        { watts: 20, hoursPerDay: 1, quantity: 1 },
      ],
      0,
    );
    expect(t.biggest).toBe(1);
  });

  it("has no biggest when nothing uses power", () => {
    expect(electricityTotals([], 0.2).biggest).toBeNull();
    expect(electricityTotals([{ watts: 0, hoursPerDay: 4, quantity: 1 }], 0.2).biggest).toBeNull();
  });

  it("copes with huge values", () => {
    const t = electricityTotals([{ watts: 1e9, hoursPerDay: 24, quantity: 1000 }], 1e3);
    expect(Number.isFinite(t.total.perYear)).toBe(true);
  });
});

describe("rowErrors", () => {
  it("accepts ordinary values and blanks", () => {
    expect(rowErrors({ watts: 1500, hoursPerDay: 8, quantity: 1 })).toEqual({});
    expect(rowErrors({ watts: null, hoursPerDay: null, quantity: null })).toEqual({});
    expect(rowErrors({ watts: 0, hoursPerDay: 24, quantity: 0 })).toEqual({});
    expect(rowErrors({ watts: 9, hoursPerDay: 0.25, quantity: 5 })).toEqual({});
  });

  it("flags negatives, impossible hours and fractional quantities", () => {
    expect(rowErrors({ watts: -5, hoursPerDay: 1, quantity: 1 }).watts).toBeTruthy();
    expect(rowErrors({ watts: 5, hoursPerDay: 25, quantity: 1 }).hoursPerDay).toBeTruthy();
    expect(rowErrors({ watts: 5, hoursPerDay: -1, quantity: 1 }).hoursPerDay).toBeTruthy();
    expect(rowErrors({ watts: 5, hoursPerDay: 1, quantity: 1.5 }).quantity).toBeTruthy();
    expect(rowErrors({ watts: 5, hoursPerDay: 1, quantity: -1 }).quantity).toBeTruthy();
  });
});

describe("encodeRows / decodeRows", () => {
  const rows: ApplianceRow[] = [
    { id: "fridge", watts: "75", hours: "24", qty: "1" },
    { id: "fan", watts: "75", hours: "10", qty: "2" },
    { id: CUSTOM_APPLIANCE, watts: "1,200", hours: "0.5", qty: "1" },
  ];

  it("round-trips a list", () => {
    const encoded = encodeRows(rows);
    expect(encoded).toBe("fridge~75~24~1|fan~75~10~2|custom~1,200~0.5~1");
    expect(decodeRows(encoded)).toEqual(rows);
  });

  it("keeps half-typed and blank fields", () => {
    const partial: ApplianceRow[] = [{ id: CUSTOM_APPLIANCE, watts: "", hours: "1.", qty: "1" }];
    expect(decodeRows(encodeRows(partial))).toEqual(partial);
  });

  it("reads an empty parameter as an empty list", () => {
    expect(decodeRows("")).toEqual([]);
    expect(encodeRows([])).toBe("");
  });

  it("strips separators typed into a field", () => {
    const encoded = encodeRows([{ id: "tv", watts: "1|0~0", hours: "4", qty: "1" }]);
    expect(decodeRows(encoded)).toEqual([{ id: "tv", watts: "100", hours: "4", qty: "1" }]);
  });

  it("turns unknown ids into custom rows and fills missing fields", () => {
    expect(decodeRows("toaster~800~0.2~1|fan")).toEqual([
      { id: CUSTOM_APPLIANCE, watts: "800", hours: "0.2", qty: "1" },
      { id: "fan", watts: "", hours: "", qty: "" },
    ]);
  });

  it("caps the list and each field's length", () => {
    const long = Array.from({ length: 30 }, () => "led~9~6~1").join("|");
    expect(decodeRows(long)).toHaveLength(MAX_ROWS);
    expect(encodeRows(decodeRows(long)).split("|")).toHaveLength(MAX_ROWS);
    expect(decodeRows(`led~${"9".repeat(50)}~6~1`)[0]!.watts).toHaveLength(12);
  });
});

describe("APPLIANCES", () => {
  it("has unique, link-safe ids and sensible typical values", () => {
    const ids = APPLIANCES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(CUSTOM_APPLIANCE);
    for (const a of APPLIANCES) {
      expect(a.id).toMatch(/^[a-z0-9]+$/);
      expect(a.watts).toBeGreaterThan(0);
      expect(a.hours).toBeGreaterThan(0);
      expect(a.hours).toBeLessThanOrEqual(24);
      expect(getAppliance(a.id)).toBe(a);
    }
    expect(getAppliance("nope")).toBeUndefined();
  });
});
