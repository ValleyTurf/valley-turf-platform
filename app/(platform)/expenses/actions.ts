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
