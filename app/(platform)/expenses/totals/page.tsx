export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { expenseCategoryLabel } from "../constants";
import ExpenseRowItem, { inputClasses, type ExpenseRow } from "../ExpenseRowItem";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
  formatDateOnly as formatDate,
} from "@/lib/format";

// Ryan (2026-10-12): "For expenses, I can see by month, can I also get a
// view where I can see how much each vendor or category has been paid?"
// -- the main /expenses list only ever totals one month at a time. This
// is a separate page rather than bolted onto that one so the date range
// here can be anything (a quarter, a year, all-time) independent of the
// month picker there. Each total expands to the real editable
// ExpenseRowItem rows behind it, same component the main list and the
// P&L month drill-down already use, so there's still only one place
// that knows how to edit an expense.
type TotalsPageProps = {
  searchParams: Promise<{ start?: string; end?: string; group?: string }>;
};

type GroupKey = "vendor" | "category";

type GroupTotal = {
  key: string;
  label: string;
  total: number;
  count: number;
  rows: ExpenseRow[];
};

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildGroupTotals(
  expenses: ExpenseRow[],
  groupBy: GroupKey
): GroupTotal[] {
  const totals = new Map<string, GroupTotal>();

  for (const expense of expenses) {
    const key =
      groupBy === "vendor"
        ? expense.vendor?.trim() || "(No Vendor)"
        : expense.category;
    const label =
      groupBy === "vendor" ? key : expenseCategoryLabel(expense.category);
    const amount = toNumber(expense.amount);
    const existing = totals.get(key);

    if (existing) {
      existing.total += amount;
      existing.count += 1;
      existing.rows.push(expense);
    } else {
      totals.set(key, { key, label, total: amount, count: 1, rows: [expense] });
    }
  }

  return Array.from(totals.values()).sort((a, b) => b.total - a.total);
}

export default async function ExpenseTotalsPage({
  searchParams,
}: TotalsPageProps) {
  const params = await searchParams;
  const start = params.start || startOfYear();
  const end = params.end || todayLocal();
  const groupBy: GroupKey = params.group === "category" ? "category" : "vendor";

  // .is("ledger_type", null) excludes journal entries (migration 096) --
  // a loan payment or owner draw isn't "paid to a vendor" in the sense
  // this page means, and letting one in would also inflate a category's
  // total with a row that was deliberately kept out of the P&L.
  const { data, error } = await supabaseServer
    .from("expenses")
    .select(
      "id, vendor, description, category, ledger_type, amount, expense_date, notes, created_by_name, status, job_costing_treatment, amortization_end_date"
    )
    .gte("expense_date", start)
    .lte("expense_date", end)
    .is("ledger_type", null)
    .order("expense_date", { ascending: false });

  const expenses = (data ?? []) as ExpenseRow[];
  const groups = buildGroupTotals(expenses, groupBy);
  const grandTotal = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);

  function rangeUrl(nextGroup: GroupKey): string {
    const qs = new URLSearchParams({ start, end, group: nextGroup });
    return `/expenses/totals?${qs.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#174734]">
              Totals by {groupBy === "vendor" ? "Vendor" : "Category"}
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              How much has gone to each{" "}
              {groupBy === "vendor" ? "vendor" : "category"} over a date
              range you pick.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/expenses/journal"
              className="rounded-xl border border-[#1d4ed8] px-5 py-3 text-center text-sm font-bold text-[#1d4ed8] transition hover:bg-[#1d4ed8]/5"
            >
              Journal
            </Link>
            <Link
              href="/expenses"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#174734]/5"
            >
              ← Back to Expenses
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label htmlFor="start" className="text-xs font-bold text-[#9c7a20]">
                From
              </label>
              <input
                id="start"
                name="start"
                type="date"
                defaultValue={start}
                className={`${inputClasses} w-auto`}
              />
            </div>
            <div>
              <label htmlFor="end" className="text-xs font-bold text-[#9c7a20]">
                Through
              </label>
              <input
                id="end"
                name="end"
                type="date"
                defaultValue={end}
                className={`${inputClasses} w-auto`}
              />
            </div>
            <input type="hidden" name="group" value={groupBy} />
            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Apply
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href={rangeUrl("vendor")}
              className={`rounded-lg px-3 py-2 font-semibold ${
                groupBy === "vendor"
                  ? "bg-[#174734] text-white"
                  : "border border-[#d9d4c6] text-[#174734] hover:bg-[#f7f6f1]"
              }`}
            >
              By Vendor
            </Link>
            <Link
              href={rangeUrl("category")}
              className={`rounded-lg px-3 py-2 font-semibold ${
                groupBy === "category"
                  ? "bg-[#174734] text-white"
                  : "border border-[#d9d4c6] text-[#174734] hover:bg-[#f7f6f1]"
              }`}
            >
              By Category
            </Link>
          </div>
        </section>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Couldn&apos;t load expenses: {error.message}
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {formatDate(start)} – {formatDate(end)}
            </h2>
            <div className="rounded-xl bg-[#f7f6f1] px-4 py-3">
              <p className="text-xs text-[#6b705c]">Total</p>
              <p className="text-xl font-bold text-[#174734]">
                {formatCurrency(grandTotal)}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {groups.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No expenses in this range.
              </p>
            ) : (
              groups.map((group) => (
                <details
                  key={group.key}
                  className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <p className="text-sm font-bold">
                      {group.label}{" "}
                      <span className="font-normal text-[#6b705c]">
                        ({group.count})
                      </span>
                    </p>
                    <p className="shrink-0 text-sm font-bold">
                      {formatCurrency(group.total)}
                    </p>
                  </summary>
                  <div className="mt-4 space-y-3 border-t border-[#e7e2d5] pt-4">
                    {group.rows.map((expense) => (
                      <ExpenseRowItem key={expense.id} expense={expense} />
                    ))}
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
