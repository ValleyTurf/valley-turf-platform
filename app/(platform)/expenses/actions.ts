"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./constants";

const VALID_CATEGORIES = new Set(EXPENSE_CATEGORIES.map((c) => c.value));

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

export async function addExpense(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();

  const row = {
    vendor: cleanText(formData.get("vendor")),
    description: cleanText(formData.get("description")),
    category: cleanCategory(formData.get("category")),
    amount: cleanAmount(formData.get("amount")),
    expense_date: cleanDate(formData.get("expense_date")),
    notes: cleanText(formData.get("notes")),
    created_by_user_id: actor?.id ?? null,
    created_by_name: actor?.name ?? null,
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
    .select("vendor, description, category, amount, expense_date, notes")
    .eq("id", id)
    .maybeSingle();

  const row = {
    vendor: cleanText(formData.get("vendor")),
    description: cleanText(formData.get("description")),
    category: cleanCategory(formData.get("category")),
    amount: cleanAmount(formData.get("amount")),
    expense_date: cleanDate(formData.get("expense_date")),
    notes: cleanText(formData.get("notes")),
  };

  // Saving this form is Ryan looking at the row and confirming/fixing its
  // category -- the exact thing "needs_review" (set by the QuickBooks
  // import for anything it wasn't confident mapping) is waiting for. So
  // any manual save clears it, same as if he'd entered the row by hand.
  const { error } = await supabaseServer
    .from("expenses")
    .update({ ...row, status: "categorized", updated_at: new Date().toISOString() })
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
