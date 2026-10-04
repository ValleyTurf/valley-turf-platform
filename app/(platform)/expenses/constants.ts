// Single source of truth for the expense category list -- matches the
// check constraint in supabase/migrations/087_add_expenses.sql exactly.
// Shared between the add form, the row editor, and the P&L grouping
// this feeds in a later phase, so there's one place to add/rename a
// category rather than three.
export type ExpenseCategory =
  | "cost_of_service"
  | "fuel"
  | "payroll"
  | "marketing"
  | "software"
  | "insurance"
  | "vehicle"
  | "office"
  | "professional"
  | "bank_fees"
  | "rent_utilities"
  | "taxes_licenses"
  | "other";

// "group" is for the future P&L/job-costing wiring (phase 3) -- cogs
// rolls up under Cost of Service, payroll gets its own line (Gusto runs
// payroll itself, but the P&L still needs to show the cost), everything
// else is a plain operating expense. Not read by anything yet.
export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  group: "cogs" | "payroll" | "opex";
}[] = [
  { value: "cost_of_service", label: "Cost of Service", group: "cogs" },
  { value: "fuel", label: "Fuel", group: "cogs" },
  { value: "payroll", label: "Payroll", group: "payroll" },
  { value: "marketing", label: "Marketing & Advertising", group: "opex" },
  { value: "software", label: "Software & Subscriptions", group: "opex" },
  { value: "insurance", label: "Insurance", group: "opex" },
  { value: "vehicle", label: "Vehicle (Non-Fuel)", group: "opex" },
  { value: "office", label: "Office & Supplies", group: "opex" },
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
