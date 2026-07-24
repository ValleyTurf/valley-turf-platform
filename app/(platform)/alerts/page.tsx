export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import {
  toNumber,
  formatCurrency,
  formatNumber,
} from "@/lib/format";

type CustomerAlert = {
  jobber_client_id: string;
  customer_name: string | null;
  invoice_count: number | string;
  total_revenue: number | string;
  total_estimated_profit: number | string;
};

type CategoryAlert = {
  service_category: string;
  invoice_count: number | string;
  total_revenue: number | string;
  total_estimated_profit: number | string;
  profit_margin_pct: number | string | null;
};

const THIN_MARGIN_THRESHOLD = 15;

export default async function AlertsPage() {
  const [customerResult, categoryResult] = await Promise.all([
    supabaseServer
      .from("customer_profit_summary")
      .select(
        "jobber_client_id, customer_name, invoice_count, total_revenue, total_estimated_profit"
      )
      .lt("total_estimated_profit", 0)
      .order("total_estimated_profit", { ascending: true }),

    supabaseServer
      .from("service_category_profitability")
      .select(
        "service_category, invoice_count, total_revenue, total_estimated_profit, profit_margin_pct"
      )
      .order("total_estimated_profit", { ascending: true }),
  ]);

  const customerAlerts = (customerResult.data ?? []) as CustomerAlert[];
  const allCategories = (categoryResult.data ?? []) as CategoryAlert[];

  const lossCategories = allCategories.filter(
    (c) => toNumber(c.total_estimated_profit) < 0
  );

  const thinMarginCategories = allCategories.filter((c) => {
    const profit = toNumber(c.total_estimated_profit);
    const margin = c.profit_margin_pct !== null ? toNumber(c.profit_margin_pct) : null;

    return profit >= 0 && margin !== null && margin < THIN_MARGIN_THRESHOLD;
  });

  const hasAnyAlerts =
    customerAlerts.length > 0 ||
    lossCategories.length > 0 ||
    thinMarginCategories.length > 0;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">Profitability Alerts</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Customers and service categories running at a loss or on a
              thin margin, based on revenue minus direct costs and
              allocated overhead.
            </p>
          </div>

          <Link
            href="/job-costing-analytics"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Full Job Costing Analytics
          </Link>
        </header>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
          <p className="text-sm">
            These numbers only reflect costs that have actually been logged
            on{" "}
            <Link href="/job-costs" className="font-semibold underline">
              /job-costs
            </Link>
            . A customer or category with little logged usage may look more
            profitable than it really is — keep that in mind before acting
            on anything below.
          </p>
        </section>

        {!hasAnyAlerts ? (
          <section className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
            <p className="text-2xl">✅</p>
            <p className="mt-2 font-bold text-green-800">
              No profitability concerns right now
            </p>
            <p className="mt-1 text-sm text-green-700">
              No customers are running at a loss, and every service category
              is above a {THIN_MARGIN_THRESHOLD}% margin.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-6 rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">
                Customers Running at a Loss
              </h2>

              <p className="mt-1 text-[#6b705c]">
                Lifetime revenue minus direct costs and overhead comes out
                negative.
              </p>

              <div className="mt-6 space-y-3">
                {customerAlerts.length === 0 ? (
                  <p className="rounded-2xl bg-green-50 p-5 text-green-800">
                    No customers currently running at a loss.
                  </p>
                ) : (
                  customerAlerts.map((customer) => (
                    <Link
                      key={customer.jobber_client_id}
                      href={`/customers/${encodeURIComponent(
                        customer.jobber_client_id
                      )}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 transition hover:border-red-400"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold">
                          {customer.customer_name || "Unnamed Customer"}
                        </p>
                        <p className="mt-1 text-sm text-[#6b705c]">
                          {formatNumber(customer.invoice_count)} invoices ·{" "}
                          {formatCurrency(customer.total_revenue)} revenue
                        </p>
                      </div>

                      <p className="shrink-0 text-xl font-bold text-red-700">
                        {formatCurrency(customer.total_estimated_profit)}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">
                Service Categories Running at a Loss
              </h2>

              <div className="mt-6 space-y-3">
                {lossCategories.length === 0 ? (
                  <p className="rounded-2xl bg-green-50 p-5 text-green-800">
                    No service categories currently running at a loss.
                  </p>
                ) : (
                  lossCategories.map((category) => (
                    <div
                      key={category.service_category}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold">
                          {category.service_category}
                        </p>
                        <p className="mt-1 text-sm text-[#6b705c]">
                          {formatNumber(category.invoice_count)} invoices ·{" "}
                          {formatCurrency(category.total_revenue)} revenue
                        </p>
                      </div>

                      <p className="shrink-0 text-xl font-bold text-red-700">
                        {formatCurrency(category.total_estimated_profit)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">
                Thin-Margin Service Categories
              </h2>

              <p className="mt-1 text-[#6b705c]">
                Profitable, but under a {THIN_MARGIN_THRESHOLD}% margin —
                worth keeping an eye on.
              </p>

              <div className="mt-6 space-y-3">
                {thinMarginCategories.length === 0 ? (
                  <p className="rounded-2xl bg-green-50 p-5 text-green-800">
                    No categories currently sitting on a thin margin.
                  </p>
                ) : (
                  thinMarginCategories.map((category) => (
                    <div
                      key={category.service_category}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold">
                          {category.service_category}
                        </p>
                        <p className="mt-1 text-sm text-[#6b705c]">
                          {formatNumber(category.invoice_count)} invoices ·{" "}
                          {formatCurrency(category.total_revenue)} revenue
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xl font-bold text-amber-800">
                          {formatCurrency(category.total_estimated_profit)}
                        </p>
                        <p className="text-sm text-amber-700">
                          {category.profit_margin_pct !== null
                            ? `${toNumber(category.profit_margin_pct).toFixed(1)}% margin`
                            : "— margin"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
