// Recurring Charges checklist (Ryan, 2026-10-05) -- see migration 089 and
// lib/recurringCharges.ts for the full context. Deliberately rendered as
// its own section, separate from the actual expense list below it: this
// is a checklist, never a dollar amount feeding the P&L, and the styling
// (plain cards, no $ emphasis beyond the "logged" confirmation) is meant
// to read that way at a glance.
import {
  addRecurringCharge,
  updateRecurringCharge,
  deleteRecurringCharge,
} from "./actions";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  type ExpenseCategory,
} from "./constants";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { inputClasses } from "./ExpenseRowItem";
import type { RecurringChargeRow, RecurringChargeStatus } from "@/lib/recurringCharges";
import { formatCurrencyPrecise as formatCurrency, formatDateOnly as formatDate } from "@/lib/format";

const labelClasses = "text-xs font-bold text-[#9c7a20]";

function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
}

export default function RecurringChargesSection({
  statuses,
  charges,
  monthLabel,
}: {
  statuses: RecurringChargeStatus[];
  charges: RecurringChargeRow[];
  monthLabel: string;
}) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow">
      <h2 className="text-lg font-bold">Recurring Charges Check</h2>
      <p className="mt-1 text-sm text-[#6b705c]">
        Not part of your P&amp;L -- just a checklist of known recurring
        costs, so a missed entry or a late bank-feed charge doesn&apos;t
        quietly understate expenses and inflate your margin.
      </p>

      {statuses.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
          Nothing set up yet. Add your known recurring costs below (Jobber,
          insurance, etc.) and this will flag any that haven&apos;t shown up
          in {monthLabel} yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {statuses.map((status) => (
            <div
              key={status.id}
              className={`rounded-xl px-4 py-3 ${
                status.matched ? "bg-[#174734]/5" : "bg-red-50"
              }`}
            >
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <span>{status.matched ? "✓" : "⚠"}</span>
                {status.name}
              </p>
              <p className="text-xs text-[#6b705c]">
                {status.matched
                  ? `Logged ${formatDate(status.matchedDate!)} -- ${formatCurrency(status.matchedAmount!)}`
                  : status.expectedDayOfMonth
                    ? `Not logged yet -- expected around the ${ordinal(status.expectedDayOfMonth)}`
                    : "Not logged yet this month"}
              </p>
            </div>
          ))}
        </div>
      )}

      <details className="mt-4 rounded-xl border border-[#e7e2d5] px-3 py-2">
        <summary className="cursor-pointer text-sm font-bold text-[#174734]">
          Manage Recurring Charges
        </summary>

        <div className="mt-4 space-y-4 border-t border-[#e7e2d5] pt-4">
          <form
            action={addRecurringCharge}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <label className={labelClasses}>Name</label>
              <input
                name="name"
                type="text"
                placeholder="e.g. Jobber"
                required
                className={inputClasses}
              />
            </div>

            <div>
              <label className={labelClasses}>Category</label>
              <select
                name="category"
                defaultValue="software"
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
              <label className={labelClasses}>Expected Amount ($)</label>
              <input
                name="expected_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className={inputClasses}
              />
            </div>

            <div>
              <label className={labelClasses}>Expected Day of Month</label>
              <input
                name="expected_day_of_month"
                type="number"
                min="1"
                max="31"
                placeholder="e.g. 5"
                className={inputClasses}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClasses}>Notes</label>
              <input name="notes" type="text" className={inputClasses} />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
              >
                Add
              </button>
            </div>
          </form>

          {charges.length > 0 && (
            <div className="space-y-2">
              {charges.map((charge) => (
                <RecurringChargeEditRow key={charge.id} charge={charge} />
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function RecurringChargeEditRow({ charge }: { charge: RecurringChargeRow }) {
  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-bold">
            {charge.name}
            {!charge.active && (
              <span className="shrink-0 rounded-full bg-[#6b705c]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6b705c]">
                Inactive
              </span>
            )}
          </p>
          <p className="text-xs text-[#6b705c]">
            {expenseCategoryLabel(charge.category)}
            {charge.expected_day_of_month
              ? ` · around the ${ordinal(charge.expected_day_of_month)}`
              : ""}
          </p>
        </div>

        <p className="shrink-0 text-sm font-bold">
          {formatCurrency(charge.expected_amount)}
        </p>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateRecurringCharge.bind(null, charge.id)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClasses}>Name</label>
              <input
                name="name"
                type="text"
                defaultValue={charge.name}
                required
                className={inputClasses}
              />
            </div>

            <div>
              <label className={labelClasses}>Category</label>
              <select
                name="category"
                defaultValue={charge.category as ExpenseCategory}
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClasses}>Expected Amount ($)</label>
              <input
                name="expected_amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={charge.expected_amount}
                className={inputClasses}
              />
            </div>

            <div>
              <label className={labelClasses}>Expected Day of Month</label>
              <input
                name="expected_day_of_month"
                type="number"
                min="1"
                max="31"
                defaultValue={charge.expected_day_of_month ?? ""}
                className={inputClasses}
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#174734]">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={charge.active}
                  className="h-4 w-4"
                />
                Active
              </label>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Notes</label>
            <input
              name="notes"
              type="text"
              defaultValue={charge.notes ?? ""}
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

        <form
          action={deleteRecurringCharge.bind(null, charge.id)}
          className="mt-3"
        >
          <ConfirmSubmitButton
            confirmMessage={`Delete "${charge.name}" from the Recurring Charges checklist? This can't be undone.`}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
