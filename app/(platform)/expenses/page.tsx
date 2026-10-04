export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { updateExpense, deleteExpense } from "./actions";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "./constants";
import AddExpenseForm from "./AddExpenseForm";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
  formatDateOnly as formatDate,
} from "@/lib/format";

// Phase 1 of the native expense ledger (Ryan, 2026-10-04) -- plain
// manual entry, no bank feed yet. Deliberately separate from the
// existing Overhead Costs section on /materials, which keeps working
// unchanged; this is the new transaction-level half, reconciled into a
// single P&L view in a later phase.
type ExpenseRow = {
  id: string;
  vendor: string | null;
  description: string | null;
  category: string;
  amount: number | string;
  expense_date: string;
  notes: string | null;
  created_by_name: string | null;
};

type ExpensesPageProps = {
  searchParams: Promise<{ month?: string }>;
};

const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";

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

  const { data, error } = await supabaseServer
    .from("expenses")
    .select(
      "id, vendor, description, category, amount, expense_date, notes, created_by_name"
    )
    .gte("expense_date", start)
    .lt("expense_date", end)
    .order("expense_date", { ascending: false });

  const expenses = (data ?? []) as ExpenseRow[];

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

          <Link
            href="/materials"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Overhead Costs
          </Link>
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
              {new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h2>

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
          </div>

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

          <div className="mt-6 space-y-3">
            {expenses.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No expenses logged for this month yet.
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

function ExpenseRowItem({ expense }: { expense: ExpenseRow }) {
  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {expense.vendor || expense.description || "Expense"}
          </p>
          <p className="text-xs text-[#6b705c]">
            {expenseCategoryLabel(expense.category)} ·{" "}
            {formatDate(expense.expense_date)}
            {expense.created_by_name ? ` · ${expense.created_by_name}` : ""}
          </p>
        </div>

        <p className="shrink-0 text-sm font-bold">
          {formatCurrency(expense.amount)}
        </p>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateExpense.bind(null, expense.id)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Vendor
              </label>
              <input
                name="vendor"
                type="text"
                defaultValue={expense.vendor ?? ""}
                className={inputClasses}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Category
              </label>
              <select
                name="category"
                defaultValue={expense.category}
                className={`${inputClasses} bg-white`}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Amount ($)
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toNumber(expense.amount)}
                required
                className={inputClasses}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Date
              </label>
              <input
                name="expense_date"
                type="date"
                defaultValue={expense.expense_date}
                className={inputClasses}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#9c7a20]">
              Description
            </label>
            <input
              name="description"
              type="text"
              defaultValue={expense.description ?? ""}
              className={inputClasses}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#9c7a20]">Notes</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={expense.notes ?? ""}
              className={inputClasses}
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Save Changes
          </button>
        </form>

        <form action={deleteExpense.bind(null, expense.id)} className="mt-3">
          <ConfirmSubmitButton
            confirmMessage={`Delete this expense (${expense.vendor ?? expense.description ?? "untitled"})? This can't be undone.`}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete Expense
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
