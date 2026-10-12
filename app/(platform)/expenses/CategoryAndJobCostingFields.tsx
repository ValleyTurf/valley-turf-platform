"use client";

// Shared by AddExpenseForm and ExpenseRowItem so the Category select and
// the Job Costing toggle (migration 093) can't drift between the add
// form and the row editor -- same reasoning as constants.ts being the
// one place the category list itself lives.
import { useState } from "react";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./constants";

// Job Costing isn't offered for these two categories -- cost_of_service
// is meant to tie to a specific job directly once that linking UI
// exists, and payroll is already reflected per-visit via Materials &
// Costs labor, so folding it into Job Costing's overhead pool again
// here would double-count it. app/(platform)/expenses/actions.ts
// enforces this server-side too; this just keeps Ryan from being
// offered a choice that gets silently dropped on save.
const JOB_COSTING_EXCLUDED_CATEGORIES = new Set<ExpenseCategory>([
  "cost_of_service",
  "payroll",
]);

const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";
const labelClasses = "text-xs font-bold text-[#9c7a20]";

type Treatment = "" | "one_time" | "amortized";

type Props = {
  defaultCategory: ExpenseCategory;
  defaultTreatment?: "one_time" | "amortized" | null;
  defaultAmortizationEndDate?: string | null;
};

export default function CategoryAndJobCostingFields({
  defaultCategory,
  defaultTreatment = null,
  defaultAmortizationEndDate = null,
}: Props) {
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [treatment, setTreatment] = useState<Treatment>(defaultTreatment ?? "");
  const jobCostingAllowed = !JOB_COSTING_EXCLUDED_CATEGORIES.has(category);

  return (
    <>
      <div>
        <label htmlFor="category" className={labelClasses}>
          Category
        </label>
        <select
          id="category"
          name="category"
          defaultValue={defaultCategory}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          className={`${inputClasses} bg-white`}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {jobCostingAllowed && (
        <>
          <div>
            <label htmlFor="job_costing_treatment" className={labelClasses}>
              Job Costing
            </label>
            <select
              id="job_costing_treatment"
              name="job_costing_treatment"
              value={treatment}
              onChange={(e) => setTreatment(e.target.value as Treatment)}
              className={`${inputClasses} bg-white`}
            >
              <option value="">Not used for job costing</option>
              <option value="one_time">One-time job cost</option>
              <option value="amortized">Amortized over a date range</option>
            </select>
          </div>

          {treatment === "amortized" && (
            <div>
              <label htmlFor="amortization_end_date" className={labelClasses}>
                Amortize Through
              </label>
              <input
                id="amortization_end_date"
                name="amortization_end_date"
                type="date"
                defaultValue={defaultAmortizationEndDate ?? ""}
                required
                className={inputClasses}
              />
              <p className="mt-1 text-[11px] text-[#9c9684]">
                Spreads this cost evenly from the expense date through this
                date.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
