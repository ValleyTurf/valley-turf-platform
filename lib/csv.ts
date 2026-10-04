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

// Minimal RFC4180-ish CSV *parser* (the inverse direction of rowsToCsv
// above) -- handles quoted fields, embedded commas, doubled "" escapes,
// and embedded newlines inside quotes. Added for the QuickBooks
// historical import (lib/quickbooksImport.ts) since nothing in this file
// previously read CSV, only wrote it, and the standard library has
// nothing built in for this. No new dependency added since this is used
// by exactly one route.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n inside/outside quotes behaves the same.
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Flush the last field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
