import { describe, expect, it } from "vitest";
import {
  buildMonthlyTotals,
  buildSeasonalityGrid,
  buildMonthlyYoyComparison,
  buildYtdComparison,
  calculatePercentChange,
  distinctYears,
  type InvoiceCostRow,
} from "./seasonalTrends";

function row(
  issue_date: string | null,
  revenue: number,
  direct_cost: number,
  overhead_allocated: number,
  estimated_profit: number
): InvoiceCostRow {
  return { issue_date, revenue, direct_cost, overhead_allocated, estimated_profit };
}

describe("buildMonthlyTotals", () => {
  it("groups rows by year and month, summing figures", () => {
    const rows = [
      row("2025-06-01", 1000, 400, 100, 500),
      row("2025-06-15", 2000, 800, 200, 1000),
      row("2025-07-02", 500, 200, 50, 250),
    ];

    const totals = buildMonthlyTotals(rows);

    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({
      year: 2025,
      month: 6,
      monthKey: "2025-06",
      revenue: 3000,
      directCost: 1200,
      overhead: 300,
      profit: 1500,
      invoiceCount: 2,
      marginPct: 50,
    });
    expect(totals[1]).toMatchObject({ year: 2025, month: 7, revenue: 500 });
  });

  it("sorts ascending by month key regardless of input order", () => {
    const rows = [row("2025-12-01", 1, 0, 0, 1), row("2024-01-01", 1, 0, 0, 1)];

    const totals = buildMonthlyTotals(rows);

    expect(totals.map((t) => t.monthKey)).toEqual(["2024-01", "2025-12"]);
  });

  it("skips rows with no issue_date", () => {
    const rows = [row(null, 100, 0, 0, 100), row("2025-01-01", 50, 0, 0, 50)];

    expect(buildMonthlyTotals(rows)).toHaveLength(1);
  });

  it("returns null margin when revenue is zero", () => {
    const totals = buildMonthlyTotals([row("2025-01-01", 0, 0, 0, 0)]);

    expect(totals[0].marginPct).toBeNull();
  });

  it("returns an empty array for no rows", () => {
    expect(buildMonthlyTotals([])).toEqual([]);
  });
});

describe("distinctYears", () => {
  it("returns sorted unique years", () => {
    const totals = buildMonthlyTotals([
      row("2025-01-01", 1, 0, 0, 1),
      row("2023-01-01", 1, 0, 0, 1),
      row("2024-06-01", 1, 0, 0, 1),
      row("2024-07-01", 1, 0, 0, 1),
    ]);

    expect(distinctYears(totals)).toEqual([2023, 2024, 2025]);
  });
});

describe("buildSeasonalityGrid", () => {
  it("produces 12 month rows with one entry per year, zero-filled where absent", () => {
    const totals = buildMonthlyTotals([
      row("2024-03-01", 1000, 0, 0, 400),
      row("2025-03-01", 1500, 0, 0, 600),
    ]);

    const { years, rows } = buildSeasonalityGrid(totals);

    expect(years).toEqual([2024, 2025]);
    expect(rows).toHaveLength(12);

    const march = rows.find((r) => r.month === 3)!;
    expect(march.monthLabel).toBe("Mar");
    expect(march.years).toEqual([
      { year: 2024, revenue: 1000, profit: 400, marginPct: 40, invoiceCount: 1 },
      { year: 2025, revenue: 1500, profit: 600, marginPct: 40, invoiceCount: 1 },
    ]);

    const january = rows.find((r) => r.month === 1)!;
    expect(january.years).toEqual([
      { year: 2024, revenue: 0, profit: 0, marginPct: null, invoiceCount: 0 },
      { year: 2025, revenue: 0, profit: 0, marginPct: null, invoiceCount: 0 },
    ]);
  });

  it("handles no data at all", () => {
    const { years, rows } = buildSeasonalityGrid([]);

    expect(years).toEqual([]);
    expect(rows).toHaveLength(12);
    expect(rows[0].years).toEqual([]);
  });
});

describe("calculatePercentChange", () => {
  it("computes a normal percent change", () => {
    expect(calculatePercentChange(150, 100)).toBeCloseTo(0.5);
    expect(calculatePercentChange(50, 100)).toBeCloseTo(-0.5);
  });

  it("returns 0 when both current and previous are zero", () => {
    expect(calculatePercentChange(0, 0)).toBe(0);
  });

  it("returns null when previous is zero but current is not (new, not infinite growth)", () => {
    expect(calculatePercentChange(100, 0)).toBeNull();
  });
});

describe("buildMonthlyYoyComparison", () => {
  it("pairs each month of the current year with the same month a year earlier", () => {
    const totals = buildMonthlyTotals([
      row("2024-01-01", 1000, 0, 0, 200),
      row("2025-01-01", 1500, 0, 0, 450),
      row("2025-02-01", 800, 0, 0, 100),
    ]);

    const yoy = buildMonthlyYoyComparison(totals, 2025, 2024);

    expect(yoy).toHaveLength(12);

    const jan = yoy.find((r) => r.month === 1)!;
    expect(jan.currentRevenue).toBe(1500);
    expect(jan.previousRevenue).toBe(1000);
    expect(jan.revenueChangePct).toBeCloseTo(0.5);
    expect(jan.currentMarginPct).toBeCloseTo(30);
    expect(jan.previousMarginPct).toBeCloseTo(20);
    expect(jan.hasCurrentData).toBe(true);
    expect(jan.hasPreviousData).toBe(true);

    const feb = yoy.find((r) => r.month === 2)!;
    expect(feb.previousRevenue).toBe(0);
    expect(feb.hasPreviousData).toBe(false);
    expect(feb.revenueChangePct).toBeNull();

    const mar = yoy.find((r) => r.month === 3)!;
    expect(mar.hasCurrentData).toBe(false);
    expect(mar.hasPreviousData).toBe(false);
    expect(mar.revenueChangePct).toBe(0);
  });
});

describe("buildYtdComparison", () => {
  it("sums Jan-through-throughMonth for both years and compares them", () => {
    const totals = buildMonthlyTotals([
      row("2024-01-01", 1000, 0, 0, 200),
      row("2024-02-01", 1000, 0, 0, 200),
      row("2024-03-01", 1000, 0, 0, 200), // outside the window, excluded
      row("2025-01-01", 1200, 0, 0, 300),
      row("2025-02-01", 1300, 0, 0, 350),
      row("2025-03-01", 5000, 0, 0, 100), // outside the window, excluded
    ]);

    const ytd = buildYtdComparison(totals, 2025, 2024, 2);

    expect(ytd.throughMonth).toBe(2);
    expect(ytd.throughMonthLabel).toBe("Feb");
    expect(ytd.currentRevenue).toBe(2500);
    expect(ytd.previousRevenue).toBe(2000);
    expect(ytd.revenueChangePct).toBeCloseTo(0.25);
    expect(ytd.currentProfit).toBe(650);
    expect(ytd.previousProfit).toBe(400);
    expect(ytd.hasEnoughData).toBe(true);
  });

  it("flags hasEnoughData false when the previous year has nothing in the window", () => {
    const totals = buildMonthlyTotals([row("2025-01-01", 1000, 0, 0, 200)]);

    const ytd = buildYtdComparison(totals, 2025, 2024, 1);

    expect(ytd.hasEnoughData).toBe(false);
    expect(ytd.revenueChangePct).toBeNull();
  });

  it("clamps throughMonth to the valid 1-12 range", () => {
    const totals = buildMonthlyTotals([row("2025-01-01", 100, 0, 0, 50)]);

    expect(buildYtdComparison(totals, 2025, 2024, 0).throughMonth).toBe(1);
    expect(buildYtdComparison(totals, 2025, 2024, 15).throughMonth).toBe(12);
  });
});
