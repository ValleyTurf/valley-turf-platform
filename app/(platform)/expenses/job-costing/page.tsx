export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import ExpenseRowItem, { inputClasses, type ExpenseRow } from "../ExpenseRowItem";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
} from "@/lib/format";

// Ryan (2026-10-15): asked where the Job Costing Analytics "overhead"
// figure actually comes from -- there was nowhere to see it. That
// number (invoice_cost_breakdown.overhead_allocated, split evenly
// across the month's invoices -- see job-costing-analytics/page.tsx and
// supabase/migrations/033 + 094) is sourced from overhead_by_month,
// which pools FOUR things: the legacy overhead_costs table's recurring
// and amortized rows (managed on /materials, both $0 since Ryan
// end-dated them 12/31/2025 -- see migration 093's header), plus any
// /expenses row tagged with the Job Costing dropdown
// (CategoryAndJobCostingFields) as one-time or amortized. That second
// pair had no visible spot at all -- job_costing_treatment lived only
// inside each row's edit form, no badge, no filtered list -- so this
// page exists purely to make that pool's contents visible, the same
// way /expenses/journal makes ledger_type visible. Read-only summary
// numbers (sourced straight from overhead_by_month so they can never
// drift from what Job Costing Analytics actually uses) plus the real
// expense rows behind the two expense-based columns, reusing
// ExpenseRowItem so they stay editable in place.
type JobCostingPageProps = {
  searchParams: Promise<{ month?: string }>;
};

type OverheadByMonthRow = {
  month: string;
  recurring_overhead: number | string;
  amortized_overhead: number | string;
  expense_one_time_overhead: number | string;
  expense_amortized_overhead: number | string;
  total_overhead: number | string;
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const nextMonth = new Date(year, m, 1);
  const end = nextMonth.toISOString().slice(0, 10);

  return { start, end };
}

export default async function JobCostingOverheadPage({
  searchParams,
}: JobCostingPageProps) {
  const params = await searchParams;
  const month = params.month || currentMonth();
  const { start, end } = monthBounds(month);

  const { data: overheadData, error: overheadError } = await supabaseServer
    .from("overhead_by_month")
    .select(
      "month, recurring_overhead, amortized_overhead, expense_one_time_overhead, expense_amortized_overhead, total_overhead"
    )
    .eq("month", month)
    .maybeSingle();

  const overhead = overheadData as OverheadByMonthRow | null;

  const { data, error: expensesError } = await supabaseServer
    .from("expenses")
    .select(
      "id, vendor, description, category, ledger_type, amount, expense_date, notes, created_by_name, status, job_costing_treatment, amortization_end_date"
    )
    .not("job_costing_treatment", "is", null)
    .order("expense_date", { ascending: false });

  const allTagged = (data ?? []) as ExpenseRow[];

  // Filtered in JS rather than a nested .or() filter string -- this list
  // is always small (every tagged expense ever entered), and matching
  // overhead_by_month's own one_time/amortized windowing logic exactly
  // here (rather than approximating it in a Postgres filter string)
  // matters more than query efficiency.
  const oneTimeRows = allTagged.filter(
    (e) =>
      e.job_costing_treatment === "one_time" &&
      e.expense_date >= start &&
      e.expense_date < end
  );
  const amortizedRows = allTagged.filter(
    (e) =>
      e.job_costing_treatment === "amortized" &&
      e.expense_date < end &&
      (e.amortization_end_date ?? "") >= start
  );

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#174734]">
              Job Costing Overhead Pool
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              What actually feeds the &quot;Overhead&quot; figure on Job
              Costing Analytics -- that number is this month&apos;s total
              below, split evenly across however many invoices were
              issued this month.
            </p>
          </div>
          <Link
            href="/expenses"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#174734]/5"
          >
            ← Back to Expenses
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label htmlFor="month" className="text-xs font-bold text-[#9c7a20]">
                Month
              </label>
              <input
                id="month"
                name="month"
                type="month"
                defaultValue={month}
                className={`${inputClasses} mt-1 w-auto`}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Go
            </button>
          </form>
        </section>

        {(overheadError || expensesError) && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Couldn&apos;t load overhead data:{" "}
              {overheadError?.message || expensesError?.message}
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">{monthLabel}</h2>

          {!overhead ? (
            <p className="mt-4 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
              No overhead_by_month row for this month -- that view only
              covers roughly a year back and a year forward from today.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Link
                  href="/materials"
                  className="rounded-xl bg-[#f7f6f1] px-4 py-3 transition hover:bg-[#f0eee6]"
                >
                  <p className="text-xs text-[#6b705c]">
                    Recurring Overhead Costs
                  </p>
                  <p className="text-lg font-bold text-[#174734]">
                    {formatCurrency(overhead.recurring_overhead)}
                  </p>
                  <p className="text-[11px] text-[#9c7a20] underline">
                    Manage on Materials →
                  </p>
                </Link>

                <Link
                  href="/materials"
                  className="rounded-xl bg-[#f7f6f1] px-4 py-3 transition hover:bg-[#f0eee6]"
                >
                  <p className="text-xs text-[#6b705c]">
                    Amortized Overhead Costs
                  </p>
                  <p className="text-lg font-bold text-[#174734]">
                    {formatCurrency(overhead.amortized_overhead)}
                  </p>
                  <p className="text-[11px] text-[#9c7a20] underline">
                    Manage on Materials →
                  </p>
                </Link>

                <div className="rounded-xl bg-[#f7f6f1] px-4 py-3">
                  <p className="text-xs text-[#6b705c]">
                    Tagged Expenses (One-Time)
                  </p>
                  <p className="text-lg font-bold text-[#174734]">
                    {formatCurrency(overhead.expense_one_time_overhead)}
                  </p>
                </div>

                <div className="rounded-xl bg-[#f7f6f1] px-4 py-3">
                  <p className="text-xs text-[#6b705c]">
                    Tagged Expenses (Amortized)
                  </p>
                  <p className="text-lg font-bold text-[#174734]">
                    {formatCurrency(overhead.expense_amortized_overhead)}
                  </p>
                </div>

                <div className="col-span-2 rounded-xl bg-[#174734]/5 px-4 py-3 sm:col-span-1">
                  <p className="text-xs font-bold text-[#174734]">
                    Total Overhead Pool
                  </p>
                  <p className="text-xl font-bold text-[#174734]">
                    {formatCurrency(overhead.total_overhead)}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-[#9c9684]">
                If this is the current month, these figures are prorated
                to today&apos;s date -- they&apos;ll grow until the month
                closes out. Job Costing Analytics divides the Total by
                however many invoices have been issued so far this month
                to get the per-invoice overhead figure.
              </p>
            </>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">
            Tagged Expenses — One-Time{" "}
            <span className="font-normal text-[#6b705c]">
              ({oneTimeRows.length})
            </span>
          </h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Counted in full in the month of their expense date.
          </p>

          <div className="mt-4 space-y-3">
            {oneTimeRows.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                None tagged this month.
              </p>
            ) : (
              oneTimeRows.map((expense) => (
                <ExpenseRowItem key={expense.id} expense={expense} />
              ))
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">
            Tagged Expenses — Amortized{" "}
            <span className="font-normal text-[#6b705c]">
              ({amortizedRows.length})
            </span>
          </h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Spread evenly across every month from the expense date through
            its &quot;Amortize Through&quot; date -- only a fraction of
            each amount lands in any single month.
          </p>

          <div className="mt-4 space-y-3">
            {amortizedRows.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                None active this month.
              </p>
            ) : (
              amortizedRows.map((expense) => (
                <ExpenseRowItem key={expense.id} expense={expense} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
