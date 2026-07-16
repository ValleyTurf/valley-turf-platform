export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type CategoryProfitability = {
  service_category: string;
  invoice_count: number | string;
  unlogged_count: number | string;
  total_revenue: number | string;
  total_direct_cost: number | string;
  total_overhead_allocated: number | string;
  total_estimated_profit: number | string;
  avg_revenue_per_job: number | string;
  avg_profit_per_job: number | string;
  profit_margin_pct: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(toNumber(value));
}

export default async function JobCostingAnalyticsPage() {
  const { data, error } = await supabaseServer
    .from("service_category_profitability")
    .select(
      `
        service_category,
        invoice_count,
        unlogged_count,
        total_revenue,
        total_direct_cost,
        total_overhead_allocated,
        total_estimated_profit,
        avg_revenue_per_job,
        avg_profit_per_job,
        profit_margin_pct
      `
    )
    .order("total_estimated_profit", { ascending: false });

  const categories = (data ?? []) as CategoryProfitability[];

  const totals = categories.reduce(
    (acc, category) => ({
      revenue: acc.revenue + toNumber(category.total_revenue),
      directCost: acc.directCost + toNumber(category.total_direct_cost),
      overhead: acc.overhead + toNumber(category.total_overhead_allocated),
      profit: acc.profit + toNumber(category.total_estimated_profit),
      invoices: acc.invoices + toNumber(category.invoice_count),
      unlogged: acc.unlogged + toNumber(category.unlogged_count),
    }),
    { revenue: 0, directCost: 0, overhead: 0, profit: 0, invoices: 0, unlogged: 0 }
  );

  const overallMargin =
    totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const unloggedRate =
    totals.invoices > 0 ? totals.unlogged / totals.invoices : 0;

  const maxProfit = Math.max(
    1,
    ...categories.map((c) => Math.abs(toNumber(c.total_estimated_profit)))
  );

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

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Analytics could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : categories.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No invoice data found yet.
            </p>
          </section>
        ) : (
          <>
            {unloggedRate > 0.5 && (
              <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
                <p className="font-bold">
                  Heads up — most invoices have no logged costs yet
                </p>
                <p className="mt-1 text-sm">
                  {formatNumber(totals.unlogged)} of {formatNumber(totals.invoices)}{" "}
                  invoices ({(unloggedRate * 100).toFixed(0)}%) have no
                  material, labor, or fuel logged against them. Profit
                  numbers below only reflect overhead so far for those —
                  they'll get more accurate as you log usage on{" "}
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
                Ranked by total estimated profit, highest to lowest.
              </p>

              <div className="mt-7 space-y-4">
                {categories.map((category) => {
                  const profit = toNumber(category.total_estimated_profit);
                  const isNegative = profit < 0;
                  const barWidth = Math.max(
                    2,
                    (Math.abs(profit) / maxProfit) * 100
                  );
                  const unlogged = toNumber(category.unlogged_count);
                  const invoiceCount = toNumber(category.invoice_count);
                  const unloggedPct =
                    invoiceCount > 0 ? (unlogged / invoiceCount) * 100 : 0;

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
                            {formatCurrency(profit)}
                          </p>
                          <p className="text-sm text-[#6b705c]">
                            {category.profit_margin_pct !== null
                              ? `${toNumber(category.profit_margin_pct).toFixed(1)}% margin`
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
                            {formatCurrency(category.total_overhead_allocated)}
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
