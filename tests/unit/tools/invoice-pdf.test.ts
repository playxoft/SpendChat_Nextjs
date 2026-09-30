import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { renderDocPdf, unsupportedCharacters, wrapText, type DocView } from "@/lib/tools/invoice-pdf";

const font = (weight: string) =>
  new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public/fonts/pdf", `NotoSans-${weight}.ttf`)));
const fonts = { regular: font("Regular"), bold: font("Bold") };

function view(overrides: Partial<DocView> = {}): DocView {
  return {
    title: "Invoice",
    fileName: "INV-0007.pdf",
    logo: null,
    seller: { name: "Acme Studio", lines: ["12 Park Street", "Kolkata 700016", "billing@acme.test", "Tax ID: 19ABCDE1234F1Z5"] },
    meta: [
      { label: "Invoice no.", value: "INV-0007" },
      { label: "Issue date", value: "28 September 2026" },
      { label: "Due date", value: "28 October 2026" },
    ],
    clientLabel: "Bill to",
    client: { name: "Priya & Co.", lines: ["4 Hill Road", "priya@example.test"] },
    items: [{ description: "Website design", qty: "3", unitPrice: "₹12,500.50", amount: "₹37,501.50" }],
    totalRows: [
      { label: "Subtotal", value: "₹37,501.50" },
      { label: "GST (18%)", value: "₹6,750.27" },
    ],
    total: "₹44,251.77",
    amountInWords: "Forty four thousand two hundred fifty one rupees and seventy seven paise",
    notes: "Pay by UPI to acme@okbank.\nThank you!",
    terms: "",
    credit: "Made with SpendChat · spendchat.app",
    ...overrides,
  };
}

async function load(bytes: Uint8Array) {
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  return PDFDocument.load(bytes);
}

describe("renderDocPdf", () => {
  it("draws a one-page A4 invoice, titled after the document", async () => {
    const pdf = await load(await renderDocPdf(view(), fonts));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdf.getTitle()).toBe("INV-0007");
  });

  it("stays small, because the font is subset to the characters used", async () => {
    const bytes = await renderDocPdf(view(), fonts);
    expect(bytes.length).toBeLessThan(80_000);
  });

  it("flows a long item list onto more pages", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      description: `Line item ${i + 1} with a description long enough to wrap across the column onto a second line`,
      qty: "1",
      unitPrice: "$10.00",
      amount: "$10.00",
    }));
    const pdf = await load(await renderDocPdf(view({ items }), fonts));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("draws an empty document without throwing", async () => {
    const empty = view({
      seller: { name: "", lines: [] },
      client: { name: "", lines: [] },
      items: [],
      totalRows: [],
      total: "₹0.00",
      amountInWords: null,
      notes: "",
      credit: null,
    });
    expect((await load(await renderDocPdf(empty, fonts))).getPageCount()).toBe(1);
  });

  it("embeds a PNG logo", async () => {
    // A 1×1 transparent PNG.
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
      (c) => c.charCodeAt(0),
    );
    const pdf = await load(await renderDocPdf(view(), fonts, { bytes: png, kind: "png" }));
    expect(pdf.getPageCount()).toBe(1);
  });
});

describe("unsupportedCharacters", () => {
  it("accepts Latin, Greek, Cyrillic and every currency symbol we format", () => {
    const v = view({ client: { name: "Ελένη · Дмитрий · José Müller", lines: ["€ £ ¥ ₹ ₦ ₩ ₽ ₺ ₫ ₪ ₱ — −"] } });
    expect(unsupportedCharacters(v, fonts.regular)).toEqual([]);
  });

  it("lists characters the embedded font can't draw, once each", () => {
    const v = view({ client: { name: "राम ट्रेडर्स", lines: ["東京 東京"] } });
    const missing = unsupportedCharacters(v, fonts.regular);
    expect(missing).toContain("र");
    expect(missing).toContain("東");
    expect(missing.filter((c) => c === "東")).toHaveLength(1);
  });
});

describe("wrapText", () => {
  it("wraps at the width, keeps line breaks, and breaks an over-long word", async () => {
    const pdf = await PDFDocument.create();
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("one two three four five\nsix", helvetica, 10, 60);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.at(-1)).toBe("six");
    for (const line of wrapText("a".repeat(80), helvetica, 10, 60)) {
      expect(helvetica.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(60);
    }
  });
});
