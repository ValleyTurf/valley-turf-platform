// Pure helpers for the Transactions page/CSV export — kept free of
// lib/supabase-server.ts (same isolation rule as lib/servicePricing.ts /
// lib/quotes.ts) so this is trivially unit-testable. lib/transactions.ts
// is the I/O counterpart that fetches rows and calls into this file.

export type TransactionRow = {
  id: string;
  date: string | null;
  clientId: string | null;
  clientName: string;
  type: string;
  method: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  jobberWebUri: string | null;
  amount: number;
  tip: number;
  fee: number;
};

export type TransactionSortField = "date" | "client" | "amount" | "tip" | "fee";
export type SortDirection = "asc" | "desc";

// Jobber's own adjustmentType values are inconsistent about casing/
// separators (seen: null for a plain payment, snake_case and
// SCREAMING_SNAKE_CASE for adjustments) — this normalizes whatever comes
// back into a readable label rather than hardcoding an enum this account
// may not exercise every value of. A blank/null value means a plain
// payment, which Jobber's own UI just labels "Payment".
export function deriveTransactionType(
  adjustmentType: string | null | undefined
): string {
  const trimmed = (adjustmentType ?? "").trim();

  if (!trimmed) {
    return "Payment";
  }

  return trimmed
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compareRows(
  a: TransactionRow,
  b: TransactionRow,
  field: TransactionSortField
): number {
  switch (field) {
    case "client":
      return a.clientName.localeCompare(b.clientName);
    case "amount":
      return a.amount - b.amount;
    case "tip":
      return a.tip - b.tip;
    case "fee":
      return a.fee - b.fee;
    case "date":
    default:
      return (a.date ?? "").localeCompare(b.date ?? "");
  }
}

export function sortTransactionRows(
  rows: TransactionRow[],
  field: TransactionSortField,
  direction: SortDirection
): TransactionRow[] {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, field));
  return direction === "asc" ? sorted : sorted.reverse();
}

export function filterTransactionRows(
  rows: TransactionRow[],
  {
    type,
    method,
    search,
  }: { type?: string; method?: string; search?: string }
): TransactionRow[] {
  let result = rows;

  if (type && type !== "all") {
    result = result.filter((row) => row.type === type);
  }

  if (method && method !== "all") {
    result = result.filter((row) => row.method === method);
  }

  const query = search?.trim().toLowerCase();
  if (query) {
    result = result.filter((row) =>
      row.clientName.toLowerCase().includes(query)
    );
  }

  return result;
}

export function summarizeTransactions(rows: TransactionRow[]): {
  count: number;
  totalAmount: number;
  totalTips: number;
  totalFees: number;
  netAmount: number;
} {
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalAmount += row.amount;
      acc.totalTips += row.tip;
      acc.totalFees += row.fee;
      return acc;
    },
    { totalAmount: 0, totalTips: 0, totalFees: 0 }
  );

  return {
    count: rows.length,
    totalAmount: totals.totalAmount,
    totalTips: totals.totalTips,
    totalFees: totals.totalFees,
    netAmount: totals.totalAmount - totals.totalFees,
  };
}

export type TransactionTimeframe =
  | "last-7-days"
  | "last-30-days"
  | "last-month"
  | "this-month"
  | "last-90-days"
  | "ytd"
  | "custom";

export function isTransactionTimeframe(
  value: string | undefined
): value is TransactionTimeframe {
  return [
    "last-7-days",
    "last-30-days",
    "last-month",
    "this-month",
    "last-90-days",
    "ytd",
    "custom",
  ].includes(value ?? "");
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Self-contained copy of the same date-range-preset logic Revenue uses
// (app/(platform)/revenue/page.tsx's getDateRange) rather than importing
// from that page — a page file isn't a stable import target, and this
// version needs to be pure/importable from a test file with no
// Next.js-page baggage attached.
export function getTransactionDateRange(
  timeframe: TransactionTimeframe,
  today: Date,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string } {
  let start = new Date(today);
  let end = new Date(today);

  if (timeframe === "last-7-days") {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (timeframe === "last-30-days") {
    start.setUTCDate(start.getUTCDate() - 29);
  } else if (timeframe === "last-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "this-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  } else if (timeframe === "last-90-days") {
    start.setUTCDate(start.getUTCDate() - 89);
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "custom") {
    const parsedStart = customStart ? new Date(`${customStart}T00:00:00Z`) : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T00:00:00Z`) : null;

    if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }

    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }

    if (start > end) {
      [start, end] = [end, start];
    }
  }

  return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
}
