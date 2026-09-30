import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CURRENCIES } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { pdfText, renderDocPdf, unsupportedCharacters, wrapText, type DocView } from "@/lib/tools/invoice-pdf";

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

describe("pdfText", () => {
  it("composes accents and drops invisible characters", () => {
    expect(pdfText("Jose\u0301")).toBe("José");
    expect(pdfText("\ufeffAcme\u200b Studio\u00ad")).toBe("Acme Studio");
  });

  it("turns every kind of line break into a newline", () => {
    expect(pdfText("a\r\nb\rc\fd\ve\u2028f")).toBe("a\nb\nc\nd\ne\nf");
  });

  it("writes the currency signs the font lacks another way", () => {
    expect(pdfText("￥1,000")).toBe("¥1,000");
    expect(pdfText("￦5,000")).toBe("₩5,000");
    expect(pdfText("฿1,000.00")).toBe("THB 1,000.00");
    expect(pdfText("1.000,00 ฿")).toBe("1.000,00 THB");
    expect(pdfText("৳500")).toBe("BDT 500");
  });
});

describe("the embedded font covers every currency", () => {
  const LOCALES = ["en-US", "en-IN", "en-GB", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR", "nl-NL", "sv-SE", "pl-PL", "tr-TR", "id-ID", "vi-VN", "ru-RU", "el-GR"];

  it("in Latin, Greek and Cyrillic locales", () => {
    for (const locale of LOCALES) {
      const lines = CURRENCIES.map((c) => formatMoney(123456789, c.code, locale));
      const missing = unsupportedCharacters(view({ client: { name: "", lines } }), fonts.regular);
      expect(missing, locale).toEqual([]);
    }
  });

  it("for yen in Japanese, won in Taiwanese Chinese and baht in Thai formatting", () => {
    const lines = [formatMoney(100000, "JPY", "ja-JP"), formatMoney(100000, "KRW", "zh-TW"), formatMoney(100000, "THB", "th-TH")];
    expect(unsupportedCharacters(view({ client: { name: "", lines } }), fonts.regular)).toEqual([]);
  });
});

describe("long unbroken text", () => {
  it("wraps a 2,000-character word quickly, every line within the column", async () => {
    const pdf = await PDFDocument.create();
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const started = performance.now();
    const lines = wrapText("x".repeat(2000), helvetica, 9.5, 200);
    expect(performance.now() - started).toBeLessThan(500);
    expect(lines.join("")).toBe("x".repeat(2000));
    for (const line of lines) expect(helvetica.widthOfTextAtSize(line, 9.5)).toBeLessThanOrEqual(200);
  });

  it("renders a document with long unbroken notes in reasonable time", async () => {
    const started = performance.now();
    const pdf = await load(await renderDocPdf(view({ notes: "https://example.test/" + "a".repeat(2000) }), fonts));
    expect(performance.now() - started).toBeLessThan(5000);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
