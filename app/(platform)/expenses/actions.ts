"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  EXPENSE_CATEGORIES,
  LEDGER_TYPES,
  type ExpenseCategory,
  type LedgerType,
} from "./constants";

const VALID_CATEGORIES = new Set(EXPENSE_CATEGORIES.map((c) => c.value));
const VALID_LEDGER_TYPES = new Set(LEDGER_TYPES.map((t) => t.value));

// Ryan (2026-10-12): the job-costing toggle (migration 093) isn't offered
// for these two categories -- cost_of_service is meant to tie to a
// specific job directly once that linking UI exists, and payroll is
// already reflected per-visit via Materials & Costs labor, so folding it
// into Job Costing's overhead pool again here would double-count it.
// Enforced here (not just hidden in the form) so a stale/tampered form
// submission can't sneak a value through for either category.
const JOB_COSTING_EXCLUDED_CATEGORIES = new Set<ExpenseCategory>([
  "cost_of_service",
  "payroll",
]);

type JobCostingTreatment = "one_time" | "amortized";

function cleanJobCostingTreatment(
  value: FormDataEntryValue | null
): JobCostingTreatment | null {
  return value === "one_time" || value === "amortized" ? value : null;
}

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanAmount(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanCategory(value: FormDataEntryValue | null): ExpenseCategory {
  if (typeof value === "string" && VALID_CATEGORIES.has(value as ExpenseCategory)) {
    return value as ExpenseCategory;
  }

  return "other";
}

// Journal entries (migration 096) -- an empty selection means "a real
// expense," same null-means-default convention as job_costing_treatment.
function cleanLedgerType(value: FormDataEntryValue | null): LedgerType | null {
  return typeof value === "string" && VALID_LEDGER_TYPES.has(value as LedgerType)
    ? (value as LedgerType)
    : null;
}

function cleanDate(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || value.trim() === "") {
    return new Date().toISOString().slice(0, 10);
  }

  return value;
}

function cleanDayOfMonth(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Math.round(Number(value));

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }

  return parsed;
}

// Shared by addExpense and updateExpense so the cost_of_service/payroll
// restriction and the amortized-requires-an-end-date rule can't drift
// between the two entry points. A journal entry (ledger_type set) is
// excluded the same way cost_of_service/payroll are -- it isn't a real
// job cost, and migration 096's check constraint enforces this at the
// DB level too.
function resolveJobCostingFields(
  formData: FormData,
  category: ExpenseCategory,
  ledgerType: LedgerType | null
): { job_costing_treatment: JobCostingTreatment | null; amortization_end_date: string | null } {
  if (ledgerType || JOB_COSTING_EXCLUDED_CATEGORIES.has(category)) {
    return { job_costing_treatment: null, amortization_end_date: null };
  }

  const treatment = cleanJobCostingTreatment(formData.get("job_costing_treatment"));

  if (treatment !== "amortized") {
    return { job_costing_treatment: treatment, amortization_end_date: null };
  }

  const endDate = cleanText(formData.get("amortization_end_date"));

  if (!endDate) {
    throw new Error(
      "Amortized job costs need an end date to spread the cost across."
    );
  }

  return { job_costing_treatment: "amortized", amortization_end_date: endDate };
}

export async function addExpense(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const category = cleanCategory(formData.get("category"));
  const ledgerType = cleanLedgerType(formData.get("ledger_type"));

  const row = {
    vendor: cleanText(formData.get("vendor")),
    description: cleanText(formData.get("description")),
    category,
    ledger_type: ledgerType,
    amount: cleanAmount(formData.get("amount")),
    expense_date: cleanDate(formData.get("expense_date")),
    notes: cleanText(formData.get("notes")),
    created_by_user_id: actor?.id ?? null,
    created_by_name: actor?.name ?? null,
    // Migration 098 -- a hand-entered row is definitionally reviewed;
    // there's no Plaid-fed version of it that a later sync could ever
    // correct, but setting this keeps every manually-created row
    // consistent with updateExpense below.
    staff_reviewed: true,
    ...resolveJobCostingFields(formData, category, ledgerType),
  };

  const { data, error } = await supabaseServer
    .from("expenses")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add expense: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "expense",
    entityId: data?.id ?? null,
    entityLabel: row.vendor ?? row.description ?? "Expense",
    after: row,
  });

  revalidatePath("/expenses");
}

export async function updateExpense(
  id: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("expenses")
    .select(
      "vendor, description, category, ledger_type, amount, expense_date, notes, job_costing_treatment, amortization_end_date"
    )
    .eq("id", id)
    .maybeSingle();

  const category = cleanCategory(formData.get("category"));
  const ledgerType = cleanLedgerType(formData.get("ledger_type"));

  const row = {
    vendor: cleanText(formData.get("vendor")),
    description: cleanText(formData.get("description")),
    category,
    ledger_type: ledgerType,
    amount: cleanAmount(formData.get("amount")),
    expense_date: cleanDate(formData.get("expense_date")),
    notes: cleanText(formData.get("notes")),
    ...resolveJobCostingFields(formData, category, ledgerType),
  };

  // Saving this form is Ryan looking at the row and confirming/fixing its
  // category -- the exact thing "needs_review" (set by the QuickBooks
  // import for anything it wasn't confident mapping) is waiting for. So
  // any manual save clears it, same as if he'd entered the row by hand.
  //
  // staff_reviewed (migration 098) is the real "a person actually looked
  // at this" signal -- unlike status, which also flips to "categorized"
  // the instant the Plaid category mapper is confident, with zero human
  // involvement. app/api/plaid/sync/route.ts's modified/removed handling
  // keys off this flag so a later Plaid correction (e.g. a pending
  // placeholder amount settling to its real posted amount) isn't
  // mistaken for overwriting Ryan's own edit.
  const { error } = await supabaseServer
    .from("expenses")
    .update({
      ...row,
      status: "categorized",
      staff_reviewed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update expense: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "expense",
    entityId: id,
    entityLabel: row.vendor ?? row.description ?? "Expense",
    before,
    after: row,
  });

  revalidatePath("/expenses");
}

export async function deleteExpense(id: string): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("expenses")
    .select("vendor, description, category, amount, expense_date, notes")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer.from("expenses").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete expense: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "expense",
    entityId: id,
    entityLabel: before?.vendor ?? before?.description ?? null,
    before,
  });

  revalidatePath("/expenses");
}

// ---------- Recurring Charges checklist (migration 089) ----------
//
// Ryan, 2026-10-05: after ending the double-counted recurring Overhead
// Cost estimates (Jobber, Advertising) on 12/31/2025, the P&L runs
// purely off actual logged/bank-fed expenses -- more accurate, but
// nothing flags it if a known recurring charge just doesn't show up
// some month. These three actions manage that checklist. Deliberately
// NOT wired into any P&L total -- see lib/recurringCharges.ts.

export async function addRecurringCharge(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const name = cleanText(formData.get("name"));

  if (!name) {
    throw new Error("Name is required.");
  }

  const row = {
    name,
    category: cleanCategory(formData.get("category")),
    expected_amount: cleanAmount(formData.get("expected_amount")),
    expected_day_of_month: cleanDayOfMonth(formData.get("expected_day_of_month")),
    active: true,
    notes: cleanText(formData.get("notes")),
  };

  const { data, error } = await supabaseServer
    .from("recurring_charges")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add recurring charge: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "recurring_charge",
    entityId: data?.id ?? null,
    entityLabel: name,
    after: row,
  });

  revalidatePath("/expenses");
}

export async function updateRecurringCharge(
  id: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();
  const name = cleanText(formData.get("name"));

  if (!name) {
    throw new Error("Name is required.");
  }

  const { data: before } = await supabaseServer
    .from("recurring_charges")
    .select("name, category, expected_amount, expected_day_of_month, active, notes")
    .eq("id", id)
    .maybeSingle();

  const row = {
    name,
    category: cleanCategory(formData.get("category")),
    expected_amount: cleanAmount(formData.get("expected_amount")),
    expected_day_of_month: cleanDayOfMonth(formData.get("expected_day_of_month")),
    active: formData.get("active") === "on",
    notes: cleanText(formData.get("notes")),
  };

  const { error } = await supabaseServer
    .from("recurring_charges")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update recurring charge: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "recurring_charge",
    entityId: id,
    entityLabel: name,
    before,
    after: row,
  });

  revalidatePath("/expenses");
}

export async function deleteRecurringCharge(id: string): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("recurring_charges")
    .select("name, category, expected_amount, expected_day_of_month, active, notes")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("recurring_charges")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete recurring charge: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "recurring_charge",
    entityId: id,
    entityLabel: before?.name ?? null,
    before,
  });

  revalidatePath("/expenses");
}
