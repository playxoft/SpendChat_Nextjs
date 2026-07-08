export type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  const s = value == null ? "" : String(value);
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
