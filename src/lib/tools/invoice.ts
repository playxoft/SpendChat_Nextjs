import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { toMinorUnits } from "@/lib/money";
import { addDays, daysBetween, parseDate } from "@/lib/tools/date-math";
import { fromCanonicalNumber, parseNumber, toCanonicalNumber } from "@/lib/tools/format";

/**
 * The document engine behind `/tools/invoice-generator` and
 * `/tools/quotation-generator`: the draft's shape, its totals, numbering, and
 * the checks a saved or imported draft goes through before it's trusted.
 *
 * Totals are integer minor units end to end (cents, paise, fils), so the
 * lines add up to the subtotal and subtotal − discount + tax is the total to
 * the last unit — the same figures a customer's accountant will re-add.
 * Quantity and rate multiplications are done in `BigInt` with commercial
 * rounding: `5397 × 18%` is 971.46 exactly, and a float's 971.4599… is enough
 * to round the wrong way on some other amount.
 */

export type DocKind = "invoice" | "quotation";
export type DiscountType = "percent" | "fixed";
/** What a quotation calls itself — a firm "quotation" or a looser "estimate". */
export type QuoteTitle = "quotation" | "estimate";

export type LineItem = {
  /** Stable React key; never shown. */
  id: string;
  description: string;
  /** As typed — parsed with the visitor's locale at use. */
  qty: string;
  /** Unit price as typed, in major units. */
  price: string;
};

export type Seller = { name: string; address: string; contact: string; taxId: string };
export type Buyer = { name: string; address: string; email: string };

export type BusinessDoc = {
  kind: DocKind;
  quoteTitle: QuoteTitle;
  number: string;
  /** `YYYY-MM-DD`, or `""` for "today" — resolved in the browser, never at build time. */
  issueDate: string;
  /**
   * Payment terms (invoice) or validity (quotation) in days after the issue
   * date. `null` when the visitor picked `dueDate` by hand instead.
   */
  dueDays: number | null;
  dueDate: string;
  from: Seller;
  to: Buyer;
  items: LineItem[];
  discountType: DiscountType;
  discount: string;
  taxLabel: string;
  taxRate: string;
  notes: string;
  /** Quotation only. */
  terms: string;
  /** A `data:image/…;base64,` URL, read in the browser and never uploaded. */
  logo: string | null;
  /**
   * The currency this document is written in. Saved with the draft, since the
   * site-wide currency can change on another tool — a saved ₹ invoice must
   * not reopen as £. Null for a draft saved before this existed.
   */
  currency: string | null;
  /** The "Made with SpendChat" line at the foot of the document. */
  credit: boolean;
};

// ---------------------------------------------------------------------------
// Limits and defaults
// ---------------------------------------------------------------------------

/** Longest value each field keeps — enough for real documents, not for a payload. */
export const LIMITS = {
  number: 40,
  name: 120,
  address: 400,
  contact: 160,
  taxId: 60,
  email: 160,
  description: 300,
  amount: 40,
  taxLabel: 24,
  notes: 2000,
  terms: 2000,
} as const;

export const MAX_ITEMS = 100;
/** Ten years is already a strange payment term; anything past it is noise. */
export const MAX_DUE_DAYS = 3650;
export const MAX_LOGO_BYTES = 300 * 1024;
/** A 300 KB image as base64, plus room for the `data:image/svg+xml;base64,` header. */
export const MAX_LOGO_DATA_URL = Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 64;
/** Quantities keep four decimals: 7.5 hours, 0.125 kg, 2.3333 days. */
export const QTY_DECIMALS = 4;
/**
 * Largest amount, in minor units, anywhere on a document. It stays inside the
 * range a JS number holds exactly (2^53 ≈ 9 × 10^15) and inside what
 * `number-words` can write out.
 */
export const MAX_MINOR = 999_999_999_999_999;
const MAX_QTY = 1_000_000_000;

export const DEFAULT_DUE_DAYS: Record<DocKind, number> = { invoice: 30, quotation: 30 };

export function defaultDocNumber(kind: DocKind): string {
  return kind === "invoice" ? "INV-0001" : "QUO-0001";
}

let idSeq = 0;
/** A fresh row key. Only ever called from event handlers and draft loading. */
export function newItemId(): string {
  idSeq += 1;
  return `i${Date.now().toString(36)}${idSeq.toString(36)}`;
}

export function emptyItem(id: string = newItemId()): LineItem {
  return { id, description: "", qty: "1", price: "" };
}

/**
 * A blank document. Rows get fixed ids so the server render and the first
 * client render agree; rows added later get fresh ones.
 */
export function defaultDoc(kind: DocKind): BusinessDoc {
  return {
    kind,
    quoteTitle: "quotation",
    number: defaultDocNumber(kind),
    issueDate: "",
    dueDays: DEFAULT_DUE_DAYS[kind],
    dueDate: "",
    from: { name: "", address: "", contact: "", taxId: "" },
    to: { name: "", address: "", email: "" },
    items: [emptyItem("i1")],
    discountType: "percent",
    discount: "",
    taxLabel: "",
    taxRate: "",
    notes: "",
    terms: "",
    logo: null,
    currency: null,
    credit: true,
  };
}

// ---------------------------------------------------------------------------
// Minor-unit arithmetic
// ---------------------------------------------------------------------------

/** Rates keep four decimals (8.1%, 5.5%, 12.875%). */
const RATE_SCALE = 10_000;
const QTY_SCALE = 10 ** QTY_DECIMALS;
/** Sub-minor-unit precision kept on a unit price before it is multiplied (4 decimal places of a cent). */
const UNIT_SCALE = 10_000;

/** `numerator ÷ denominator` rounded half away from zero. Denominator > 0. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const zero = BigInt(0);
  const two = BigInt(2);
  const negative = numerator < zero;
  const abs = negative ? -numerator : numerator;
  const q = (abs * two + denominator) / (denominator * two);
  return negative ? -q : q;
}

/**
 * `qty × unit price`, rounded once, to the currency's minor unit. The unit
 * price may carry fractions of a minor unit (0.085 per word is 8.5 cents):
 * rounding it to cents first would bill 10,000 words at $900 instead of $850.
 * Null for a negative or non-finite quantity or price, or a result past
 * `MAX_MINOR`.
 */
export function lineAmountMinor(qty: number, unitMinor: number): number | null {
  if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY) return null;
  if (!Number.isFinite(unitMinor) || unitMinor < 0 || unitMinor > MAX_MINOR) return null;
  const scaledQty = BigInt(Math.round(qty * QTY_SCALE));
  const scaledUnit = BigInt(Math.round(unitMinor * UNIT_SCALE));
  const amount = Number(divRound(scaledQty * scaledUnit, BigInt(QTY_SCALE) * BigInt(UNIT_SCALE)));
  return amount > MAX_MINOR ? null : amount;
}

/** `percent`% of an amount in minor units, rounded half away from zero. */
export function percentOfMinor(amountMinor: number, percent: number): number | null {
  if (!Number.isSafeInteger(amountMinor) || Math.abs(amountMinor) > MAX_MINOR) return null;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const rate = BigInt(Math.round(percent * RATE_SCALE));
  return Number(divRound(BigInt(amountMinor) * rate, BigInt(100 * RATE_SCALE)));
}

export type TotalsInput = {
  /** Each line's amount in minor units (already qty × price). */
  lines: number[];
  /** A percentage (0–100) or a fixed amount in minor units. */
  discount: { type: DiscountType; value: number };
  /** Percent, applied to the subtotal after the discount. */
  taxRate: number;
};

export type Totals = {
  subtotal: number;
  discount: number;
  /** Subtotal − discount: what the tax is charged on. */
  taxable: number;
  tax: number;
  total: number;
  /** A fixed discount bigger than the subtotal, cut down to it. */
  discountCapped: boolean;
};

/**
 * Subtotal → discount → tax → total. Tax is charged on the discounted
 * amount, which is how VAT and GST treat a discount given on the invoice
 * itself. Null when a figure would pass `MAX_MINOR` or an input is invalid.
 */
export function calculateTotals({ lines, discount, taxRate }: TotalsInput): Totals | null {
  let subtotal = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line) || line < 0) return null;
    subtotal += line;
    if (subtotal > MAX_MINOR) return null;
  }

  let discountMinor: number;
  let discountCapped = false;
  if (discount.type === "percent") {
    const d = percentOfMinor(subtotal, discount.value);
    if (d === null) return null;
    discountMinor = d;
  } else {
    if (!Number.isSafeInteger(discount.value) || discount.value < 0) return null;
    discountCapped = discount.value > subtotal;
    discountMinor = Math.min(discount.value, subtotal);
  }

  const taxable = subtotal - discountMinor;
  const tax = percentOfMinor(taxable, taxRate);
  if (tax === null) return null;
  const total = taxable + tax;
  if (total > MAX_MINOR) return null;
  return { subtotal, discount: discountMinor, taxable, tax, total, discountCapped };
}

// ---------------------------------------------------------------------------
// Evaluating a draft (strings as typed → figures and field errors)
// ---------------------------------------------------------------------------

export type ItemResult = {
  qty: number | null;
  unitMinor: number | null;
  /** Null when the row is incomplete or invalid — it adds nothing to the totals. */
  amountMinor: number | null;
  qtyError: string | null;
  priceError: string | null;
  /** No description and no price: left off the printed document. */
  blank: boolean;
};

export type DocEvaluation = {
  items: ItemResult[];
  discountError: string | null;
  taxError: string | null;
  /** The discount as a percentage, for the "Discount (10%)" label. */
  discountPercent: number | null;
  taxRate: number;
  /** Null only when the document is too large to total exactly. */
  totals: Totals | null;
};

/** A non-negative number from a field, `0` when blank, or an error message. */
function readAmount(raw: string, locale: string, max: number): { value: number } | { error: string } {
  if (!raw.trim()) return { value: 0 };
  const n = parseNumber(raw, locale);
  if (n === null) return { error: "Enter a number." };
  if (n < 0) return { error: "Can't be negative." };
  if (n > max) return { error: "That's too large." };
  return { value: n };
}

/** A typed price in minor units via the app's `toMinorUnits`, or null past `MAX_MINOR`. */
function priceToMinor(value: number, currency: string): number | null {
  const minor = toMinorUnits(value, currency);
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

/**
 * Reads every typed figure on the document and totals it. Invalid rows are
 * flagged and left out of the totals rather than blanking the whole document,
 * so one typo doesn't hide everything else while it's being fixed.
 */
export function evaluateDoc(doc: BusinessDoc, currency: string, locale = "en-US"): DocEvaluation {
  const code = isSupportedCurrency(currency) ? currency : "USD";

  const items = doc.items.map((item): ItemResult => {
    const blank = !item.description.trim() && !item.price.trim();
    const qty = readAmount(item.qty, locale, MAX_QTY);
    const price = readAmount(item.price, locale, MAX_MINOR);
    const qtyError = "error" in qty ? qty.error : null;
    let priceError = "error" in price ? price.error : null;
    let unitMinor: number | null = null;
    if ("value" in price) {
      unitMinor = priceToMinor(price.value, code);
      if (unitMinor === null) priceError = "That's too large.";
    }
    const qtyValue = "value" in qty ? qty.value : null;
    let amountMinor: number | null = null;
    if (qtyValue !== null && unitMinor !== null && "value" in price) {
      // From the price as typed, not the rounded unit price shown on the paper.
      amountMinor = lineAmountMinor(qtyValue, price.value * 10 ** getCurrency(code).decimals);
      if (amountMinor === null) priceError ??= "That line is too large.";
    }
    return { qty: qtyValue, unitMinor, amountMinor, qtyError, priceError, blank };
  });

  let discountError: string | null = null;
  let discountValue = 0;
  let discountPercent: number | null = null;
  const discount = readAmount(doc.discount, locale, doc.discountType === "percent" ? 100 : MAX_MINOR);
  if ("error" in discount) {
    discountError = doc.discountType === "percent" && discount.error === "That's too large."
      ? "A discount can't be more than 100%."
      : discount.error;
  } else if (doc.discountType === "percent") {
    discountValue = discount.value;
    discountPercent = discount.value;
  } else {
    const minor = priceToMinor(discount.value, code);
    if (minor === null) discountError = "That's too large.";
    else discountValue = minor;
  }

  let taxError: string | null = null;
  let taxRate = 0;
  const tax = readAmount(doc.taxRate, locale, 100);
  if ("error" in tax) {
    taxError = tax.error === "That's too large." ? "A tax rate can't be more than 100%." : tax.error;
  } else {
    taxRate = tax.value;
  }

  const totals = calculateTotals({
    lines: items.map((i) => i.amountMinor ?? 0),
    discount: { type: doc.discountType, value: discountValue },
    taxRate,
  });
  if (totals?.discountCapped) discountError = "The discount is more than the subtotal.";

  return { items, discountError, taxError, discountPercent, taxRate, totals };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * The document's dates for display: a blank issue date is today (null until
 * the browser knows what today is), and payment terms count from the issue
 * date, so moving the issue date moves the due date with it.
 */
export function resolveDocDates(
  doc: Pick<BusinessDoc, "issueDate" | "dueDays" | "dueDate">,
  today: string | null,
): { issue: string | null; due: string | null } {
  const issue = parseDate(doc.issueDate) ? doc.issueDate : today && parseDate(today) ? today : null;
  if (doc.dueDays !== null) {
    return { issue, due: issue ? addDays(issue, doc.dueDays) : null };
  }
  return { issue, due: parseDate(doc.dueDate) ? doc.dueDate : null };
}

/** True when a hand-picked due / valid-until date falls before the issue date. */
export function dueBeforeIssue(issue: string | null, due: string | null): boolean {
  if (!issue || !due) return false;
  return daysBetween(issue, due) < 0;
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/**
 * The number after this one, keeping the prefix and zero padding:
 * `INV-0007` → `INV-0008`, `INV-0099` → `INV-0100`, `2024-17` → `2024-18`.
 * A number with no digits at the end gets `-2` (`ACME` → `ACME-2`), or just
 * `2` after a trailing separator (`INV-` → `INV-2`). Digits are incremented as
 * text, so a 25-digit number doesn't lose precision.
 */
export function nextDocNumber(current: string, kind: DocKind): string {
  const trimmed = current.trim();
  if (!trimmed) return defaultDocNumber(kind);
  const match = /^(.*?)(\d+)$/.exec(trimmed);
  let next: string;
  if (match) {
    const [, prefix = "", digits = ""] = match;
    const bumped = (BigInt(digits) + BigInt(1)).toString();
    next = prefix + bumped.padStart(digits.length, "0");
  } else {
    next = /[-_/.#\s]$/.test(trimmed) ? `${trimmed}2` : `${trimmed}-2`;
  }
  return next.slice(0, LIMITS.number);
}

// ---------------------------------------------------------------------------
// Moving between documents
// ---------------------------------------------------------------------------

/** Anything worth keeping — a client, or a line with a description or price. */
export function hasContent(doc: BusinessDoc): boolean {
  return (
    doc.to.name.trim() !== "" ||
    doc.items.some((i) => i.description.trim() !== "" || i.price.trim() !== "")
  );
}

/**
 * The next document in the series: same seller, logo, tax, notes and terms;
 * a new number, today's date and an empty client and item list.
 */
export function startNextDoc(doc: BusinessDoc): BusinessDoc {
  return {
    ...doc,
    number: nextDocNumber(doc.number, doc.kind),
    issueDate: "",
    dueDays: doc.dueDays ?? DEFAULT_DUE_DAYS[doc.kind],
    dueDate: "",
    to: { name: "", address: "", email: "" },
    items: [emptyItem()],
    discount: "",
  };
}

/**
 * A quotation's content as an invoice: items, client, seller, tax and
 * discount carry over; the quotation's terms (validity, deposit rules) don't
 * belong on a bill, so they're dropped. The invoice is dated today with
 * `dueDays` payment terms.
 */
export function quotationToInvoice(
  quote: BusinessDoc,
  invoiceNumber: string,
  dueDays: number = DEFAULT_DUE_DAYS.invoice,
): BusinessDoc {
  return {
    ...quote,
    kind: "invoice",
    quoteTitle: "quotation",
    number: invoiceNumber.slice(0, LIMITS.number),
    issueDate: "",
    dueDays,
    dueDate: "",
    terms: "",
    items: quote.items.map((i) => ({ ...i })),
    from: { ...quote.from },
    to: { ...quote.to },
  };
}

// ---------------------------------------------------------------------------
// Sanitising saved and imported drafts
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** A string field, capped; anything else becomes blank. NULs are dropped. */
function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.split("\u0000").join("").slice(0, max) : "";
}

function dateText(v: unknown): string {
  return typeof v === "string" && parseDate(v) ? v : "";
}

const LOGO_PATTERN = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

/** A logo data URL we're willing to render: an image type, base64, and small. */
export function isValidLogo(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_LOGO_DATA_URL && LOGO_PATTERN.test(v);
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * A draft from `localStorage` or an imported file, made safe to render:
 * every field is re-typed, capped and defaulted, the item list is trimmed to
 * `MAX_ITEMS` (and never empty), and the logo must be a small image data URL.
 * Null when the value isn't an object at all. The kind is always the page's.
 */
export function sanitizeDoc(raw: unknown, kind: DocKind): BusinessDoc | null {
  if (!isObject(raw)) return null;
  const base = defaultDoc(kind);
  const from = isObject(raw.from) ? raw.from : {};
  const to = isObject(raw.to) ? raw.to : {};

  const seen = new Set<string>();
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter(isObject)
    .slice(0, MAX_ITEMS)
    .map((item): LineItem => {
      let id = typeof item.id === "string" && ID_PATTERN.test(item.id) ? item.id : "";
      if (!id || seen.has(id)) id = newItemId();
      seen.add(id);
      return {
        id,
        description: text(item.description, LIMITS.description),
        qty: typeof item.qty === "number" ? String(item.qty).slice(0, LIMITS.amount) : text(item.qty, LIMITS.amount),
        price:
          typeof item.price === "number" ? String(item.price).slice(0, LIMITS.amount) : text(item.price, LIMITS.amount),
      };
    });

  const dueDays =
    raw.dueDays === null
      ? null
      : typeof raw.dueDays === "number" && Number.isInteger(raw.dueDays) && raw.dueDays >= 0 && raw.dueDays <= MAX_DUE_DAYS
        ? raw.dueDays
        : base.dueDays;
  const dueDate = dateText(raw.dueDate);

  return {
    kind,
    quoteTitle: raw.quoteTitle === "estimate" ? "estimate" : "quotation",
    number: text(raw.number, LIMITS.number) || base.number,
    issueDate: dateText(raw.issueDate),
    // A hand-picked due date that didn't survive falls back to the default terms.
    dueDays: dueDays === null && !dueDate ? base.dueDays : dueDays,
    dueDate,
    from: {
      name: text(from.name, LIMITS.name),
      address: text(from.address, LIMITS.address),
      contact: text(from.contact, LIMITS.contact),
      taxId: text(from.taxId, LIMITS.taxId),
    },
    to: {
      name: text(to.name, LIMITS.name),
      address: text(to.address, LIMITS.address),
      email: text(to.email, LIMITS.email),
    },
    items: items.length > 0 ? items : [emptyItem()],
    discountType: raw.discountType === "fixed" ? "fixed" : "percent",
    discount: text(raw.discount, LIMITS.amount),
    taxLabel: text(raw.taxLabel, LIMITS.taxLabel),
    taxRate: text(raw.taxRate, LIMITS.amount),
    notes: text(raw.notes, LIMITS.notes),
    terms: text(raw.terms, LIMITS.terms),
    logo: isValidLogo(raw.logo) ? raw.logo : null,
    currency:
      typeof raw.currency === "string" && isSupportedCurrency(raw.currency.toUpperCase())
        ? raw.currency.toUpperCase()
        : null,
    credit: raw.credit !== false,
  };
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/** Marks our JSON files, so importing some other `.json` fails with a clear message. */
export const DOC_FILE_FORMAT = "spendchat-business-doc";
/**
 * Version 2 writes every number in canonical form ("1500.5"), so a file or
 * share link made in one locale reads the same in another. Version 1 files
 * kept the typed text and are read as-is.
 */
const DOC_FILE_VERSION = 2;
/** A draft with a maximum-size logo and 100 full rows is well under this. */
export const MAX_DOC_FILE_CHARS = 1_000_000;

/** Every typed number on a document, converted with `convert`. */
function mapNumbers(doc: BusinessDoc, convert: (raw: string) => string): BusinessDoc {
  return {
    ...doc,
    items: doc.items.map((item) => ({ ...item, qty: convert(item.qty), price: convert(item.price) })),
    discount: convert(doc.discount),
    taxRate: convert(doc.taxRate),
  };
}

/** The draft as a downloadable JSON file, with the currency it was written in. */
export function exportDoc(doc: BusinessDoc, currency: string, locale = "en-US"): string {
  const portable = mapNumbers(doc, (raw) => toCanonicalNumber(raw, locale));
  return JSON.stringify(
    { format: DOC_FILE_FORMAT, version: DOC_FILE_VERSION, ...portable, currency },
    null,
    2,
  );
}

/**
 * An exported file back into a draft for this page, or null when it isn't
 * one of ours. Numbers come back in the reader's `locale`; the currency comes
 * back separately (the page's currency picker owns it), and only when it's
 * one we support.
 */
export function parseDocFile(
  textContent: string,
  kind: DocKind,
  locale = "en-US",
): { doc: BusinessDoc; currency: string | null } | null {
  if (textContent.length > MAX_DOC_FILE_CHARS) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(textContent);
  } catch {
    return null;
  }
  if (!isObject(raw) || raw.format !== DOC_FILE_FORMAT) return null;
  const sanitized = sanitizeDoc(raw, kind);
  if (!sanitized) return null;
  const doc =
    typeof raw.version === "number" && raw.version >= 2
      ? mapNumbers(sanitized, (value) => fromCanonicalNumber(value, locale))
      : sanitized;
  return { doc, currency: doc.currency };
}

/** A safe download name from the document number: `INV-0007.json`. */
export function docFileName(doc: BusinessDoc, ext = "json"): string {
  const base = doc.number.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 60);
  return `${base || doc.kind}.${ext}`;
}
