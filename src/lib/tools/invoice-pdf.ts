import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * The invoice and quotation generators' "Download": a real PDF file, drawn
 * here with vector text — selectable, searchable, crisp at any zoom — rather
 * than a screenshot of the preview.
 *
 * Pure apart from pdf-lib: it takes the document as display strings
 * (`DocView`, built by `buildDocView` from the same figures the on-screen
 * paper shows), the font files and an optional logo, and returns the bytes.
 * The browser side (`business-doc-tool.tsx`) fetches the fonts and imports
 * this module only when someone presses Download.
 *
 * The font is Noto Sans, subset to Latin, Greek, Cyrillic and the currency
 * symbols (`public/fonts/pdf/`, OFL). The few currency signs Noto Sans itself
 * lacks are written another way (`pdfText`). A document using a script it
 * doesn't cover — Devanagari, Arabic, CJK — is caught by
 * `unsupportedCharacters` first, and the page falls back to the browser's
 * print-to-PDF, which has every font.
 */

export type DocView = {
  /** "Invoice", "Quotation", "Estimate". */
  title: string;
  /** "INV-0007.pdf". */
  fileName: string;
  /** A data URL, when the visitor added a logo. */
  logo: string | null;
  seller: { name: string; lines: string[] };
  /** Number, date and due/valid-until rows under the title. */
  meta: { label: string; value: string }[];
  clientLabel: string;
  client: { name: string; lines: string[] };
  items: { description: string; qty: string; unitPrice: string; amount: string }[];
  /** Subtotal, discount and tax rows — only those that apply. */
  totalRows: { label: string; value: string }[];
  /** Null when the amounts are too large to total exactly. */
  total: string | null;
  amountInWords: string | null;
  notes: string;
  terms: string;
  /** The "Made with SpendChat" line, or null when the visitor turned it off. */
  credit: string | null;
};

export type PdfFonts = { regular: Uint8Array; bold: Uint8Array };
export type PdfLogo = { bytes: Uint8Array; kind: "png" | "jpg" };

// A4 in points, with ~17 mm margins.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const LEFT = MARGIN;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = RIGHT - LEFT;
/** Keep clear of the bottom margin for the page number and credit line. */
const BOTTOM = MARGIN + 28;

const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.32, 0.32, 0.32);
const FAINT = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.83, 0.83, 0.83);

const BODY = 9.5;
const LINE = 13.5;

// Table columns, right-aligned figures measured from the right edge.
const AMOUNT_RIGHT = RIGHT;
const UNIT_RIGHT = RIGHT - 100;
const QTY_RIGHT = RIGHT - 200;
const DESC_MAX = QTY_RIGHT - 52 - LEFT;

/**
 * Text as the PDF draws it:
 * - composed (NFC), so "José" typed as e + a combining accent is one glyph;
 * - with invisible formatting characters (zero-width spaces, byte-order
 *   marks, direction marks, soft hyphens) dropped, and every other kind of
 *   line break turned into "\n" — pdf-lib splits lines on them itself, which
 *   drew them on top of each other;
 * - with the currency signs Noto Sans has no glyph for written as the font
 *   can: full-width ￥ and ￦ (Japanese and Chinese locales) as ¥ and ₩, the
 *   baht and taka signs as THB and BDT.
 */
export function pdfText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?|[\f\v\u2028\u2029]/g, "\n")
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "")
    .replace(/\uffe5/g, "¥")
    .replace(/\uffe6/g, "₩")
    .replace(/\u0e3f(?=\s?\d)/g, "THB ")
    .replace(/\u0e3f/g, "THB")
    .replace(/\u09f3(?=\s?\d)/g, "BDT ")
    .replace(/\u09f3/g, "BDT");
}

/** The document with every string passed through `pdfText` (the logo is data, not text). */
export function pdfView(view: DocView): DocView {
  const t = pdfText;
  const block = (b: { name: string; lines: string[] }) => ({ name: t(b.name), lines: b.lines.map(t) });
  const pairs = (rows: { label: string; value: string }[]) => rows.map((r) => ({ label: t(r.label), value: t(r.value) }));
  return {
    ...view,
    title: t(view.title),
    fileName: t(view.fileName),
    seller: block(view.seller),
    meta: pairs(view.meta),
    clientLabel: t(view.clientLabel),
    client: block(view.client),
    items: view.items.map((i) => ({
      description: t(i.description),
      qty: t(i.qty),
      unitPrice: t(i.unitPrice),
      amount: t(i.amount),
    })),
    totalRows: pairs(view.totalRows),
    total: view.total === null ? null : t(view.total),
    amountInWords: view.amountInWords === null ? null : t(view.amountInWords),
    notes: t(view.notes),
    terms: t(view.terms),
    credit: view.credit === null ? null : t(view.credit),
  };
}

/** Every string the PDF will draw, to check the font covers it. */
function allText(view: DocView): string {
  return [
    view.title.toUpperCase(),
    view.seller.name,
    ...view.seller.lines,
    ...view.meta.flatMap((m) => [m.label, m.value]),
    view.clientLabel.toUpperCase(),
    view.client.name,
    ...view.client.lines,
    "DESCRIPTION QTY UNIT PRICE AMOUNT Total Page of Amount in words: NOTES TERMS",
    ...view.items.flatMap((i) => [i.description, i.qty, i.unitPrice, i.amount]),
    ...view.totalRows.flatMap((r) => [r.label, r.value]),
    view.total ?? "",
    view.amountInWords ?? "",
    view.notes,
    view.terms,
    view.credit ?? "",
  ].join("\n");
}

/**
 * Characters in the document the embedded font can't draw (each listed once).
 * Non-empty means: use the browser's print-to-PDF instead, or the PDF would
 * show empty boxes where a client's name should be.
 */
export function unsupportedCharacters(view: DocView, fontBytes: Uint8Array): string[] {
  const font = fontkit.create(fontBytes);
  const missing = new Set<string>();
  for (const ch of allText(pdfView(view))) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20) continue; // newlines and tabs are layout, not glyphs
    if (!font.hasGlyphForCodePoint(cp)) missing.add(ch);
  }
  return [...missing];
}

/** Break text into lines no wider than `maxWidth`, keeping the author's line breaks. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.replace(/\t/g, " ").split(/\r?\n/)) {
    const words = paragraph.split(/ +/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the column (a long URL or email) is broken by
      // character, at the longest prefix that fits — found by halving, so a
      // 2,000-character paste costs a few dozen measurements, not millions.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let lo = 1;
        let hi = rest.length - 1;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (font.widthOfTextAtSize(rest.slice(0, mid), size) <= maxWidth) lo = mid;
          else hi = mid - 1;
        }
        out.push(rest.slice(0, lo));
        rest = rest.slice(lo);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private onNewPage: (w: Writer) => void = () => {},
  ) {
    this.addPage();
  }

  addPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  /** Start a new page if fewer than `height` points are left, re-drawing any running header. */
  ensure(height: number) {
    if (this.y - height >= BOTTOM) return;
    this.addPage();
    this.onNewPage(this);
  }

  setOnNewPage(fn: (w: Writer) => void) {
    this.onNewPage = fn;
  }

  text(str: string, x: number, y: number, { font = this.regular, size = BODY, color = INK } = {}) {
    if (!str) return;
    this.page.drawText(str, { x, y, size, font, color });
  }

  textRight(str: string, right: number, y: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? BODY;
    this.text(str, right - font.widthOfTextAtSize(str, size), y, { ...opts, font, size });
  }

  rule(y: number, from = LEFT, to = RIGHT, thickness = 0.6, color = RULE) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color });
  }
}

/** Fit a logo into `maxW` × `maxH`, keeping its shape. */
function logoSize(image: PDFImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}

export async function renderDocPdf(raw: DocView, fonts: PdfFonts, logo: PdfLogo | null = null): Promise<Uint8Array> {
  const view = pdfView(raw);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(view.fileName.replace(/\.pdf$/, ""));
  pdf.setCreator("SpendChat");
  pdf.setProducer("SpendChat");
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const w = new Writer(pdf, regular, bold);

  // ---- Header: seller on the left, title and dates on the right ----
  const top = w.y;
  // The dates block is as wide as its longest label and value; the seller's
  // column gives way to it, so a long document number can't run into the address.
  const valueW = Math.max(0, ...view.meta.map((m) => regular.widthOfTextAtSize(m.value, 9)));
  const labelW = Math.max(0, ...view.meta.map((m) => regular.widthOfTextAtSize(m.label, 9)));
  const leftW = Math.max(CONTENT_W * 0.3, Math.min(CONTENT_W * 0.55, CONTENT_W - valueW - labelW - 12 - 20));
  let leftY = top;
  if (logo) {
    const image = logo.kind === "png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
    const size = logoSize(image, 150, 48);
    w.page.drawImage(image, { x: LEFT, y: leftY - size.height, ...size });
    leftY -= size.height + 12;
  }
  if (view.seller.name) {
    for (const line of wrapText(view.seller.name, bold, 13, leftW)) {
      leftY -= 15;
      w.text(line, LEFT, leftY, { font: bold, size: 13 });
    }
    leftY -= 3;
  }
  for (const line of view.seller.lines.flatMap((l) => wrapText(l, regular, BODY, leftW))) {
    leftY -= LINE;
    w.text(line, LEFT, leftY, { color: MUTED });
  }

  let rightY = top - 20;
  w.textRight(view.title.toUpperCase(), RIGHT, rightY, { font: bold, size: 22 });
  rightY -= 10;
  for (const m of view.meta) {
    rightY -= 13;
    w.textRight(m.value, RIGHT, rightY, { size: 9 });
    w.textRight(m.label, RIGHT - valueW - 12, rightY, { size: 9, color: FAINT });
  }
  w.y = Math.min(leftY, rightY) - 28;

  // ---- Client ----
  if (view.client.name || view.client.lines.length) {
    w.text(view.clientLabel.toUpperCase(), LEFT, w.y, { font: bold, size: 7.5, color: FAINT });
    w.y -= 4;
    if (view.client.name) {
      for (const line of wrapText(view.client.name, bold, 10.5, CONTENT_W * 0.6)) {
        w.y -= LINE;
        w.text(line, LEFT, w.y, { font: bold, size: 10.5 });
      }
    }
    for (const line of view.client.lines.flatMap((l) => wrapText(l, regular, BODY, CONTENT_W * 0.6))) {
      w.y -= LINE;
      w.text(line, LEFT, w.y, { color: MUTED });
    }
    w.y -= 26;
  }

  // ---- Items, with the column header repeated on each new page ----
  const tableHeader = (writer: Writer) => {
    const y = writer.y - 8;
    const h = { font: bold, size: 7.5, color: FAINT };
    writer.text("DESCRIPTION", LEFT, y, h);
    writer.textRight("QTY", QTY_RIGHT, y, h);
    writer.textRight("UNIT PRICE", UNIT_RIGHT, y, h);
    writer.textRight("AMOUNT", AMOUNT_RIGHT, y, h);
    writer.y = y - 7;
    writer.rule(writer.y, LEFT, RIGHT, 0.75);
  };
  if (view.items.length > 0) {
    w.ensure(60);
    tableHeader(w);
    w.setOnNewPage(tableHeader);
    for (const item of view.items) {
      const lines = wrapText(item.description || "—", regular, BODY, DESC_MAX);
      const height = lines.length * LINE + 10;
      w.ensure(height);
      let y = w.y - 4;
      lines.forEach((line, i) => {
        y -= LINE;
        w.text(line, LEFT, y);
        if (i === 0) {
          w.textRight(item.qty, QTY_RIGHT, y);
          w.textRight(item.unitPrice, UNIT_RIGHT, y);
          w.textRight(item.amount, AMOUNT_RIGHT, y);
        }
      });
      w.y = y - 6;
      w.rule(w.y);
    }
    w.setOnNewPage(() => {});
  }

  // ---- Totals ----
  const blockLeft = RIGHT - 230;
  w.ensure(view.totalRows.length * 15 + 60);
  w.y -= 8;
  if (view.total === null) {
    w.y -= LINE;
    w.textRight("These amounts are too large to total exactly.", RIGHT, w.y, { color: MUTED });
  } else {
    for (const row of view.totalRows) {
      w.y -= 15;
      w.text(row.label, blockLeft, w.y, { color: MUTED });
      w.textRight(row.value, RIGHT, w.y);
    }
    w.y -= 10;
    w.rule(w.y, blockLeft, RIGHT, 1.5, INK);
    w.y -= 17;
    w.text("Total", blockLeft, w.y, { font: bold, size: 12.5 });
    w.textRight(view.total, RIGHT, w.y, { font: bold, size: 12.5 });
  }
  if (view.amountInWords) {
    w.y -= 8;
    for (const line of wrapText(`Amount in words: ${view.amountInWords}`, regular, 8.5, CONTENT_W)) {
      w.ensure(12);
      w.y -= 12;
      w.textRight(line, RIGHT, w.y, { size: 8.5, color: MUTED });
    }
  }

  // ---- Notes and terms ----
  for (const [label, body] of [
    ["NOTES", view.notes],
    ["TERMS", view.terms],
  ] as const) {
    if (!body) continue;
    w.y -= 26;
    w.ensure(30);
    w.text(label, LEFT, w.y, { font: bold, size: 7.5, color: FAINT });
    w.y -= 3;
    for (const line of wrapText(body, regular, BODY, CONTENT_W)) {
      w.ensure(LINE);
      w.y -= LINE;
      w.text(line, LEFT, w.y, { color: MUTED });
    }
  }

  // ---- Footers: page numbers when there's more than one; the credit on the last ----
  const count = w.pages.length;
  w.pages.forEach((page, i) => {
    w.page = page;
    if (count > 1) w.textRight(`Page ${i + 1} of ${count}`, RIGHT, MARGIN - 18, { size: 7.5, color: FAINT });
  });
  if (view.credit) {
    const last = w.pages[count - 1]!;
    w.page = last;
    const width = regular.widthOfTextAtSize(view.credit, 7.5);
    w.text(view.credit, (PAGE_W - width) / 2, MARGIN - 18, { size: 7.5, color: FAINT });
  }

  return pdf.save();
}
