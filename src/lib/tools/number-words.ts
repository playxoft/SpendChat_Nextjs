import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { CURRENCY_WORDS, type CurrencyWords, type UnitName } from "@/lib/tools/data/currency-words";

/**
 * Numbers and money amounts written out in English words — the engine behind
 * `/tools/amount-in-words`, and the "amount in words" line on an invoice.
 *
 * Two numbering systems:
 *
 * - **international** — thousand, million, billion, trillion (short scale),
 *   hyphenated tens ("twenty-one"), no "and" inside the number
 *   ("one hundred twenty"), which is how a US check is written and leaves "and"
 *   free to mark where the cents start.
 * - **indian** — thousand, lakh (1,00,000), crore (1,00,00,000), no hyphens
 *   ("twenty one"), as Indian cheques and invoices are written. Past 99 crore
 *   the number of crores is itself counted in hundreds, thousands and lakhs —
 *   "one hundred crore", "one thousand crore", "one lakh crore", and
 *   "one hundred lakh crore" for 10^14 rather than "one crore crore" — the way
 *   Indian budgets and newspapers write large sums. The older arab/kharab
 *   names aren't used.
 *
 * Lakh and crore stay singular after a number ("five lakh"), like "hundred".
 *
 * Everything returned here is lowercase; `applyLetterCase` produces the
 * sentence, title and upper-case forms. Amounts are split into major and minor
 * units with the currency's own decimals (JPY has no minor part, KWD has
 * three), rounding half up on the decimal digits as typed.
 */

export type NumberingSystem = "indian" | "international";
export type LetterCase = "sentence" | "title" | "upper";

/**
 * The largest whole number written out: 999 trillion (99,99,99,999 crore
 * 99,99,999). It keeps every integer exact in a JS number, and it's far past
 * any amount written on a cheque.
 */
export const MAX_AMOUNT_IN_WORDS = 999_999_999_999_999;

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const INTERNATIONAL_SCALES = ["", "thousand", "million", "billion", "trillion"];

/**
 * Currencies whose cheques and invoices are written in lakh and crore. Sri
 * Lanka is left out: it says lakh in speech but writes millions in English,
 * on cheques and in its central bank's figures alike.
 */
const INDIAN_SYSTEM_CURRENCIES = new Set(["INR", "NPR", "PKR", "BDT"]);

/**
 * Countries that write the currency name first on a cheque —
 * "Rupees One Lakh Only" rather than "One Lakh Rupees Only".
 */
const CURRENCY_FIRST_CURRENCIES = new Set([...INDIAN_SYSTEM_CURRENCIES, "LKR"]);

function below100(n: number, hyphen: boolean): string {
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  const ones = n % 10;
  return ones ? `${tens}${hyphen ? "-" : " "}${ONES[ones]}` : tens;
}

/** 1–999; the caller skips zero groups. */
function below1000(n: number, hyphen: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(below100(rest, hyphen));
  return parts.join(" ");
}

/**
 * Split an exact integer into (quotient, remainder). Subtracting the remainder
 * first makes the division exact, so no float rounding can nudge the quotient.
 */
function divmod(n: number, by: number): [number, number] {
  const rest = n % by;
  return [(n - rest) / by, rest];
}

function internationalWords(n: number): string {
  const parts: string[] = [];
  let rest = n;
  for (let scale = 0; rest > 0; scale++) {
    const [higher, group] = divmod(rest, 1000);
    if (group) {
      const name = INTERNATIONAL_SCALES[scale]!;
      parts.unshift(name ? `${below1000(group, true)} ${name}` : below1000(group, true));
    }
    rest = higher;
  }
  return parts.join(" ");
}

/** Up to 999,99,99,999 — lakh is the largest name; the lakh count may pass 99. */
function indianBelowCrore(n: number): string[] {
  const [lakhs, belowLakh] = divmod(n, 100_000);
  const [thousands, rest] = divmod(belowLakh, 1000);
  const parts: string[] = [];
  if (lakhs) parts.push(`${below1000(lakhs, false)} lakh`);
  if (thousands) parts.push(`${below100(thousands, false)} thousand`);
  if (rest) parts.push(below1000(rest, false));
  return parts;
}

function indianWords(n: number): string {
  const [crores, rest] = divmod(n, 10_000_000);
  const parts: string[] = [];
  if (crores) parts.push(`${indianBelowCrore(crores).join(" ")} crore`);
  parts.push(...indianBelowCrore(rest));
  return parts.join(" ");
}

function assertInRange(n: number): void {
  if (!Number.isFinite(n)) throw new RangeError("Only finite numbers can be written in words.");
  if (Math.abs(n) > MAX_AMOUNT_IN_WORDS) {
    throw new RangeError(`Numbers above ${MAX_AMOUNT_IN_WORDS} can't be written in words.`);
  }
}

/**
 * The integer part of `n` in words — 120000 is "one lakh twenty thousand"
 * (indian) or "one hundred twenty thousand" (international). Any fraction is
 * dropped; use `amountInWords` for money. Throws a RangeError past
 * `MAX_AMOUNT_IN_WORDS` or for NaN/Infinity.
 */
export function numberToWords(n: number, system: NumberingSystem): string {
  assertInRange(n);
  const whole = Math.trunc(Math.abs(n));
  if (whole === 0) return "zero";
  const words = system === "indian" ? indianWords(whole) : internationalWords(whole);
  return n < 0 ? `minus ${words}` : words;
}

/** Lakh and crore for the South Asian currencies, million and billion for the rest. */
export function defaultNumberingSystem(currency: string): NumberingSystem {
  return INDIAN_SYSTEM_CURRENCIES.has(currency.toUpperCase()) ? "indian" : "international";
}

/**
 * Unit names and decimals for a currency. An unknown code still gets words —
 * the code itself as the unit, cents as the minor — rather than an exception
 * in the middle of an invoice.
 */
export function currencyWords(currency: string): CurrencyWords & { decimals: number } {
  const code = currency.toUpperCase();
  const decimals = isSupportedCurrency(code) ? getCurrency(code).decimals : 2;
  const words = CURRENCY_WORDS[code];
  if (words) return { ...words, decimals };
  return { major: { one: code, many: code }, minor: { one: "cent", many: "cents" }, decimals };
}

/** An amount split into whole major units and whole minor units. */
export type AmountParts = {
  negative: boolean;
  /** Whole major units — dollars, rupees. */
  major: number;
  /** Whole minor units, 0 to 10^decimals − 1 — cents, paise. Always 0 for JPY. */
  minor: number;
  decimals: number;
  /** True when the amount had more decimal places than the currency, and was rounded. */
  rounded: boolean;
};

/**
 * Split `amount` into major and minor units for `currency`, rounding half up.
 *
 * Rounds on the number's decimal digits as written, not by multiplying:
 * 1.005 × 100 is 100.49999… in floating point, which would round a typed
 * "1.005" down to one cent.
 */
export function amountParts(amount: number, currency: string): AmountParts {
  assertInRange(amount);
  const { decimals } = currencyWords(currency);
  const text = String(Math.abs(amount));
  let major = 0;
  let minor = 0;
  let rounded = false;

  // Exponent form only appears here for values under 1e-6, which round to zero.
  if (text.includes("e")) {
    rounded = amount !== 0;
  } else {
    const [intText, fracText = ""] = text.split(".");
    major = Number(intText);
    minor = decimals ? Number(fracText.slice(0, decimals).padEnd(decimals, "0")) : 0;
    rounded = fracText.length > decimals;
    if (fracText.charAt(decimals) >= "5") {
      minor += 1;
      if (minor === 10 ** decimals) {
        minor = 0;
        major += 1;
      }
    }
  }

  if (major > MAX_AMOUNT_IN_WORDS) {
    throw new RangeError(`Numbers above ${MAX_AMOUNT_IN_WORDS} can't be written in words.`);
  }
  // −0.001 rounds to zero, and "minus zero dollars" isn't an amount.
  const negative = amount < 0 && (major > 0 || minor > 0);
  return { negative, major, minor, decimals, rounded };
}

/** Parts from an integer count of minor units — the form invoice totals are kept in. */
export function minorUnitParts(amountMinor: number, currency: string): AmountParts {
  const { decimals } = currencyWords(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Minor units must be a whole number.");
  }
  const [major, minor] = divmod(Math.abs(amountMinor), 10 ** decimals);
  if (major > MAX_AMOUNT_IN_WORDS) {
    throw new RangeError(`Numbers above ${MAX_AMOUNT_IN_WORDS} can't be written in words.`);
  }
  return { negative: amountMinor < 0, major, minor, decimals, rounded: false };
}

const unitFor = (name: UnitName, count: number) => (count === 1 ? name.one : name.many);

/** "one lakh twenty thousand rupees and fifty paise" from already-split parts. */
export function partsInWords(parts: AmountParts, currency: string, system: NumberingSystem): string {
  const names = currencyWords(currency);
  const majorText = `${numberToWords(parts.major, system)} ${unitFor(names.major, parts.major)}`;
  const minorName = names.minor;
  let words: string;
  if (parts.minor > 0 && minorName) {
    const minorText = `${numberToWords(parts.minor, system)} ${unitFor(minorName, parts.minor)}`;
    // "fifty cents", not "zero dollars and fifty cents".
    words = parts.major > 0 ? `${majorText} and ${minorText}` : minorText;
  } else {
    words = majorText;
  }
  return parts.negative ? `minus ${words}` : words;
}

/**
 * A money amount in words, in lowercase and without "only":
 * `amountInWords(120000.5, "INR", "indian")` →
 * "one lakh twenty thousand rupees and fifty paise". Minor units are rounded
 * to the currency's decimals; zero-decimal currencies (JPY) get no minor part.
 */
export function amountInWords(amount: number, currency: string, system: NumberingSystem): string {
  return partsInWords(amountParts(amount, currency), currency, system);
}

/** `amountInWords` for an integer count of minor units (12050 → "one hundred twenty dollars and fifty cents"). */
export function minorAmountInWords(amountMinor: number, currency: string, system: NumberingSystem): string {
  return partsInWords(minorUnitParts(amountMinor, currency), currency, system);
}

/**
 * The "only" cheque line used in India, the UK, the Gulf and much of Africa,
 * lowercase: "rupees one lakh twenty thousand and fifty paise only". South
 * Asian currencies put the currency name first, as their cheques do; the rest
 * read "… pounds and fifty pence only". Null for a negative amount — there's
 * no such cheque.
 */
export function chequeWordsOnly(parts: AmountParts, currency: string, system: NumberingSystem): string | null {
  if (parts.negative) return null;
  const names = currencyWords(currency);
  if (!CURRENCY_FIRST_CURRENCIES.has(currency.toUpperCase())) {
    return `${partsInWords(parts, currency, system)} only`;
  }
  const minorName = names.minor;
  const minorText =
    parts.minor > 0 && minorName
      ? `${numberToWords(parts.minor, system)} ${unitFor(minorName, parts.minor)}`
      : null;
  if (parts.major === 0 && minorText) return `${minorText} only`;
  const majorText = `${names.major.many} ${numberToWords(parts.major, system)}`;
  return minorText ? `${majorText} and ${minorText} only` : `${majorText} only`;
}

/**
 * The US check line, lowercase: "one hundred twenty thousand and 50/100
 * dollars". The fraction is always written — "and 00/100" on a whole amount —
 * so nothing can be added after the words; zero-decimal currencies have none.
 * Null for a negative amount.
 */
export function checkWordsFraction(parts: AmountParts, currency: string, system: NumberingSystem): string | null {
  if (parts.negative) return null;
  const names = currencyWords(currency);
  const majorText = numberToWords(parts.major, system);
  if (parts.decimals === 0) return `${majorText} ${unitFor(names.major, parts.major)}`;
  const minorDigits = String(parts.minor).padStart(parts.decimals, "0");
  return `${majorText} and ${minorDigits}/${10 ** parts.decimals} ${names.major.many}`;
}

/**
 * The amount in figures, grouped the Indian way (1,20,000.50 — threes, then
 * twos) or the international way (120,000.50). Built from the same parts as
 * the words, so the figures and the words can never disagree on rounding.
 */
export function formatGrouped(parts: AmountParts, system: NumberingSystem): string {
  const digits = String(parts.major);
  let grouped: string;
  if (system === "indian" && digits.length > 3) {
    const head = digits.slice(0, -3);
    grouped = `${head.replace(/\B(?=(\d{2})+$)/g, ",")},${digits.slice(-3)}`;
  } else {
    grouped = digits.replace(/\B(?=(\d{3})+$)/g, ",");
  }
  const fraction = parts.decimals ? `.${String(parts.minor).padStart(parts.decimals, "0")}` : "";
  return `${parts.negative ? "-" : ""}${grouped}${fraction}`;
}

/** Words that stay lowercase in Title Case unless they open the line. */
const TITLE_CASE_SMALL_WORDS = new Set(["and"]);

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Re-case lowercase words: "Sentence case", "Title Case" (each word and each
 * half of "Twenty-One" capitalised, "and" left lowercase, as on a cheque) or
 * "UPPERCASE".
 */
export function applyLetterCase(text: string, letterCase: LetterCase): string {
  if (letterCase === "upper") return text.toUpperCase();
  if (letterCase === "sentence") return capitalise(text);
  return text
    .split(" ")
    .map((word, i) =>
      i > 0 && TITLE_CASE_SMALL_WORDS.has(word) ? word : word.split("-").map(capitalise).join("-"),
    )
    .join(" ");
}
