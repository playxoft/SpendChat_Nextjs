import {
  formatAmountInput,
  isSpaceSeparator,
  localeSeparators,
  parseAmountInput,
} from "./parse-amount";

/**
 * Combined "quick entry" parser for the transaction composer's single-field mode.
 *
 * The leading number is the amount; everything after it is the title:
 *   "100 fruits"          → { amount: 100,   title: "fruits" }
 *   "12.50 lunch w/ team" → { amount: 12.5,  title: "lunch w/ team" }
 *   "$1,000 rent"         → { amount: 1000,  title: "rent" }
 *   "100"                 → { amount: 100,   title: "" }
 *   "fruits"              → { amount: null,  title: "fruits" }  (no leading number)
 *
 * A leading currency symbol/whitespace is tolerated ("$100 fruits"). The amount
 * is read with the user's locale separators, so a comma is a decimal point for
 * a de-DE user and a thousands separator for an en-US one. Input the parser
 * can't split confidently yields `amount: null` so the composer can ask rather
 * than guess — never a silently mis-scaled amount.
 */
export type QuickEntry = { amount: number | null; title: string };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Optional leading whitespace, one optional currency-symbol char, then a number
 * built from `groupChars`, then the rest as the title. Requiring the number up
 * front means a title-first string ("fruits 100") is left un-parsed.
 */
function quickEntryRe(groupChars: string, decimal: string): RegExp {
  const g = escapeRe(groupChars);
  const d = escapeRe(decimal);
  // The number swallows its own separators, so "1,000 rent" can't split into
  // "1" + ",000 rent" (which used to store 1 with the title ",000 rent").
  return new RegExp(`^\\s*[^\\d\\s]?\\s*(\\d[\\d${g}]*(?:${d}\\d+)?)\\s*(.*)$`, "s");
}

/**
 * Number-token shapes to try, widest first. Locales that group with a space
 * get a first pass that lets a typed ASCII space act as the separator
 * ("1 000 rent" → 1000); if that over-reaches ("100 2x tickets"), the narrow
 * pass without spaces wins instead.
 */
function candidates(locale: string): RegExp[] {
  const { group, decimal } = localeSeparators(locale);
  const narrow = quickEntryRe(group, decimal);
  if (!isSpaceSeparator(group)) return [narrow];
  return [quickEntryRe(`${group} `, decimal), narrow];
}

/**
 * A title starting with a bare 3-digit group ("1 000 rent" → title "000 rent")
 * means the split landed inside a number the locale can't express. Reject it
 * rather than record a 1000x-wrong amount.
 */
function looksLikeSplitNumber(title: string, locale: string): boolean {
  const { group, decimal } = localeSeparators(locale);
  const tail = escapeRe(`${group}${decimal}`);
  return new RegExp(`^\\d{3}(?=$|\\s|[${tail}])`).test(title);
}

export function parseQuickEntry(raw: string, locale = "en-US"): QuickEntry {
  const trimmed = raw.trim();
  for (const re of candidates(locale)) {
    const match = trimmed.match(re);
    if (!match) continue;
    const title = match[2]!.trim();
    const amount = parseAmountInput(match[1]!, locale);
    if (amount === null || looksLikeSplitNumber(title, locale)) continue;
    return { amount, title };
  }
  return { amount: null, title: trimmed };
}

/**
 * Text pasted into the single field's amount chip, split into what each of its
 * two zones should hold — both as strings, since they go straight back into the
 * inputs the user can still edit.
 *
 * "100 fruits" splits: the number goes to the chip, the words to the title.
 * **Anything `parseQuickEntry` won't split confidently goes to the title
 * whole**, chip empty — a title-first "coffee 250", "Dinner for 2 people 800",
 * "Rs. 500 groceries", or "1 000 rent" where the space may be a grouping
 * separator. Not because the words matter more than the number, but because
 * the alternative is guessing which of several numbers is the amount, and this
 * module exists to never do that: "Dinner for 2 people 800" reduced to its
 * digits reads as 2800, and "Rs. 500" as 0.5 — both of which would submit
 * without a warning. The composer blocks the send with an empty chip instead,
 * and the whole paste stays on screen to be fixed.
 *
 * `decimals` is the workspace currency's (3 for KWD/BHD/OMR/JOD), so a pasted
 * "12.345 lunch" isn't rounded on its way into the chip.
 *
 * The amount isn't capped here: one over the 9-digit limit is shown and flagged
 * by the composer (and blocks the send) rather than being silently trimmed to a
 * smaller number.
 */
export function splitChipPaste(
  text: string,
  locale = "en-US",
  decimals = 2,
): { amount: string; title: string } {
  const { amount, title } = parseQuickEntry(text, locale);
  if (amount === null) return { amount: "", title: text.trim() };
  return { amount: formatAmountInput(amount, locale, decimals), title };
}
