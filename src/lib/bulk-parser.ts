import { localeSeparators, parseAmountInput } from "./parse-amount";

export type BulkDraft = {
  type: "income" | "expense";
  amount: number; // major units, positive
  /** Headline (preferred). `note` is the legacy alias still produced by the text parser. */
  title?: string;
  description?: string;
  note: string;
  categoryName: string | null;
  profileId?: string;
  occurredOn: string; // YYYY-MM-DD
};

export type BulkParseError = { line: number; raw: string; message: string };

export type BulkParseResult = {
  drafts: BulkDraft[];
  errors: BulkParseError[];
};

const TYPE_ALIASES: Record<string, "income" | "expense"> = {
  income: "income",
  in: "income",
  inc: "income",
  "+": "income",
  expense: "expense",
  exp: "expense",
  out: "expense",
  "-": "expense",
};

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * The field delimiter for a locale. A comma can't be both the decimal
 * separator and the delimiter, so comma-decimal locales use `;` (the same
 * convention Excel follows). A tab always wins when the line has one, which
 * makes a spreadsheet paste work in every locale.
 */
export function bulkDelimiter(line: string, locale = "en-US"): string {
  if (line.includes("\t")) return "\t";
  if (localeSeparators(locale).decimal === ",") return ";";
  return line.includes(";") ? ";" : ",";
}

const isDigit = (ch: string | undefined) => !!ch && ch >= "0" && ch <= "9";

/**
 * Split one line into fields, honouring `"…"` quoting so a field may contain
 * the delimiter. A doubled `""` inside a quoted field is a literal quote.
 *
 * When the delimiter is a comma it is also the thousands separator, so a comma
 * sitting directly between two digits ("1,250.50") is grouping, not a field
 * break — a delimiter is written "…, next". Without this, "1,250.50, Rent"
 * would split into ["1", "250.50", "Rent"] and record an amount of 1.
 */
function splitFields(line: string, delimiter: string): string[] {
  const guardDigits = delimiter === ",";
  const fields: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (
      ch === delimiter &&
      !(guardDigits && isDigit(line[i - 1]) && isDigit(line[i + 1]))
    ) {
      fields.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

/**
 * Parse pasted text into transaction drafts.
 *
 * One transaction per line, delimiter-separated:
 *   amount, note, category, type, date
 *
 * The delimiter is a tab if the line has one, otherwise `;` for comma-decimal
 * locales (where `,` is the decimal point) and `,` elsewhere — see
 * `bulkDelimiter`. Wrap a field in `"…"` to include the delimiter in it.
 *
 * Only `amount` is required, and it is read with the user's locale separators.
 * A leading `-`/`+` on the amount sets the type (default: expense). The `type`
 * column (income/expense) overrides the sign. `date` defaults to `today`
 * (YYYY-MM-DD).
 *
 * Examples (en-US):
 *   12.50, Lunch, Food & Dining
 *   -40, Groceries, Groceries, expense, 2026-06-15
 *   +2000, June salary, Salary, income
 *   -12.50, "Lunch, with team", Food & Dining
 *
 * Examples (de-DE):
 *   -40,50; Lebensmittel; Groceries; expense; 2026-06-15
 */
export function parseBulk(
  input: string,
  today: string,
  locale = "en-US",
): BulkParseResult {
  const drafts: BulkDraft[] = [];
  const errors: BulkParseError[] = [];

  const lines = input.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return; // skip blanks/comments
    const lineNo = i + 1;

    const parts = splitFields(line, bulkDelimiter(line, locale));
    const [amountRaw = "", note = "", categoryName = "", typeRaw = "", dateRaw = ""] =
      parts;

    // Amount + sign. The sign is read off the raw field because it selects the
    // type; the magnitude comes from the locale-aware parser.
    const sign = amountRaw.match(/^\s*([+-])/)?.[1];
    const parsed = parseAmountInput(amountRaw, locale);
    if (parsed === null) {
      errors.push({ line: lineNo, raw, message: "Could not read an amount" });
      return;
    }
    const amount = Math.abs(parsed);
    if (amount <= 0) {
      errors.push({ line: lineNo, raw, message: "Amount must be a positive number" });
      return;
    }
    if (amount > 1_000_000_000) {
      errors.push({ line: lineNo, raw, message: "Amount is too large" });
      return;
    }

    // Type: explicit column > sign > default expense
    let type: "income" | "expense" = sign === "+" ? "income" : "expense";
    if (typeRaw) {
      const resolved = TYPE_ALIASES[typeRaw.toLowerCase()];
      if (!resolved) {
        errors.push({
          line: lineNo,
          raw,
          message: `Unknown type "${typeRaw}" (use income or expense)`,
        });
        return;
      }
      type = resolved;
    }

    // Date
    let occurredOn = today;
    if (dateRaw) {
      if (!isValidDate(dateRaw)) {
        errors.push({ line: lineNo, raw, message: `Invalid date "${dateRaw}"` });
        return;
      }
      occurredOn = dateRaw;
    }

    drafts.push({
      type,
      amount,
      note: note.slice(0, 280),
      categoryName: categoryName || null,
      occurredOn,
    });
  });

  return { drafts, errors };
}
