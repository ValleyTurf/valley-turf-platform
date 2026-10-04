export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { EXPENSE_CATEGORIES } from "./constants";
import AddExpenseForm from "./AddExpenseForm";
import ExpenseRowItem, { inputClasses, type ExpenseRow } from "./ExpenseRowItem";
import { toNumber, formatCurrencyPrecise as formatCurrency } from "@/lib/format";

// Phase 1 of the native expense ledger (Ryan, 2026-10-04) -- plain
// manual entry, no bank feed yet. Deliberately separate from the
// existing Overhead Costs section on /materials, which keeps working
// unchanged; this is the new transaction-level half, reconciled into a
// single P&L view in a later phase.
type ExpensesPageProps = {
  searchParams: Promise<{ month?: string; status?: string }>;
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

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const params = await searchParams;
  const month = params.month || currentMonth();
  const { start, end } = monthBounds(month);
  // Needs-review rows (mainly from the QuickBooks import -- Ryan, 2026-10-04:
  // "I am on expenses and don't see where I need to clean up") can fall in
  // any month, so this view deliberately ignores the month filter entirely
  // rather than making him click through nine months one at a time.
  const showingNeedsReview = params.status === "needs_review";

  const baseQuery = supabaseServer
    .from("expenses")
    .select(
      "id, vendor, description, category, amount, expense_date, notes, created_by_name, status"
    );

  const { data, error } = showingNeedsReview
    ? await baseQuery
        .eq("status", "needs_review")
        .order("expense_date", { ascending: false })
    : await baseQuery
        .gte("expense_date", start)
        .lt("expense_date", end)
        .order("expense_date", { ascending: false });

  const expenses = (data ?? []) as ExpenseRow[];

  const { count: needsReviewCount } = await supabaseServer
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_review");

  const totalsByCategory = new Map<string, number>();
  let monthTotal = 0;

  for (const expense of expenses) {
    const amount = toNumber(expense.amount);
    monthTotal += amount;
    totalsByCategory.set(
      expense.category,
      (totalsByCategory.get(expense.category) ?? 0) + amount
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#174734]">Expenses</h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Manual expense log -- phase 1 of replacing QuickBooks with a
              native ledger. No bank connection yet, so every row here is
              entered by hand for now.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {(needsReviewCount ?? 0) > 0 && (
              <Link
                href="/expenses?status=needs_review"
                className="rounded-xl bg-[#9c7a20] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#86680f]"
              >
                Needs Review ({needsReviewCount})
              </Link>
            )}
            <Link
              href="/expenses/import"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#174734]/5"
            >
              Import from QuickBooks
            </Link>
            <Link
              href="/materials"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Overhead Costs
            </Link>
          </div>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Couldn&apos;t load expenses: {error.message}
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add Expense</h2>
          <AddExpenseForm />
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {showingNeedsReview ? (
                <>Needs Review <span className="font-normal text-[#6b705c]">(every month)</span></>
              ) : (
                new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })
              )}
            </h2>

            {showingNeedsReview ? (
              <Link
                href="/expenses"
                className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm font-semibold text-[#174734] hover:bg-[#f7f6f1]"
              >
                ← Back to current month
              </Link>
            ) : (
              <form className="flex items-center gap-2" method="get">
                <label htmlFor="month" className="text-xs font-bold text-[#9c7a20]">
                  Month
                </label>
                <input
                  id="month"
                  name="month"
                  type="month"
                  defaultValue={month}
                  className={`${inputClasses} mt-0 w-auto`}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm font-semibold text-[#174734] hover:bg-[#f7f6f1]"
                >
                  Go
                </button>
              </form>
            )}
          </div>

          {showingNeedsReview ? (
            <p className="mt-2 text-sm text-[#6b705c]">
              Mostly from the QuickBooks import -- QuickBooks didn&apos;t
              break these down far enough to map with confidence. Open a
              row, fix the category if needed, and hit Save -- that clears
              its review flag and it drops off this list.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-xl bg-[#f7f6f1] px-4 py-3">
                <p className="text-xs text-[#6b705c]">Total This Month</p>
                <p className="text-xl font-bold text-[#174734]">
                  {formatCurrency(monthTotal)}
                </p>
              </div>

              {EXPENSE_CATEGORIES.filter((c) => totalsByCategory.has(c.value)).map(
                (c) => (
                  <div key={c.value} className="rounded-xl bg-[#f7f6f1] px-4 py-3">
                    <p className="text-xs text-[#6b705c]">{c.label}</p>
                    <p className="text-sm font-bold">
                      {formatCurrency(totalsByCategory.get(c.value) ?? 0)}
                    </p>
                  </div>
                )
              )}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {expenses.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                {showingNeedsReview
                  ? "Nothing left to review."
                  : "No expenses logged for this month yet."}
              </p>
            ) : (
              expenses.map((expense) => (
                <ExpenseRowItem key={expense.id} expense={expense} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
