"use client";

import { addExpense } from "./actions";
import { EXPENSE_CATEGORIES } from "./constants";

const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";
const labelClasses = "text-xs font-bold text-[#9c7a20]";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddExpenseForm() {
  return (
    <form
      action={addExpense}
      className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div>
        <label htmlFor="vendor" className={labelClasses}>
          Vendor
        </label>
        <input
          id="vendor"
          name="vendor"
          type="text"
          placeholder="e.g. Home Depot"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="category" className={labelClasses}>
          Category
        </label>
        <select
          id="category"
          name="category"
          defaultValue="other"
          className={`${inputClasses} bg-white`}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="amount" className={labelClasses}>
          Amount
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="0.00"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="expense_date" className={labelClasses}>
          Date
        </label>
        <input
          id="expense_date"
          name="expense_date"
          type="date"
          defaultValue={todayLocal()}
          className={inputClasses}
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-2">
        <label htmlFor="description" className={labelClasses}>
          Description
        </label>
        <input
          id="description"
          name="description"
          type="text"
          placeholder="What was this for?"
          className={inputClasses}
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <label htmlFor="notes" className={labelClasses}>
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className={inputClasses}
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
        >
          Add Expense
        </button>
      </div>
    </form>
  );
}
