// Single source of truth for the expense category list -- matches the
// check constraint in supabase/migrations/088_split_expense_categories.sql
// (which supersedes 087's original, narrower list). Shared between the
// add form, the row editor, and the P&L grouping this feeds, so there's
// one place to add/rename a category rather than three.
//
// "office", "supplies", "tools_equipment", and "repairs_maintenance" used
// to all be one "Other"/"Office & Supplies" catch-all -- split out per
// Ryan (2026-10-04): "I think Other is too broad still. Should we have a
// category for Supplies as well as Tools, Equipment and Machinery, then
// Repairs and Maintenance also. I think you have Office and Supplies the
// same, they should be split." See that migration for the one-time
// backfill that reclassified already-imported rows using the original
// QuickBooks category recorded in each row's notes.
export type ExpenseCategory =
  | "cost_of_service"
  | "fuel"
  | "payroll"
  | "marketing"
  | "software"
  | "insurance"
  | "vehicle"
  | "office"
  | "supplies"
  | "tools_equipment"
  | "repairs_maintenance"
  | "professional"
  | "bank_fees"
  | "rent_utilities"
  | "taxes_licenses"
  | "other";

// "group" is for the P&L/job-costing wiring -- cogs rolls up under Cost
// of Service, payroll gets its own line (Gusto runs payroll itself, but
// the P&L still needs to show the cost), everything else is a plain
// operating expense.
//
// Fuel moved from cogs to opex and was relabeled "Vehicle (Fuel)" per
// Ryan (2026-10-05): "Can we move Fuel out of COGS and move it to
// expenses and maybe rename to Vehicle (Fuel)?" -- pairs it with the
// existing "Vehicle (Non-Fuel)" category instead of standing alone
// under Cost of Goods Sold. Both P&L pages derive their cogs/payroll/opex
// groupings straight from this `group` field, so moving it here is the
// whole change -- it reclassifies existing rows without touching any
// dollar amount (Net Operating Income is unaffected; only which bucket
// Fuel's total lands in changes).
export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  group: "cogs" | "payroll" | "opex";
}[] = [
  { value: "cost_of_service", label: "Cost of Service", group: "cogs" },
  { value: "fuel", label: "Vehicle (Fuel)", group: "opex" },
  { value: "payroll", label: "Payroll", group: "payroll" },
  { value: "marketing", label: "Marketing & Advertising", group: "opex" },
  { value: "software", label: "Software & Subscriptions", group: "opex" },
  { value: "insurance", label: "Insurance", group: "opex" },
  { value: "vehicle", label: "Vehicle (Non-Fuel)", group: "opex" },
  { value: "office", label: "Office", group: "opex" },
  { value: "supplies", label: "Supplies", group: "opex" },
  { value: "tools_equipment", label: "Tools, Equipment & Machinery", group: "opex" },
  { value: "repairs_maintenance", label: "Repairs & Maintenance", group: "opex" },
  { value: "professional", label: "Professional & Legal", group: "opex" },
  { value: "bank_fees", label: "Bank & Payment Processing Fees", group: "opex" },
  { value: "rent_utilities", label: "Rent & Utilities", group: "opex" },
  { value: "taxes_licenses", label: "Taxes & Licenses", group: "opex" },
  { value: "other", label: "Other", group: "opex" },
];

const LABEL_BY_VALUE = new Map(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);

export function expenseCategoryLabel(value: string): string {
  return LABEL_BY_VALUE.get(value as ExpenseCategory) ?? value;
}
