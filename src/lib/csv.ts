export type Cell = string | number | null | undefined;

/**
 * Characters that make Excel/Sheets treat a cell as a formula rather than text.
 * A user-supplied title like `=cmd|'/c calc'!A1` would otherwise execute when
 * the export is opened — and in a shared workspace the author and the person
 * opening the file aren't the same person.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * A plain number is never a formula, so signed amounts ("-40.00") must stay
 * untouched — prefixing those would corrupt every expense row in the export.
 */
const NUMERIC = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

function escapeCell(value: Cell): string {
  const s = value == null ? "" : String(value);
  // Neutralise formulas with a leading apostrophe (the standard mitigation) and
  // always quote those cells so the apostrophe survives the round-trip.
  if (FORMULA_START.test(s) && !NUMERIC.test(s)) {
    return `"'${s.replace(/"/g, '""')}"`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV document (RFC 4180-ish, CRLF line endings). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  return lines.join("\r\n");
}

/** Join arbitrary (possibly ragged) rows into a CSV document — used for report
 * exports that mix a metadata header, the data table, totals, and a footer. */
export function rowsToCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
