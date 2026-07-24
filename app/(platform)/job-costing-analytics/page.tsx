export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import {
  toNumber,
  formatCurrency,
  formatNumber,
} from "@/lib/format";

type JobCostingAnalyticsProps = {
  searchParams: Promise<{
    timeframe?: string;
    start?: string;
    end?: string;
  }>;
};

type Timeframe =
  | "last-7-days"
  | "last-month"
  | "this-month"
  | "last-90-days"
  | "ytd"
  | "all-time"
  | "custom";

type InvoiceCostRow = {
  jobber_invoice_id: string;
  issue_date: string | null;
  revenue: number | string;
  direct_cost: number | string;
  overhead_allocated: number | string;
  estimated_profit: number | string;
  service_category: string | null;
};

type CategorySummary = {
  service_category: string;
  invoice_count: number;
  unlogged_count: number;
  total_revenue: number;
  total_direct_cost: number;
  total_overhead_allocated: number;
  total_estimated_profit: number;
  avg_revenue_per_job: number;
  avg_profit_per_job: number;
  profit_margin_pct: number | null;
};

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(
    parts.find((part) => part.type === "month")?.value ?? 1
  );
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function isTimeframe(value: string | undefined): value is Timeframe {
  return [
    "last-7-days",
    "last-month",
    "this-month",
    "last-90-days",
    "ytd",
    "all-time",
    "custom",
  ].includes(value ?? "");
}

function getDateRange(
  timeframe: Timeframe,
  customStart?: string,
  customEnd?: string
): { startDate: string | null; endDate: string; label: string } {
  const today = getPhoenixToday();
  let start: Date | null = new Date(today);
  let end = new Date(today);

  if (timeframe === "last-7-days") {
    start!.setUTCDate(start!.getUTCDate() - 6);
  } else if (timeframe === "last-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    );
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "this-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    );
  } else if (timeframe === "last-90-days") {
    start!.setUTCDate(start!.getUTCDate() - 89);
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "all-time") {
    start = null;
  } else if (timeframe === "custom") {
    const parsedStart = customStart
      ? new Date(`${customStart}T00:00:00Z`)
      : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T00:00:00Z`) : null;

    if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }

    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }

    if (start && start > end) {
      [start, end] = [end, start];
    }
  }

  const startDate = start ? formatDateInput(start) : null;
  const endDate = formatDateInput(end);

  const label = startDate
    ? `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`
    : `All time through ${formatDateLabel(endDate)}`;

  return { startDate, endDate, label };
}

function buildCategorySummaries(rows: InvoiceCostRow[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();

  for (const row of rows) {
    const category = row.service_category || "Uncategorized";
    const directCost = toNumber(row.direct_cost);

    const existing = map.get(category) ?? {
      service_category: category,
      invoice_count: 0,
      unlogged_count: 0,
      total_revenue: 0,
      total_direct_cost: 0,
      total_overhead_allocated: 0,
      total_estimated_profit: 0,
      avg_revenue_per_job: 0,
      avg_profit_per_job: 0,
      profit_margin_pct: null,
    };

    existing.invoice_count += 1;
    if (directCost === 0) existing.unlogged_count += 1;
    existing.total_revenue += toNumber(row.revenue);
    existing.total_direct_cost += directCost;
    existing.total_overhead_allocated += toNumber(row.overhead_allocated);
    existing.total_estimated_profit += toNumber(row.estimated_profit);

    map.set(category, existing);
  }

  return Array.from(map.values())
    .map((category) => ({
      ...category,
      avg_revenue_per_job:
        category.invoice_count > 0
          ? category.total_revenue / category.invoice_count
          : 0,
      avg_profit_per_job:
        category.invoice_count > 0
          ? category.total_estimated_profit / category.invoice_count
          : 0,
      profit_margin_pct:
        category.total_revenue > 0
          ? (category.total_estimated_profit / category.total_revenue) * 100
          : null,
    }))
    .sort((a, b) => b.total_estimated_profit - a.total_estimated_profit);
}

async function fetchInvoiceCosts(
  startDate: string | null,
  endDate: string
): Promise<InvoiceCostRow[]> {
  const pageSize = 1000;
  const rows: InvoiceCostRow[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabaseServer
      .from("invoice_cost_breakdown")
      .select(
        "jobber_invoice_id, issue_date, revenue, direct_cost, overhead_allocated, estimated_profit, service_category"
      )
      .lte("issue_date", endDate)
      .range(from, from + pageSize - 1);

    if (startDate) {
      query = query.gte("issue_date", startDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    const batch = (data ?? []) as InvoiceCostRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

export default async function JobCostingAnalyticsPage({
  searchParams,
}: JobCostingAnalyticsProps) {
  const params = await searchParams;
  const timeframe: Timeframe = isTimeframe(params.timeframe)
    ? params.timeframe
    : "all-time";

  const { startDate, endDate, label } = getDateRange(
    timeframe,
    params.start,
    params.end
  );

  const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
    { value: "last-7-days", label: "Last 7 Days" },
    { value: "last-month", label: "Last Month" },
    { value: "this-month", label: "This Month" },
    { value: "last-90-days", label: "Last 90 Days" },
    { value: "ytd", label: "YTD" },
    { value: "all-time", label: "All Time" },
    { value: "custom", label: "Custom" },
  ];

  let rows: InvoiceCostRow[] = [];
  let fetchError: string | null = null;

  try {
    rows = await fetchInvoiceCosts(startDate, endDate);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  const categories = buildCategorySummaries(rows);

  const totals = categories.reduce(
    (acc, category) => ({
      revenue: acc.revenue + category.total_revenue,
      directCost: acc.directCost + category.total_direct_cost,
      overhead: acc.overhead + category.total_overhead_allocated,
      profit: acc.profit + category.total_estimated_profit,
      invoices: acc.invoices + category.invoice_count,
      unlogged: acc.unlogged + category.unlogged_count,
    }),
    {
      revenue: 0,
      directCost: 0,
      overhead: 0,
      profit: 0,
      invoices: 0,
      unlogged: 0,
    }
  );

  const overallMargin =
    totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const unloggedRate =
    totals.invoices > 0 ? totals.unlogged / totals.invoices : 0;

  const maxProfit = Math.max(
    1,
    ...categories.map((c) => Math.abs(c.total_estimated_profit))
  );

  function buildUrl(overrides: Partial<{ timeframe: Timeframe }>): string {
    const p = new URLSearchParams();
    const nextTimeframe = overrides.timeframe ?? timeframe;
    p.set("timeframe", nextTimeframe);

    if (nextTimeframe === "custom") {
      if (params.start) p.set("start", params.start);
      if (params.end) p.set("end", params.end);
    }

    return `/job-costing-analytics?${p.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Job Costing Analytics
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Profitability by service category, combining revenue, direct
              costs (materials, labor, fuel), and allocated overhead.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/job-costs"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Log Job Costs
            </Link>

            <Link
              href="/revenue"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Financial Dashboard
            </Link>
          </div>
        </header>

        <section
          id="timeframe"
          className="mt-8 scroll-mt-6 rounded-3xl bg-white p-6 shadow"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                Timeframe
              </p>
              <h2 className="mt-1 text-2xl font-bold">{label}</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {timeframeOptions.map((option) => (
                <Link
                  key={option.value}
                  href={buildUrl({ timeframe: option.value })}
                  scroll={false}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                    timeframe === option.value
                      ? "bg-[#d4af37] text-[#174734]"
                      : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {timeframe === "custom" && (
            <form
              method="GET"
              action="/job-costing-analytics#timeframe"
              className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f7f6f1] p-4"
            >
              <input type="hidden" name="timeframe" value="custom" />

              <label className="text-sm font-semibold text-[#6b705c]">
                Start date
                <input
                  type="date"
                  name="start"
                  defaultValue={startDate ?? ""}
                  className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                />
              </label>

              <label className="text-sm font-semibold text-[#6b705c]">
                End date
                <input
                  type="date"
                  name="end"
                  defaultValue={endDate}
                  className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                />
              </label>

              <button
                type="submit"
                className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white"
              >
                Apply Dates
              </button>
            </form>
          )}
        </section>

        {fetchError ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Analytics could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{fetchError}</p>
          </section>
        ) : categories.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No invoice data found for this timeframe.
            </p>
          </section>
        ) : (
          <>
            {unloggedRate > 0.5 && (
              <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
                <p className="font-bold">
                  Heads up — most invoices in this period have no logged
                  costs yet
                </p>
                <p className="mt-1 text-sm">
                  {formatNumber(totals.unlogged)} of{" "}
                  {formatNumber(totals.invoices)} invoices (
                  {(unloggedRate * 100).toFixed(0)}%) have no material,
                  labor, or fuel logged against them. Profit numbers below
                  only reflect overhead so far for those — they'll get more
                  accurate as you log usage on{" "}
                  <Link href="/job-costs" className="font-semibold underline">
                    /job-costs
                  </Link>
                  .
                </p>
              </section>
            )}

            <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Total Revenue
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {formatCurrency(totals.revenue)}
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Total Direct + Overhead Cost
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {formatCurrency(totals.directCost + totals.overhead)}
                </p>
                <p className="mt-2 text-sm text-[#6b705c]">
                  {formatCurrency(totals.directCost)} direct,{" "}
                  {formatCurrency(totals.overhead)} overhead
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Estimated Profit
                </p>
                <p
                  className={`mt-3 text-3xl font-bold ${
                    totals.profit >= 0 ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {formatCurrency(totals.profit)}
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Overall Margin
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {overallMargin.toFixed(1)}%
                </p>
              </article>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">
                Profit by Service Category
              </h2>

              <p className="mt-1 text-[#6b705c]">
                Ranked by total estimated profit, highest to lowest, for{" "}
                {label}.
              </p>

              <div className="mt-7 space-y-4">
                {categories.map((category) => {
                  const isNegative = category.total_estimated_profit < 0;
                  const barWidth = Math.max(
                    2,
                    (Math.abs(category.total_estimated_profit) / maxProfit) *
                      100
                  );
                  const unloggedPct =
                    category.invoice_count > 0
                      ? (category.unlogged_count / category.invoice_count) *
                        100
                      : 0;

                  return (
                    <div
                      key={category.service_category}
                      className="rounded-2xl border border-[#e7e2d5] p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-bold">
                            {category.service_category}
                          </p>
                          <p className="mt-1 text-sm text-[#6b705c]">
                            {formatNumber(category.invoice_count)} invoices
                            {unloggedPct > 0 && (
                              <span className="text-[#9c7a20]">
                                {" "}
                                · {unloggedPct.toFixed(0)}% unlogged
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p
                            className={`text-2xl font-bold ${
                              isNegative ? "text-red-600" : "text-green-700"
                            }`}
                          >
                            {formatCurrency(category.total_estimated_profit)}
                          </p>
                          <p className="text-sm text-[#6b705c]">
                            {category.profit_margin_pct !== null
                              ? `${category.profit_margin_pct.toFixed(1)}% margin`
                              : "— margin"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#eeeae0]">
                        <div
                          className={`h-full rounded-full ${
                            isNegative ? "bg-red-500" : "bg-[#174734]"
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div>
                          <p className="text-[#6b705c]">Revenue</p>
                          <p className="font-semibold">
                            {formatCurrency(category.total_revenue)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[#6b705c]">Direct Cost</p>
                          <p className="font-semibold">
                            {formatCurrency(category.total_direct_cost)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[#6b705c]">Overhead</p>
                          <p className="font-semibold">
                            {formatCurrency(
                              category.total_overhead_allocated
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[#6b705c]">Avg / Job</p>
                          <p className="font-semibold">
                            {formatCurrency(category.avg_profit_per_job)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
