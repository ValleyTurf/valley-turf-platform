export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  buildMonthlyTotals,
  buildSeasonalityGrid,
  buildMonthlyYoyComparison,
  buildYtdComparison,
  distinctYears,
  type InvoiceCostRow,
} from "@/lib/seasonalTrends";

// Same shape/paging approach as fetchAllInvoiceCosts on
// /job-costing-analytics — kept local rather than shared because the two
// pages want different columns in principle even though today they
// happen to match (see lib/format.ts's note on not forcing duplication
// into a shared shape before there's a second real caller that needs it).
async function fetchAllInvoiceCosts(): Promise<InvoiceCostRow[]> {
  const pageSize = 1000;
  const rows: InvoiceCostRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_cost_breakdown")
      .select(
        "issue_date, revenue, direct_cost, overhead_allocated, estimated_profit"
      )
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as InvoiceCostRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
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

function changeClasses(change: number | null): string {
  if (change === null) return "bg-blue-50 text-blue-800";
  if (change > 0) return "bg-green-50 text-green-800";
  if (change < 0) return "bg-red-50 text-red-800";

  return "bg-[#f7f6f1] text-[#6b705c]";
}

function formatChange(change: number | null): string {
  if (change === null) return "New";
  if (change > 0) return `↑ ${formatPercent(Math.abs(change))}`;
  if (change < 0) return `↓ ${formatPercent(Math.abs(change))}`;

  return "No change";
}

function formatMarginPct(value: number | null): string {
  return value !== null ? `${value.toFixed(1)}%` : "—";
}

const YEAR_COLORS = ["#d8d3c6", "#9c7a20", "#d4af37", "#174734"];

export default async function SeasonalTrendsPage() {
  let allRows: InvoiceCostRow[] = [];
  let fetchError: string | null = null;

  try {
    allRows = await fetchAllInvoiceCosts();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  const monthlyTotals = buildMonthlyTotals(allRows);
  const years = distinctYears(monthlyTotals);

  const today = getPhoenixToday();
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1; // 1-12

  // "Year to date" compares Jan-through-last-fully-completed-month, so an
  // in-progress current month never makes this look like a down year
  // just because it isn't over yet.
  const ytdCurrentYear = todayYear;
  const ytdPreviousYear = todayYear - 1;
  const throughMonth = todayMonth - 1;
  const ytd =
    throughMonth >= 1
      ? buildYtdComparison(
          monthlyTotals,
          ytdCurrentYear,
          ytdPreviousYear,
          throughMonth
        )
      : null;

  // The month-by-month table and seasonality chart use the two most
  // recent years that actually have invoice data, which may lag behind
  // the calendar if data hasn't synced yet or the business is brand new.
  const latestDataYear = years.length > 0 ? years[years.length - 1] : null;
  const priorDataYear = years.length > 1 ? years[years.length - 2] : null;

  const monthlyYoy =
    latestDataYear !== null && priorDataYear !== null
      ? buildMonthlyYoyComparison(monthlyTotals, latestDataYear, priorDataYear)
      : [];

  const chartYears = years.slice(-3);
  const chartYearColors = YEAR_COLORS.slice(-chartYears.length);
  const { rows: seasonalityRows } = buildSeasonalityGrid(monthlyTotals);
  const maxMonthlyRevenue = Math.max(
    1,
    ...seasonalityRows.flatMap((row) =>
      row.years
        .filter((y) => chartYears.includes(y.year))
        .map((y) => y.revenue)
    )
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Seasonal Trends
          </h1>
        </header>

        {fetchError ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Trends could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{fetchError}</p>
          </section>
        ) : monthlyTotals.length === 0 ? (
          <section className="mt-8 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No dated invoice data found yet. Once invoices with a
              logged issue date come in, monthly and year-over-year
              trends will show up here automatically.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl bg-[#174734] p-5 text-white shadow sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d4af37]">
                Year to Date vs Same Period Last Year
              </p>

              {ytd === null ? (
                <p className="mt-3 text-white/80">
                  Not enough of {ytdCurrentYear} has happened yet to make
                  a fair year-over-year comparison.
                </p>
              ) : !ytd.hasEnoughData ? (
                <>
                  <h2 className="mt-2 text-2xl font-bold">
                    Jan 1 – {ytd.throughMonthLabel} {ytdCurrentYear}
                  </h2>
                  <p className="mt-2 text-white/80">
                    {formatCurrency(ytd.currentRevenue)} in revenue so far,
                    but there&apos;s no {ytdPreviousYear} data in the same
                    window yet to compare against. This comparison will
                    populate automatically once it does.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-2 text-2xl font-bold">
                    Jan 1 – {ytd.throughMonthLabel} {ytdCurrentYear} vs{" "}
                    {ytdPreviousYear}
                  </h2>

                  <div className="mt-6 grid gap-5 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-white/60">Revenue</p>
                      <p className="mt-1 text-3xl font-bold">
                        {formatCurrency(ytd.currentRevenue)}
                      </p>
                      <p className="mt-1 text-sm text-white/70">
                        vs {formatCurrency(ytd.previousRevenue)} last year
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${changeClasses(
                          ytd.revenueChangePct
                        )}`}
                      >
                        {formatChange(ytd.revenueChangePct)}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm text-white/60">
                        Estimated Profit
                      </p>
                      <p className="mt-1 text-3xl font-bold">
                        {formatCurrency(ytd.currentProfit)}
                      </p>
                      <p className="mt-1 text-sm text-white/70">
                        vs {formatCurrency(ytd.previousProfit)} last year
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${changeClasses(
                          ytd.profitChangePct
                        )}`}
                      >
                        {formatChange(ytd.profitChangePct)}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm text-white/60">Margin</p>
                      <p className="mt-1 text-3xl font-bold">
                        {formatMarginPct(ytd.currentMarginPct)}
                      </p>
                      <p className="mt-1 text-sm text-white/70">
                        vs {formatMarginPct(ytd.previousMarginPct)} last
                        year
                      </p>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
              <h2 className="text-2xl font-bold">Revenue by Month</h2>
              <p className="mt-1 text-[#6b705c]">
                {chartYears.length > 1
                  ? `Comparing ${chartYears.join(", ")} — overlapping seasonal patterns show up as bars lining up in the same months.`
                  : `${chartYears[0] ?? "—"} so far. Add another year of data to see seasonal patterns line up.`}
              </p>

              <div className="mt-7 flex flex-wrap gap-4 text-sm">
                {chartYears.map((year, index) => (
                  <div key={year} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: chartYearColors[index] }}
                    />
                    <span>{year}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-end gap-3 overflow-x-auto pb-2">
                {seasonalityRows.map((row) => (
                  <div
                    key={row.month}
                    className="flex min-w-[64px] flex-col items-center gap-2"
                  >
                    <div className="flex h-48 items-end gap-1">
                      {row.years
                        .filter((y) => chartYears.includes(y.year))
                        .map((y, index) => (
                          <div
                            key={y.year}
                            className="w-3 rounded-t-sm sm:w-4"
                            style={{
                              height: `${Math.max(
                                y.revenue > 0 ? 2 : 0,
                                (y.revenue / maxMonthlyRevenue) * 100
                              )}%`,
                              backgroundColor: chartYearColors[index],
                            }}
                            title={`${y.year} ${row.monthLabel}: ${formatCurrency(
                              y.revenue
                            )}`}
                          />
                        ))}
                    </div>
                    <p className="text-xs font-semibold text-[#6b705c]">
                      {row.monthLabel}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
              <h2 className="text-2xl font-bold">Month-by-Month, Year over Year</h2>

              {latestDataYear === null || priorDataYear === null ? (
                <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                  Only one year of invoice data exists so far ({years[0]}
                  ). Once a second year comes in, this table will compare
                  the same month across both years.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[#6b705c]">
                    {latestDataYear} vs {priorDataYear}, the two most
                    recent years with invoice data.
                  </p>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#e7e2d5] text-[#6b705c]">
                          <th className="pb-2 pr-4">Month</th>
                          <th className="pb-2 pr-4">{latestDataYear} Revenue</th>
                          <th className="pb-2 pr-4">{priorDataYear} Revenue</th>
                          <th className="pb-2 pr-4">Change</th>
                          <th className="pb-2 pr-4">{latestDataYear} Margin</th>
                          <th className="pb-2 pr-4">{priorDataYear} Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyYoy.map((row) => (
                          <tr
                            key={row.month}
                            className="border-b border-[#f0eee6]"
                          >
                            <td className="py-2 pr-4 font-semibold">
                              {row.monthLabel}
                            </td>
                            <td className="py-2 pr-4">
                              {row.hasCurrentData
                                ? formatCurrency(row.currentRevenue)
                                : "—"}
                            </td>
                            <td className="py-2 pr-4">
                              {row.hasPreviousData
                                ? formatCurrency(row.previousRevenue)
                                : "—"}
                            </td>
                            <td className="py-2 pr-4">
                              {row.hasCurrentData || row.hasPreviousData ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${changeClasses(
                                    row.revenueChangePct
                                  )}`}
                                >
                                  {formatChange(row.revenueChangePct)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {formatMarginPct(row.currentMarginPct)}
                            </td>
                            <td className="py-2 pr-4">
                              {formatMarginPct(row.previousMarginPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
