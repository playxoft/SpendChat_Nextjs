import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS,
  MAX_LOGO_DATA_URL,
  MAX_MINOR,
  calculateTotals,
  defaultDoc,
  docFileName,
  dueBeforeIssue,
  evaluateDoc,
  exportDoc,
  hasContent,
  lineAmountMinor,
  nextDocNumber,
  parseDocFile,
  percentOfMinor,
  quotationToInvoice,
  resolveDocDates,
  sanitizeDoc,
  startNextDoc,
  type BusinessDoc,
} from "@/lib/tools/invoice";

function doc(patch: Partial<BusinessDoc> = {}): BusinessDoc {
  return { ...defaultDoc("invoice"), ...patch };
}

const items = (...rows: [string, string][]) =>
  rows.map(([qty, price], i) => ({ id: `r${i}`, description: `Item ${i + 1}`, qty, price }));

describe("lineAmountMinor", () => {
  it("multiplies quantity by the unit price in minor units", () => {
    expect(lineAmountMinor(3, 1999)).toBe(5997);
    expect(lineAmountMinor(0, 1999)).toBe(0);
  });

  it("handles fractional quantities with commercial rounding", () => {
    expect(lineAmountMinor(7.5, 4550)).toBe(34125); // 7.5 h × 45.50
    expect(lineAmountMinor(0.3333, 100)).toBe(33); // 33.33 → 33
    expect(lineAmountMinor(0.125, 4)).toBe(1); // 0.5 → 1, halves round up
  });

  it("rejects negatives and amounts past the exact range", () => {
    expect(lineAmountMinor(-1, 100)).toBeNull();
    expect(lineAmountMinor(1, -100)).toBeNull();
    expect(lineAmountMinor(1, 1.5)).toBeNull();
    expect(lineAmountMinor(1_000_000_000, MAX_MINOR)).toBeNull();
    expect(lineAmountMinor(Number.NaN, 100)).toBeNull();
  });
});

describe("percentOfMinor", () => {
  it("rounds half away from zero, exactly", () => {
    expect(percentOfMinor(5997, 10)).toBe(600); // 599.7
    expect(percentOfMinor(5397, 18)).toBe(971); // 971.46
    expect(percentOfMinor(1005, 5.5)).toBe(55); // 55.275 → 55
    expect(percentOfMinor(1010, 5.5)).toBe(56); // 55.55 → 56
    expect(percentOfMinor(50, 1)).toBe(1); // 0.5 → 1
  });

  it("rejects rates outside 0–100", () => {
    expect(percentOfMinor(100, -1)).toBeNull();
    expect(percentOfMinor(100, 101)).toBeNull();
  });
});

describe("calculateTotals", () => {
  it("takes the discount before tax (3 × 19.99, 10% off, 18% tax)", () => {
    expect(
      calculateTotals({ lines: [5997], discount: { type: "percent", value: 10 }, taxRate: 18 }),
    ).toEqual({ subtotal: 5997, discount: 600, taxable: 5397, tax: 971, total: 6368, discountCapped: false });
  });

  it("applies a fixed discount and caps it at the subtotal", () => {
    expect(calculateTotals({ lines: [10000, 2500], discount: { type: "fixed", value: 500 }, taxRate: 20 })).toEqual({
      subtotal: 12500,
      discount: 500,
      taxable: 12000,
      tax: 2400,
      total: 14400,
      discountCapped: false,
    });
    const capped = calculateTotals({ lines: [1000], discount: { type: "fixed", value: 5000 }, taxRate: 10 });
    expect(capped).toMatchObject({ discount: 1000, taxable: 0, tax: 0, total: 0, discountCapped: true });
  });

  it("is zero for an empty document", () => {
    expect(calculateTotals({ lines: [], discount: { type: "percent", value: 0 }, taxRate: 0 })).toMatchObject({
      subtotal: 0,
      total: 0,
    });
  });

  it("gives up rather than lose precision on enormous totals", () => {
    expect(
      calculateTotals({ lines: [MAX_MINOR, 1], discount: { type: "percent", value: 0 }, taxRate: 0 }),
    ).toBeNull();
    expect(
      calculateTotals({ lines: [MAX_MINOR], discount: { type: "percent", value: 0 }, taxRate: 10 }),
    ).toBeNull();
  });
});

describe("evaluateDoc", () => {
  it("totals a typed invoice in minor units", () => {
    const d = doc({ items: items(["3", "19.99"]), discount: "10", taxRate: "18" });
    const e = evaluateDoc(d, "USD");
    expect(e.items[0]).toMatchObject({ unitMinor: 1999, amountMinor: 5997, qtyError: null, priceError: null });
    expect(e.discountPercent).toBe(10);
    expect(e.totals).toMatchObject({ subtotal: 5997, discount: 600, tax: 971, total: 6368 });
  });

  it("uses whole units for zero-decimal currencies (JPY)", () => {
    const d = doc({ items: items(["3", "1999"], ["1", "500"]), discount: "10", taxRate: "10" });
    const e = evaluateDoc(d, "JPY");
    // 6497 − 650 (649.7) = 5847; tax 584.7 → 585
    expect(e.totals).toMatchObject({ subtotal: 6497, discount: 650, taxable: 5847, tax: 585, total: 6432 });
  });

  it("uses thousandths for three-decimal currencies (KWD)", () => {
    const d = doc({ items: items(["2", "12.345"]), taxRate: "5" });
    const e = evaluateDoc(d, "KWD");
    // 24.690 → tax 1.2345 → 1.235
    expect(e.totals).toMatchObject({ subtotal: 24690, tax: 1235, total: 25925 });
  });

  it("reads a fixed discount in the currency's minor units", () => {
    const d = doc({ items: items(["1", "100"]), discountType: "fixed", discount: "12.50", taxRate: "20" });
    expect(evaluateDoc(d, "GBP").totals).toMatchObject({ discount: 1250, taxable: 8750, tax: 1750, total: 10500 });
  });

  it("reads the visitor's number format", () => {
    const d = doc({ items: items(["1", "1.234,50"]) });
    expect(evaluateDoc(d, "EUR", "de-DE").totals?.total).toBe(123450);
    const inr = doc({ items: items(["2", "1,00,000"]) });
    expect(evaluateDoc(inr, "INR", "en-IN").totals?.total).toBe(20000000);
  });

  it("flags bad rows and leaves them out of the totals", () => {
    const d = doc({ items: items(["abc", "10"], ["1", "-5"], ["2", "5"]) });
    const e = evaluateDoc(d, "USD");
    expect(e.items[0]!.qtyError).toBe("Enter a number.");
    expect(e.items[1]!.priceError).toBe("Can't be negative.");
    expect(e.items[0]!.amountMinor).toBeNull();
    expect(e.totals?.total).toBe(1000);
  });

  it("treats blank fields as zero and marks empty rows blank", () => {
    const d = doc({ items: [{ id: "a", description: "", qty: "1", price: "" }] });
    const e = evaluateDoc(d, "USD");
    expect(e.items[0]).toMatchObject({ blank: true, amountMinor: 0, priceError: null });
    expect(e.totals?.total).toBe(0);
  });

  it("explains out-of-range rates and a discount bigger than the bill", () => {
    expect(evaluateDoc(doc({ discount: "150" }), "USD").discountError).toMatch(/100%/);
    expect(evaluateDoc(doc({ taxRate: "120" }), "USD").taxError).toMatch(/100%/);
    const over = doc({ items: items(["1", "10"]), discountType: "fixed", discount: "50" });
    expect(evaluateDoc(over, "USD").discountError).toMatch(/more than the subtotal/);
  });

  it("falls back to USD for an unknown currency instead of throwing", () => {
    expect(evaluateDoc(doc({ items: items(["1", "1.5"]) }), "XXX").totals?.total).toBe(150);
  });
});

describe("resolveDocDates", () => {
  it("uses today for a blank issue date, and counts terms from it", () => {
    expect(resolveDocDates({ issueDate: "", dueDays: 30, dueDate: "" }, "2026-09-28")).toEqual({
      issue: "2026-09-28",
      due: "2026-10-28",
    });
  });

  it("waits for today on the server", () => {
    expect(resolveDocDates({ issueDate: "", dueDays: 30, dueDate: "" }, null)).toEqual({ issue: null, due: null });
  });

  it("keeps a pinned issue date and a hand-picked due date", () => {
    expect(resolveDocDates({ issueDate: "2026-01-31", dueDays: 0, dueDate: "" }, "2026-09-28")).toEqual({
      issue: "2026-01-31",
      due: "2026-01-31",
    });
    expect(resolveDocDates({ issueDate: "2026-01-31", dueDays: null, dueDate: "2026-02-15" }, null).due).toBe(
      "2026-02-15",
    );
  });

  it("spots a due date before the issue date", () => {
    expect(dueBeforeIssue("2026-02-01", "2026-01-31")).toBe(true);
    expect(dueBeforeIssue("2026-02-01", "2026-02-01")).toBe(false);
    expect(dueBeforeIssue(null, "2026-02-01")).toBe(false);
  });
});

describe("nextDocNumber", () => {
  it("increments and keeps the zero padding", () => {
    expect(nextDocNumber("INV-0007", "invoice")).toBe("INV-0008");
    expect(nextDocNumber("INV-0099", "invoice")).toBe("INV-0100");
    expect(nextDocNumber("INV-9999", "invoice")).toBe("INV-10000");
    expect(nextDocNumber("2024-17", "invoice")).toBe("2024-18");
    expect(nextDocNumber("7", "invoice")).toBe("8");
  });

  it("only touches the trailing digits", () => {
    expect(nextDocNumber("2024/INV/009", "invoice")).toBe("2024/INV/010");
    expect(nextDocNumber("Q3-2026-01", "quotation")).toBe("Q3-2026-02");
  });

  it("appends a counter when there are no trailing digits", () => {
    expect(nextDocNumber("ACME", "invoice")).toBe("ACME-2");
    expect(nextDocNumber("INV-007A", "invoice")).toBe("INV-007A-2");
    expect(nextDocNumber("INV-", "invoice")).toBe("INV-2");
  });

  it("starts a blank number from the kind's default", () => {
    expect(nextDocNumber("  ", "invoice")).toBe("INV-0001");
    expect(nextDocNumber("", "quotation")).toBe("QUO-0001");
  });

  it("doesn't lose precision on very long numbers", () => {
    expect(nextDocNumber("N-99999999999999999999", "invoice")).toBe("N-100000000000000000000");
  });
});

describe("startNextDoc / quotationToInvoice", () => {
  const filled = doc({
    number: "INV-0041",
    issueDate: "2026-09-01",
    from: { name: "Studio Nine", address: "1 Road", contact: "hi@studio.test", taxId: "GB123" },
    to: { name: "Client Co", address: "2 Street", email: "a@client.test" },
    items: items(["2", "300"]),
    discount: "5",
    taxLabel: "VAT",
    taxRate: "20",
    notes: "Bank: 12-34-56",
    logo: "data:image/png;base64,AAAA",
  });

  it("keeps the seller and tax, clears the client and items, bumps the number", () => {
    const next = startNextDoc(filled);
    expect(next.number).toBe("INV-0042");
    expect(next.from).toEqual(filled.from);
    expect(next.logo).toBe(filled.logo);
    expect(next.notes).toBe(filled.notes);
    expect(next).toMatchObject({ taxLabel: "VAT", taxRate: "20", discount: "", issueDate: "" });
    expect(next.to).toEqual({ name: "", address: "", email: "" });
    expect(next.items).toHaveLength(1);
    expect(hasContent(next)).toBe(false);
    expect(hasContent(filled)).toBe(true);
  });

  it("turns a quotation into a dated-today invoice without its terms", () => {
    const quote: BusinessDoc = { ...filled, kind: "quotation", number: "QUO-0003", terms: "Valid 30 days" };
    const inv = quotationToInvoice(quote, "INV-0042", 15);
    expect(inv).toMatchObject({ kind: "invoice", number: "INV-0042", issueDate: "", dueDays: 15, terms: "" });
    expect(inv.items).toEqual(quote.items);
    expect(inv.items).not.toBe(quote.items);
    expect(inv.to).toEqual(quote.to);
  });
});

describe("sanitizeDoc", () => {
  it("rejects non-objects", () => {
    expect(sanitizeDoc(null, "invoice")).toBeNull();
    expect(sanitizeDoc("x", "invoice")).toBeNull();
    expect(sanitizeDoc([1, 2], "invoice")).toBeNull();
  });

  it("fills a partial draft with defaults and forces the page's kind", () => {
    const d = sanitizeDoc({ kind: "quotation", number: "A-1" }, "invoice")!;
    expect(d.kind).toBe("invoice");
    expect(d.number).toBe("A-1");
    expect(d.items).toHaveLength(1);
    expect(d.credit).toBe(true);
    expect(d.dueDays).toBe(30);
  });

  it("re-types, caps and cleans every field", () => {
    const d = sanitizeDoc(
      {
        number: 42,
        issueDate: "2026-02-30",
        dueDays: 99999,
        from: { name: "x".repeat(500), address: ["not text"] },
        to: "nope",
        items: [
          { id: "dup", description: "A", qty: 2, price: "10" },
          { id: "dup", description: "B", qty: "1", price: 5 },
          "junk",
          { id: "<script>", description: "C\u0000D" },
        ],
        discountType: "bogus",
        credit: false,
        logo: "data:text/html;base64,PHNjcmlwdD4=",
      },
      "invoice",
    )!;
    expect(d.number).toBe("INV-0001");
    expect(d.issueDate).toBe("");
    expect(d.dueDays).toBe(30);
    expect(d.from.name).toHaveLength(120);
    expect(d.from.address).toBe("");
    expect(d.to).toEqual({ name: "", address: "", email: "" });
    expect(d.items).toHaveLength(3);
    expect(d.items[0]).toMatchObject({ id: "dup", qty: "2", price: "10" });
    expect(d.items[1]!.id).not.toBe("dup");
    expect(d.items[1]!.price).toBe("5");
    expect(d.items[2]!.id).not.toBe("<script>");
    expect(d.items[2]!.description).toBe("CD");
    expect(d.discountType).toBe("percent");
    expect(d.credit).toBe(false);
    expect(d.logo).toBeNull();
  });

  it("caps the item list and never leaves it empty", () => {
    const many = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => ({ id: `r${i}`, description: "x" }));
    expect(sanitizeDoc({ items: many }, "invoice")!.items).toHaveLength(MAX_ITEMS);
    expect(sanitizeDoc({ items: [] }, "invoice")!.items).toHaveLength(1);
  });

  it("keeps a hand-picked due date, and falls back to terms when it's invalid", () => {
    expect(sanitizeDoc({ dueDays: null, dueDate: "2026-10-01" }, "invoice")).toMatchObject({
      dueDays: null,
      dueDate: "2026-10-01",
    });
    expect(sanitizeDoc({ dueDays: null, dueDate: "soon" }, "invoice")).toMatchObject({ dueDays: 30, dueDate: "" });
    expect(sanitizeDoc({ dueDays: 0 }, "invoice")!.dueDays).toBe(0);
  });

  it("accepts small image logos only", () => {
    expect(sanitizeDoc({ logo: "data:image/png;base64,iVBORw0KGgo=" }, "invoice")!.logo).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(sanitizeDoc({ logo: "https://evil.test/x.png" }, "invoice")!.logo).toBeNull();
    const huge = `data:image/png;base64,${"A".repeat(MAX_LOGO_DATA_URL)}`;
    expect(sanitizeDoc({ logo: huge }, "invoice")!.logo).toBeNull();
  });
});

describe("export / import", () => {
  const original = doc({ number: "INV-0009", items: items(["1", "50"]), notes: "Thanks!" });

  it("round-trips a document with its currency", () => {
    const parsed = parseDocFile(exportDoc(original, "EUR"), "invoice");
    expect(parsed?.currency).toBe("EUR");
    expect(parsed?.doc).toEqual(original);
  });

  it("imports into the page's kind", () => {
    expect(parseDocFile(exportDoc(original, "USD"), "quotation")?.doc.kind).toBe("quotation");
  });

  it("rejects files that aren't ours", () => {
    expect(parseDocFile("not json", "invoice")).toBeNull();
    expect(parseDocFile(JSON.stringify({ number: "INV-1" }), "invoice")).toBeNull();
    expect(parseDocFile("x".repeat(1_000_001), "invoice")).toBeNull();
  });

  it("drops an unsupported currency", () => {
    const text = exportDoc(original, "ZZZ");
    expect(parseDocFile(text, "invoice")?.currency).toBeNull();
  });

  it("names the file after the document number", () => {
    expect(docFileName(original)).toBe("INV-0009.json");
    expect(docFileName(doc({ number: "2024/17 final" }))).toBe("2024_17_final.json");
    expect(docFileName(doc({ number: "../.." }))).toBe("invoice.json");
  });
});
