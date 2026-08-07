import { describe, expect, it } from "vitest";
import {
  deriveTransactionType,
  sortTransactionRows,
  filterTransactionRows,
  summarizeTransactions,
  getTransactionDateRange,
  type TransactionRow,
} from "./transactionFormatting";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "1",
    date: "2026-08-01",
    clientId: "c1",
    clientName: "Alice",
    type: "Payment",
    method: "Credit Card",
    invoiceId: "i1",
    invoiceNumber: "1001",
    jobberWebUri: null,
    amount: 100,
    tip: 0,
    fee: 3,
    ...overrides,
  };
}

describe("deriveTransactionType", () => {
  it("labels a blank/null adjustment as a plain Payment", () => {
    expect(deriveTransactionType(null)).toBe("Payment");
    expect(deriveTransactionType("")).toBe("Payment");
    expect(deriveTransactionType("   ")).toBe("Payment");
  });

  it("humanizes snake_case and SCREAMING_SNAKE_CASE values", () => {
    expect(deriveTransactionType("refund")).toBe("Refund");
    expect(deriveTransactionType("REFUND")).toBe("Refund");
    expect(deriveTransactionType("partial_refund")).toBe("Partial Refund");
    expect(deriveTransactionType("SECURITY_DEPOSIT")).toBe("Security Deposit");
  });
});

describe("sortTransactionRows", () => {
  const rows = [
    row({ id: "a", clientName: "Charlie", date: "2026-08-03", amount: 50, tip: 5, fee: 1 }),
    row({ id: "b", clientName: "Alice", date: "2026-08-01", amount: 200, tip: 20, fee: 6 }),
    row({ id: "c", clientName: "Bob", date: "2026-08-02", amount: 100, tip: 0, fee: 3 }),
  ];

  it("sorts by date ascending and descending", () => {
    expect(sortTransactionRows(rows, "date", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortTransactionRows(rows, "date", "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by client name alphabetically", () => {
    expect(sortTransactionRows(rows, "client", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by amount, tip, and fee numerically", () => {
    expect(sortTransactionRows(rows, "amount", "desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortTransactionRows(rows, "tip", "desc").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortTransactionRows(rows, "fee", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the original array", () => {
    const original = [...rows];
    sortTransactionRows(rows, "amount", "asc");
    expect(rows).toEqual(original);
  });
});

describe("filterTransactionRows", () => {
  const rows = [
    row({ id: "a", clientName: "Alice Smith", type: "Payment", method: "Credit Card" }),
    row({ id: "b", clientName: "Bob Jones", type: "Refund", method: "Bank Payment" }),
    row({ id: "c", clientName: "Alicia Keys", type: "Payment", method: "Bank Payment" }),
  ];

  it("returns all rows when filters are 'all' or blank", () => {
    expect(filterTransactionRows(rows, { type: "all", method: "all", search: "" })).toHaveLength(3);
  });

  it("filters by exact type", () => {
    expect(filterTransactionRows(rows, { type: "Refund" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by exact method", () => {
    expect(filterTransactionRows(rows, { method: "Bank Payment" }).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("filters by case-insensitive customer name substring", () => {
    expect(filterTransactionRows(rows, { search: "alic" }).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("combines filters", () => {
    expect(
      filterTransactionRows(rows, { type: "Payment", method: "Bank Payment" }).map((r) => r.id)
    ).toEqual(["c"]);
  });
});

describe("summarizeTransactions", () => {
  it("sums amount/tip/fee and computes net", () => {
    const rows = [
      row({ amount: 100, tip: 10, fee: 3 }),
      row({ amount: 200, tip: 0, fee: 6 }),
    ];

    expect(summarizeTransactions(rows)).toEqual({
      count: 2,
      totalAmount: 300,
      totalTips: 10,
      totalFees: 9,
      netAmount: 291,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(summarizeTransactions([])).toEqual({
      count: 0,
      totalAmount: 0,
      totalTips: 0,
      totalFees: 0,
      netAmount: 0,
    });
  });
});

describe("getTransactionDateRange", () => {
  const today = new Date(Date.UTC(2026, 7, 15)); // Aug 15, 2026

  it("computes last-7-days inclusive of today", () => {
    const { startDate, endDate } = getTransactionDateRange("last-7-days", today);
    expect(startDate).toBe("2026-08-09");
    expect(endDate).toBe("2026-08-15");
  });

  it("computes this-month from the 1st through today", () => {
    const { startDate, endDate } = getTransactionDateRange("this-month", today);
    expect(startDate).toBe("2026-08-01");
    expect(endDate).toBe("2026-08-15");
  });

  it("computes last-month as the full previous calendar month", () => {
    const { startDate, endDate } = getTransactionDateRange("last-month", today);
    expect(startDate).toBe("2026-07-01");
    expect(endDate).toBe("2026-07-31");
  });

  it("computes ytd from Jan 1 through today", () => {
    const { startDate, endDate } = getTransactionDateRange("ytd", today);
    expect(startDate).toBe("2026-01-01");
    expect(endDate).toBe("2026-08-15");
  });

  it("swaps custom start/end if given in the wrong order", () => {
    const { startDate, endDate } = getTransactionDateRange(
      "custom",
      today,
      "2026-08-20",
      "2026-08-10"
    );
    expect(startDate).toBe("2026-08-10");
    expect(endDate).toBe("2026-08-20");
  });
});
