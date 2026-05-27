/**
 * Minimal CSV parser. The Sharma 2024 files are well-formed (no embedded
 * commas, no quoting), so we just split on lines and commas.
 *
 * Returns rows keyed by header name. A BOM at the start of the file is
 * stripped from the first header.
 */
export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    if (cells.length !== headers.length) continue;
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cells[j];
    rows.push(row);
  }
  return rows;
}
