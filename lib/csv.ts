// Converts an array of row objects into CSV text for the data-backup
// export. Column order is the union of keys across every row (in
// first-seen order) so it still produces a sane header even if a table's
// rows don't all share identical keys.

type PlainRecord = Record<string, unknown>;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function rowsToCsv(rows: PlainRecord[]): string {
  if (rows.length === 0) {
    return "";
  }

  const columns: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [columns.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }

  return lines.join("\r\n");
}
