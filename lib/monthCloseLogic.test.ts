import { describe, it, expect } from "vitest";
import {
  buildChecklist,
  closableMonths,
  diffSnapshot,
  isMonthOver,
  isValidMonth,
  monthRange,
  openItemCount,
} from "./monthCloseLogic";

const base = {
  month: "2026-10",
  bankRowsToReview: 0,
  depositsToMatch: 0,
  accounts: [{ name: "Checking", difference: 0.3 }],
  unpaidInvoices: { count: 0, total: 0 },
  failedCardCharges: 0,
};

describe("months", () => {
  it("validates month strings", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("26-10")).toBe(false);
    expect(isValidMonth(null)).toBe(false);
  });

  it("finds month ranges including leap years", () => {
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2028-02").end).toBe("2028-02-29");
    expect(monthRange("2026-12").end).toBe("2026-12-31");
  });

  it("lists closable months newest first across a year boundary", () => {
    expect(closableMonths("2026-01-15", 3)).toEqual(["2025-12", "2025-11", "2025-10"]);
    expect(closableMonths("2026-11-16", 2)).toEqual(["2026-10", "2026-09"]);
  });

  it("knows when a month is over", () => {
    expect(isMonthOver("2026-10", "2026-11-01")).toBe(true);
    expect(isMonthOver("2026-11", "2026-11-16")).toBe(false);
  });
});

describe("buildChecklist", () => {
  it("is all clear when nothing is open", () => {
    const items = buildChecklist(base);
    expect(openItemCount(items)).toBe(0);
  });

  it("flags unreviewed bank rows and unmatched deposits", () => {
    const items = buildChecklist({ ...base, bankRowsToReview: 3, depositsToMatch: 1 });
    expect(openItemCount(items)).toBe(2);
    expect(items[0].detail).toContain("3 bank charges");
    expect(items[1].detail).toContain("1 deposit ");
  });

  it("flags a balance gap over a dollar but not under", () => {
    const off = buildChecklist({
      ...base,
      accounts: [{ name: "Checking", difference: -25.5 }],
    });
    expect(off.find((i) => i.key === "balances")?.status).toBe("todo");
    expect(off.find((i) => i.key === "balances")?.detail).toContain("$25.50");

    const fine = buildChecklist(base);
    expect(fine.find((i) => i.key === "balances")?.status).toBe("ok");
  });

  it("treats a missing starting balance as info, not a blocker", () => {
    const items = buildChecklist({
      ...base,
      accounts: [{ name: "Checking", difference: null }],
    });
    expect(items.find((i) => i.key === "balances")?.status).toBe("info");
  });

  it("never blocks on unpaid invoices", () => {
    const items = buildChecklist({ ...base, unpaidInvoices: { count: 4, total: 900 } });
    expect(items.find((i) => i.key === "unpaid")?.status).toBe("info");
    expect(openItemCount(items)).toBe(0);
  });
});

describe("diffSnapshot", () => {
  const snap = {
    revenue: 1000,
    costOfService: 200,
    payroll: 300,
    operatingExpenses: 100,
    overhead: 50,
    netProfit: 350,
    invoiceCount: 10,
    expenseCount: 20,
  };

  it("reports nothing when unchanged", () => {
    expect(diffSnapshot(snap, snap)).toEqual([]);
  });

  it("reports changed fields only", () => {
    const changes = diffSnapshot(snap, { ...snap, revenue: 1100, netProfit: 450, expenseCount: 21 });
    expect(changes.map((c) => c.label)).toEqual(["Revenue", "Net profit", "Expense entries"]);
    expect(changes[0]).toEqual({ label: "Revenue", was: 1000, now: 1100 });
  });

  it("ignores sub-cent rounding noise", () => {
    expect(diffSnapshot(snap, { ...snap, revenue: 1000.001 })).toEqual([]);
  });
});
