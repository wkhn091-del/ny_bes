const LRM = '\u200E';
const BOM = '\uFEFF';
/** Spreadsheet engines treat a leading = + - @ (and tab/CR, which some strip first) as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

export type CsvValue = string | number | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvValue;
  /**
   * Prefix with U+200E so codes, dates and IDs keep left-to-right order in a Hebrew sheet and are
   * not auto-converted (leading zeros, date reformatting). Leave off for amounts that must stay summable.
   */
  ltr?: boolean;
}

export function csvCell(value: CsvValue, ltr = false): string {
  if (value === null || value === undefined) return '""';
  let text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  text = text.replace(/\r\n?|\n/g, ' ');
  if (FORMULA_START.test(text) && typeof value !== 'number') text = `'${text}`;
  if (ltr && text !== '') text = LRM + text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** RFC 4180 with CRLF line endings and a UTF-8 BOM so Excel opens Hebrew correctly. */
export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row), c.ltr)).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
