// Extracted out of app/(platform)/expenses/page.tsx (2026-10-05) so the
// P&L month drill-down (app/(platform)/revenue/profit-loss/[month]/page.tsx)
// can reuse the exact same editable row -- Ryan: "I want to see a full
// P&L by clicking on the month, so I can see the breakdown of everything
// that falls into those categories so I can adjust as necessary." That
// page needed real edit capability, not just a read-only list, and
// duplicating this form would mean the two could drift out of sync
// (a category added to one list but not the other, a field one page
// lets you edit and the other doesn't).
import { updateExpense, deleteExpense } from "./actions";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "./constants";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
  formatDateOnly as formatDate,
} from "@/lib/format";

export type ExpenseRow = {
  id: string;
  vendor: string | null;
  description: string | null;
  category: string;
  amount: number | string;
  expense_date: string;
  notes: string | null;
  created_by_name: string | null;
  status: string;
};

export const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";

export default function ExpenseRowItem({ expense }: { expense: ExpenseRow }) {
  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-bold">
            {expense.vendor || expense.description || "Expense"}
            {expense.status === "needs_review" && (
              <span className="shrink-0 rounded-full bg-[#9c7a20]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9c7a20]">
                Needs Review
              </span>
            )}
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
