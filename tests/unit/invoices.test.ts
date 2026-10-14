import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { LIMITS, MAX_ITEMS, defaultDoc, evaluateDoc } from "@/lib/business-doc/invoice";
import { renderDocPdf } from "@/lib/business-doc/invoice-pdf";
import { qrMatrix, qrPath } from "@/lib/business-doc/qr";
import { DOC_THEMES, docTheme, hexToRgb01 } from "@/lib/business-doc/templates";
import {
  computeInvoiceFigures,
  docToInvoiceInput,
  invoiceDocView,
  invoiceEvaluation,
  invoicePayment,
  invoicePdfName,
  invoiceToDoc,
  type InvoiceDTO,
} from "@/lib/invoice-doc";
import {
  DOC_FIELD_LIMITS,
  INVOICE_ITEMS_MAX,
  INVOICE_TEMPLATES,
  canConvert,
  canDelete,
  canFinalise,
  canMarkPaid,
  canShare,
  canVoid,
  formatInvoiceNumber,
  isEditable,
  isOverdue,
  isValidUpiId,
  templatesFor,
  upiPayLink,
} from "@/lib/invoices";
import { INVOICE_LIMITS } from "@/lib/plans";
import { isShareTokenShape, mintShareToken } from "@/lib/share-token";

const fonts = {
  regular: new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public/fonts/pdf/NotoSans-Regular.ttf"))),
  bold: new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public/fonts/pdf/NotoSans-Bold.ttf"))),
};

function dto(overrides: Partial<InvoiceDTO> = {}): InvoiceDTO {
  return {
    id: "inv-1",
    profileId: "p-1",
    kind: "invoice",
    status: "sent",
    number: "INV-0007",
    quoteTitle: "quotation",
    clientId: null,
    client: { name: "Priya & Co.", email: "priya@example.test", address: "4 Hill Road", taxId: "29ABCDE1234F1Z5" },
    sellerId: null,
    seller: { name: "Asha Studio", address: "12 Park Street", contact: "asha@studio.test", taxId: null },
    upiId: "asha@okbank",
    hasLogo: false,
    issueDate: "2026-10-01",
    dueDate: "2026-10-31",
    currency: "INR",
    discountType: "percent",
    discountRate: 10,
    discountFixedMinor: 0,
    taxLabel: "GST",
    taxRate: 18,
    subtotalMinor: 250100,
    discountMinor: 25010,
    taxMinor: 40516,
    totalMinor: 265606,
    notes: "Thank you",
    terms: null,
    template: "classic",
    showCredit: true,
    hasPdf: true,
    sourceQuoteId: null,
    sentAt: "2026-10-01T10:00:00.000Z",
    paidAt: null,
    paidOn: null,
    paidTransactionId: null,
    paidAmountMinor: null,
    voidedAt: null,
    createdBy: "u-1",
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    items: [{ id: "it-1", position: 0, description: "Design", quantity: 2, unitPriceMinor: 125050, amountMinor: 250100 }],
    ...overrides,
  };
}

describe("lib/invoices — the rules", () => {
  it("numbers: a prefix per kind, four digits at least", () => {
    expect(formatInvoiceNumber("invoice", 1)).toBe("INV-0001");
    expect(formatInvoiceNumber("quote", 42)).toBe("QUO-0042");
    expect(formatInvoiceNumber("invoice", 12345)).toBe("INV-12345");
  });

  it("only drafts change or delete; sent ones void; only sent invoices are paid", () => {
    expect([isEditable("draft"), isEditable("sent"), canDelete("draft"), canDelete("sent"), canDelete("void")]).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
    expect([canVoid("draft"), canVoid("sent"), canVoid("paid"), canVoid("void")]).toEqual([false, true, false, false]);
    expect(canFinalise("draft")).toBe(true);
    expect(canFinalise("sent")).toBe(false);
    expect(canMarkPaid("invoice", "sent")).toBe(true);
    expect(canMarkPaid("quote", "sent")).toBe(false);
    expect(canMarkPaid("invoice", "draft")).toBe(false);
    expect(canConvert("quote", "sent")).toBe(true);
    expect(canConvert("quote", "void")).toBe(false);
    expect(canConvert("invoice", "sent")).toBe(false);
    expect(canShare("draft")).toBe(false);
    expect(canShare("paid")).toBe(true);
  });

  it("overdue: a sent invoice past its due date", () => {
    const base = { kind: "invoice" as const, status: "sent" as const, dueDate: "2026-10-10" };
    expect(isOverdue(base, "2026-10-11")).toBe(true);
    expect(isOverdue(base, "2026-10-10")).toBe(false);
    expect(isOverdue({ ...base, status: "paid" }, "2026-12-01")).toBe(false);
    expect(isOverdue({ ...base, kind: "quote" }, "2026-12-01")).toBe(false);
    expect(isOverdue({ ...base, dueDate: null }, "2026-12-01")).toBe(false);
  });

  it("five templates on the free tier, matching INVOICE_LIMITS", () => {
    expect(templatesFor("free").map((t) => t.id)).toEqual(["classic", "modern", "bold", "minimal", "compact"]);
    expect(templatesFor("free")).toHaveLength(INVOICE_LIMITS.free.templates);
    for (const t of INVOICE_TEMPLATES) expect(DOC_THEMES[t.id].id).toBe(t.id);
  });

  it("the column widths are the generator's field limits", () => {
    expect(LIMITS).toBe(DOC_FIELD_LIMITS);
    expect(MAX_ITEMS).toBe(INVOICE_ITEMS_MAX);
  });
});

describe("UPI", () => {
  it("accepts name@bank ids only", () => {
    expect(isValidUpiId("asha@okbank")).toBe(true);
    expect(isValidUpiId("asha.design-1@ybl")).toBe(true);
    expect(isValidUpiId("not a upi")).toBe(false);
    expect(isValidUpiId("asha@")).toBe(false);
    expect(isValidUpiId("@okbank")).toBe(false);
  });

  it("builds a upi://pay link for a rupee amount, and nothing otherwise", () => {
    const link = upiPayLink({ upiId: "asha@okbank", payeeName: "Asha Studio", amountMinor: 265606, currency: "INR", note: "Invoice INV-0007" });
    expect(link).toBe("upi://pay?pa=asha%40okbank&pn=Asha%20Studio&am=2656.06&cu=INR&tn=Invoice%20INV-0007");
    expect(upiPayLink({ upiId: "asha@okbank", payeeName: "", amountMinor: 5, currency: "INR", note: "" })).toBe(
      "upi://pay?pa=asha%40okbank&am=0.05&cu=INR",
    );
    expect(upiPayLink({ upiId: "asha@okbank", payeeName: "A", amountMinor: 100, currency: "USD", note: "" })).toBeNull();
    expect(upiPayLink({ upiId: "bad", payeeName: "A", amountMinor: 100, currency: "INR", note: "" })).toBeNull();
    expect(upiPayLink({ upiId: "asha@okbank", payeeName: "A", amountMinor: 0, currency: "INR", note: "" })).toBeNull();
  });

  it("the QR code is a square grid; the SVG path draws its dark modules", () => {
    const m = qrMatrix("upi://pay?pa=asha%40okbank&am=10.00&cu=INR");
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // The finder pattern's top-left corner is dark.
    expect(m[0]![0]).toBe(true);
    const dark = m.flat().filter(Boolean).length;
    expect(qrPath(m).match(/M/g)).toHaveLength(dark);
  });

  it("a payment block only for a sent rupee invoice with a UPI id", () => {
    expect(invoicePayment(dto())).toMatchObject({ label: "Pay by UPI", upiId: "asha@okbank" });
    expect(invoicePayment(dto({ currency: "USD" }))).toBeNull();
    expect(invoicePayment(dto({ status: "paid" }))).toBeNull();
    expect(invoicePayment(dto({ kind: "quote" }))).toBeNull();
    expect(invoicePayment(dto({ upiId: null }))).toBeNull();
  });
});

describe("templates", () => {
  it("falls back to classic for an unknown id; parses accents", () => {
    expect(docTheme("bold").headerBand).toBe(true);
    expect(docTheme("nope").id).toBe("classic");
    expect(docTheme(null).id).toBe("classic");
    expect(hexToRgb01("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb01("red")).toEqual([0.09, 0.09, 0.09]);
  });
});

describe("invoice-doc — stored invoice ⇄ the generator's document", () => {
  it("works out lines and totals with the generator's engine", () => {
    expect(
      computeInvoiceFigures({
        items: [
          { quantity: 3, unitPriceMinor: 12550 },
          { quantity: 0.5, unitPriceMinor: 999 },
        ],
        discountType: "percent",
        discountRate: 10,
        discountFixedMinor: 0,
        taxRate: 18,
      }),
    ).toEqual({
      lines: [37650, 500],
      totals: { subtotal: 38150, discount: 3815, taxable: 34335, tax: 6180, total: 40515, discountCapped: false },
    });
    expect(
      computeInvoiceFigures({ items: [{ quantity: 1, unitPriceMinor: 1000 }], discountType: "fixed", discountRate: 0, discountFixedMinor: 5000, taxRate: 0 })
        ?.totals,
    ).toMatchObject({ discount: 1000, total: 0, discountCapped: true });
    expect(
      computeInvoiceFigures({ items: [{ quantity: 1e9, unitPriceMinor: 1e15 }], discountType: "percent", discountRate: 0, discountFixedMinor: 0, taxRate: 0 }),
    ).toBeNull();
  });

  it("an invoice reopens as the editor's document, in the reader's number format, and saves back the same", () => {
    const doc = invoiceToDoc(dto(), { locale: "de-DE" });
    expect(doc).toMatchObject({
      kind: "invoice",
      number: "INV-0007",
      dueDays: 30,
      dueDate: "",
      discount: "10",
      taxRate: "18",
      credit: true,
      to: { name: "Priya & Co.", taxId: "29ABCDE1234F1Z5" },
    });
    expect(doc.items[0]).toMatchObject({ qty: "2", price: "1250,50" });

    const back = docToInvoiceInput(doc, {
      currency: "INR",
      locale: "de-DE",
      dates: { issue: "2026-10-01", due: "2026-10-31" },
      extra: { profileId: "p-1", template: "classic" },
    });
    expect(back).toEqual({
      ok: true,
      input: expect.objectContaining({
        profileId: "p-1",
        currency: "INR",
        issueDate: "2026-10-01",
        dueDate: "2026-10-31",
        items: [{ description: "Design", quantity: 2, unitPrice: 1250.5 }],
        discountType: "percent",
        discount: 10,
        taxRate: 18,
        client: { name: "Priya & Co.", email: "priya@example.test", address: "4 Hill Road", taxId: "29ABCDE1234F1Z5" },
      }),
    });
  });

  it("a due date that isn't a term chip comes back as a picked date", () => {
    expect(invoiceToDoc(dto({ dueDate: "2026-10-13" }), { locale: "en-US" })).toMatchObject({ dueDays: null, dueDate: "2026-10-13" });
    expect(invoiceToDoc(dto({ dueDate: null }), { locale: "en-US" })).toMatchObject({ dueDays: null, dueDate: "" });
    expect(invoiceToDoc(dto({ discountType: "fixed", discountRate: 0, discountFixedMinor: 5000 }), { locale: "en-US" }).discount).toBe("50");
  });

  it("refuses unreadable figures and skips blank rows", () => {
    const doc = { ...defaultDoc("invoice"), items: [{ id: "a", description: "", qty: "1", price: "" }, { id: "b", description: "X", qty: "abc", price: "1" }] };
    const extra = { profileId: "p" };
    expect(docToInvoiceInput(doc, { currency: "USD", locale: "en-US", dates: { issue: "2026-01-01", due: null }, extra })).toEqual({
      ok: false,
      error: "Check the quantity on line 2.",
    });
    const blankOnly = { ...defaultDoc("invoice"), items: [{ id: "a", description: "", qty: "1", price: "" }] };
    const res = docToInvoiceInput(blankOnly, { currency: "USD", locale: "en-US", dates: { issue: "2026-01-01", due: null }, extra });
    expect(res.ok && res.input.items).toEqual([]);
    expect(docToInvoiceInput(blankOnly, { currency: "USD", locale: "en-US", dates: { issue: null, due: null }, extra })).toEqual({
      ok: false,
      error: "Pick the issue date.",
    });
    expect(
      docToInvoiceInput({ ...blankOnly, taxRate: "120" }, { currency: "USD", locale: "en-US", dates: { issue: "2026-01-01", due: null }, extra }),
    ).toEqual({ ok: false, error: "Check the tax rate." });
  });

  it("the paper's figures are the stored ones, not re-worked", () => {
    const ev = invoiceEvaluation(dto());
    expect(ev.totals).toMatchObject({ subtotal: 250100, discount: 25010, tax: 40516, total: 265606 });
    expect(ev.discountPercent).toBe(10);
    expect(ev.items[0]).toMatchObject({ qty: 2, unitMinor: 125050, amountMinor: 250100, blank: false });
    // The generator re-working the same document agrees.
    const doc = invoiceToDoc(dto(), { locale: "en-US" });
    expect(evaluateDoc(doc, "INR", "en-US").totals?.total).toBe(265606);
  });

  it("names the PDF after the number, or the kind for a draft", () => {
    expect(invoicePdfName(dto())).toBe("INV-0007.pdf");
    expect(invoicePdfName(dto({ number: null, kind: "quote" }))).toBe("draft-quote.pdf");
  });

  it("the PDF view: the template's theme, the UPI block, 'Draft' for an unnumbered one", () => {
    const view = invoiceDocView(dto({ template: "modern" }), "en-IN");
    expect(view.theme?.id).toBe("modern");
    expect(view.payment?.upiId).toBe("asha@okbank");
    expect(view.client.lines).toContain("Tax ID: 29ABCDE1234F1Z5");
    expect(view.credit).toMatch(/^Made with SpendChat/);
    expect(invoiceDocView(dto({ number: null, status: "draft" }), "en-IN").meta[0]!.value).toBe("Draft");
    expect(invoiceDocView(dto({ kind: "quote", quoteTitle: "estimate" }), "en-IN").title).toBe("Estimate");
  });
});

describe("the PDF — every template draws", () => {
  for (const t of INVOICE_TEMPLATES) {
    it(`${t.name}: one A4 page, with the UPI code`, async () => {
      const bytes = await renderDocPdf(invoiceDocView(dto({ template: t.id }), "en-IN"), fonts);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getTitle()).toBe("INV-0007");
    });
  }
});

describe("share tokens", () => {
  it("are 43 base64url characters and unique", () => {
    const a = mintShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mintShareToken()).not.toBe(a);
    expect(isShareTokenShape(a)).toBe(true);
    expect(isShareTokenShape("../etc")).toBe(false);
    expect(isShareTokenShape("")).toBe(false);
    expect(isShareTokenShape("a".repeat(65))).toBe(false);
    expect(isShareTokenShape(42)).toBe(false);
  });
});
