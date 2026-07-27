"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value;
}

export async function addOverheadCost(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const costType = cleanText(formData.get("cost_type")) ?? "recurring";

  const row = {
    name: cleanText(formData.get("name")),
    category: cleanText(formData.get("category")),
    cost_type: costType,
    amount: cleanNumber(formData.get("amount")),
    start_date: cleanDate(formData.get("start_date")),
    end_date: cleanDate(formData.get("end_date")),
    notes: cleanText(formData.get("notes")),
  };

  const { data, error } = await supabaseServer
    .from("overhead_costs")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add overhead cost: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "overhead_cost",
    entityId: data?.id ?? null,
    entityLabel: row.name,
    after: row,
  });

  revalidatePath("/materials");
  revalidatePath("/revenue");
}

export async function updateOverheadCost(
  id: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();
  const costType = cleanText(formData.get("cost_type")) ?? "recurring";

  const { data: before } = await supabaseServer
    .from("overhead_costs")
    .select("name, category, cost_type, amount, start_date, end_date, notes")
    .eq("id", id)
    .maybeSingle();

  const row = {
    name: cleanText(formData.get("name")),
    category: cleanText(formData.get("category")),
    cost_type: costType,
    amount: cleanNumber(formData.get("amount")),
    start_date: cleanDate(formData.get("start_date")),
    end_date: cleanDate(formData.get("end_date")),
    notes: cleanText(formData.get("notes")),
  };

  const { error } = await supabaseServer
    .from("overhead_costs")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update overhead cost: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "overhead_cost",
    entityId: id,
    entityLabel: row.name,
    before,
    after: row,
  });

  revalidatePath("/materials");
  revalidatePath("/revenue");
}

export async function deleteOverheadCost(id: string): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("overhead_costs")
    .select("name, category, cost_type, amount, start_date, end_date, notes")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("overhead_costs")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete overhead cost: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "overhead_cost",
    entityId: id,
    entityLabel: before?.name ?? null,
    before,
  });

  revalidatePath("/materials");
  revalidatePath("/revenue");
}
