export type BulkDraft = {
  type: "income" | "expense";
  amount: number; // major units, positive
  note: string;
  categoryName: string | null;
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
 * Parse pasted text into transaction drafts.
 *
 * One transaction per line, comma-separated:
 *   amount, note, category, type, date
 *
 * Only `amount` is required. A leading `-`/`+` on the amount sets the type
 * (default: expense). The `type` column (income/expense) overrides the sign.
 * `date` defaults to `today` (YYYY-MM-DD).
 *
 * Examples:
 *   12.50, Lunch, Food & Dining
 *   -40, Groceries, Groceries, expense, 2026-06-15
 *   +2000, June salary, Salary, income
 */
export function parseBulk(input: string, today: string): BulkParseResult {
  const drafts: BulkDraft[] = [];
  const errors: BulkParseError[] = [];

  const lines = input.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return; // skip blanks/comments
    const lineNo = i + 1;

    const parts = line.split(",").map((p) => p.trim());
    const [amountRaw = "", note = "", categoryName = "", typeRaw = "", dateRaw = ""] =
      parts;

    // Amount + sign
    const signMatch = amountRaw.match(/^([+-])?\s*([0-9].*)$/);
    if (!signMatch) {
      errors.push({ line: lineNo, raw, message: "Could not read an amount" });
      return;
    }
    const sign = signMatch[1];
    const amount = Number(signMatch[2].replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
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
