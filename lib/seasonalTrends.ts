// Pure calculation helpers for Seasonal / Year-over-Year trend analytics
// (Job Costing Analytics > Seasonal Trends). Deliberately has zero
// dependency on lib/supabase-server.ts — same reasoning as
// lib/permissionRules.ts: keeps this file trivially unit-testable, and
// safe to import from anywhere without dragging in a DB client. The page
// itself fetches invoice_cost_breakdown rows (same view and same paging
// pattern already used on /job-costing-analytics) and passes them in here.

export type InvoiceCostRow = {
  issue_date: string | null;
  revenue: number | string | null | undefined;
  direct_cost: number | string | null | undefined;
  overhead_allocated: number | string | null | undefined;
  estimated_profit: number | string | null | undefined;
};

export type MonthlyTotals = {
  year: number;
  month: number; // 1-12
  monthKey: string; // "YYYY-MM"
  revenue: number;
  directCost: number;
  overhead: number;
  profit: number;
  marginPct: number | null;
  invoiceCount: number;
};

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function marginPercent(profit: number, revenue: number): number | null {
  return revenue > 0 ? (profit / revenue) * 100 : null;
}

// Groups raw invoice-cost rows into one totals bucket per calendar month
// (year + month), sorted oldest to newest. Rows with no issue_date are
// skipped — there's no month to attribute them to.
export function buildMonthlyTotals(rows: InvoiceCostRow[]): MonthlyTotals[] {
  const map = new Map<
    string,
    Omit<MonthlyTotals, "monthKey" | "marginPct">
  >();

  for (const row of rows) {
    if (!row.issue_date) continue;

    const year = Number(row.issue_date.slice(0, 4));
    const month = Number(row.issue_date.slice(5, 7));

    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;

    const key = `${year}-${String(month).padStart(2, "0")}`;

    const existing = map.get(key) ?? {
      year,
      month,
      revenue: 0,
      directCost: 0,
      overhead: 0,
      profit: 0,
      invoiceCount: 0,
    };

    existing.revenue += toNumber(row.revenue);
    existing.directCost += toNumber(row.direct_cost);
    existing.overhead += toNumber(row.overhead_allocated);
    existing.profit += toNumber(row.estimated_profit);
    existing.invoiceCount += 1;

    map.set(key, existing);
  }

  return Array.from(map.entries())
    .map(([monthKey, totals]) => ({
      ...totals,
      monthKey,
      marginPct: marginPercent(totals.profit, totals.revenue),
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

// Distinct years present in the data, ascending.
export function distinctYears(monthlyTotals: MonthlyTotals[]): number[] {
  return Array.from(new Set(monthlyTotals.map((m) => m.year))).sort(
    (a, b) => a - b
  );
}

export type SeasonalityYearPoint = {
  year: number;
  revenue: number;
  profit: number;
  marginPct: number | null;
  invoiceCount: number;
};

export type SeasonalityMonthRow = {
  month: number; // 1-12
  monthLabel: string;
  years: SeasonalityYearPoint[];
};

// Reshapes monthly totals into "one row per calendar month, one column per
// year" so a page can render Jan..Dec with a bar/series per year to make
// seasonal patterns visible. Years with no data for a given month still get
// an entry (zeroed out) so chart series stay aligned across all 12 months.
export function buildSeasonalityGrid(
  monthlyTotals: MonthlyTotals[]
): { years: number[]; rows: SeasonalityMonthRow[] } {
  const years = distinctYears(monthlyTotals);

  const byYearMonth = new Map<string, MonthlyTotals>();
  for (const bucket of monthlyTotals) {
    byYearMonth.set(`${bucket.year}-${bucket.month}`, bucket);
  }

  const rows: SeasonalityMonthRow[] = [];

  for (let month = 1; month <= 12; month++) {
    rows.push({
      month,
      monthLabel: MONTH_LABELS[month - 1],
      years: years.map((year) => {
        const bucket = byYearMonth.get(`${year}-${month}`);

        return {
          year,
          revenue: bucket?.revenue ?? 0,
          profit: bucket?.profit ?? 0,
          marginPct: bucket ? bucket.marginPct : null,
          invoiceCount: bucket?.invoiceCount ?? 0,
        };
      }),
    });
  }

  return { years, rows };
}

// Same null/zero handling used on /revenue for period-over-period deltas:
// no prior value at all reads as "New" rather than a misleading -100%/+Inf.
export function calculatePercentChange(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return (current - previous) / previous;
}

export type MonthlyYoyRow = {
  month: number;
  monthLabel: string;
  currentYear: number;
  previousYear: number;
  currentRevenue: number;
  previousRevenue: number;
  revenueChangePct: number | null;
  currentProfit: number;
  previousProfit: number;
  profitChangePct: number | null;
  currentMarginPct: number | null;
  previousMarginPct: number | null;
  hasCurrentData: boolean;
  hasPreviousData: boolean;
};

// Month-by-month (Jan..Dec) comparison of one year against the year before
// it — the core "same month, one year apart" view.
export function buildMonthlyYoyComparison(
  monthlyTotals: MonthlyTotals[],
  currentYear: number,
  previousYear: number
): MonthlyYoyRow[] {
  const byYearMonth = new Map<string, MonthlyTotals>();
  for (const bucket of monthlyTotals) {
    byYearMonth.set(`${bucket.year}-${bucket.month}`, bucket);
  }

  const rows: MonthlyYoyRow[] = [];

  for (let month = 1; month <= 12; month++) {
    const current = byYearMonth.get(`${currentYear}-${month}`);
    const previous = byYearMonth.get(`${previousYear}-${month}`);

    const currentRevenue = current?.revenue ?? 0;
    const previousRevenue = previous?.revenue ?? 0;
    const currentProfit = current?.profit ?? 0;
    const previousProfit = previous?.profit ?? 0;

    rows.push({
      month,
      monthLabel: MONTH_LABELS[month - 1],
      currentYear,
      previousYear,
      currentRevenue,
      previousRevenue,
      revenueChangePct: calculatePercentChange(currentRevenue, previousRevenue),
      currentProfit,
      previousProfit,
      profitChangePct: calculatePercentChange(currentProfit, previousProfit),
      currentMarginPct: current ? current.marginPct : null,
      previousMarginPct: previous ? previous.marginPct : null,
      hasCurrentData: Boolean(current),
      hasPreviousData: Boolean(previous),
    });
  }

  return rows;
}

export type YtdComparison = {
  currentYear: number;
  previousYear: number;
  throughMonth: number; // 1-12, last month included on both sides
  throughMonthLabel: string;
  currentRevenue: number;
  previousRevenue: number;
  revenueChangePct: number | null;
  currentProfit: number;
  previousProfit: number;
  profitChangePct: number | null;
  currentMarginPct: number | null;
  previousMarginPct: number | null;
  hasEnoughData: boolean;
};

// Compares Jan-through-throughMonth of currentYear against the same
// Jan-through-throughMonth window of previousYear. Callers should pass the
// last *complete* calendar month as throughMonth (not the current, still-
// in-progress month) so a partial month never makes this look like a
// down year. hasEnoughData is false when previousYear has zero invoices
// in the window at all — not "no growth", just nothing to compare against.
export function buildYtdComparison(
  monthlyTotals: MonthlyTotals[],
  currentYear: number,
  previousYear: number,
  throughMonth: number
): YtdComparison {
  const clampedThroughMonth = Math.min(12, Math.max(1, throughMonth));

  let currentRevenue = 0;
  let previousRevenue = 0;
  let currentProfit = 0;
  let previousProfit = 0;
  let previousInvoiceCount = 0;

  for (const bucket of monthlyTotals) {
    if (bucket.month > clampedThroughMonth) continue;

    if (bucket.year === currentYear) {
      currentRevenue += bucket.revenue;
      currentProfit += bucket.profit;
    } else if (bucket.year === previousYear) {
      previousRevenue += bucket.revenue;
      previousProfit += bucket.profit;
      previousInvoiceCount += bucket.invoiceCount;
    }
  }

  return {
    currentYear,
    previousYear,
    throughMonth: clampedThroughMonth,
    throughMonthLabel: MONTH_LABELS[clampedThroughMonth - 1],
    currentRevenue,
    previousRevenue,
    revenueChangePct: calculatePercentChange(currentRevenue, previousRevenue),
    currentProfit,
    previousProfit,
    profitChangePct: calculatePercentChange(currentProfit, previousProfit),
    currentMarginPct: marginPercent(currentProfit, currentRevenue),
    previousMarginPct: marginPercent(previousProfit, previousRevenue),
    hasEnoughData: previousInvoiceCount > 0,
  };
}
