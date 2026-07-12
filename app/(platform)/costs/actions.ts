"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

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
  const costType = cleanText(formData.get("cost_type")) ?? "recurring";

  const { error } = await supabaseServer.from("overhead_costs").insert({
    name: cleanText(formData.get("name")),
    category: cleanText(formData.get("category")),
    cost_type: costType,
    amount: cleanNumber(formData.get("amount")),
    start_date: cleanDate(formData.get("start_date")),
    end_date: cleanDate(formData.get("end_date")),
    notes: cleanText(formData.get("notes")),
  });

  if (error) {
    throw new Error(`Failed to add overhead cost: ${error.message}`);
  }

  revalidatePath("/costs");
  revalidatePath("/revenue");
}

export async function updateOverheadCost(
  id: string,
  formData: FormData
): Promise<void> {
  const costType = cleanText(formData.get("cost_type")) ?? "recurring";

  const { error } = await supabaseServer
    .from("overhead_costs")
    .update({
      name: cleanText(formData.get("name")),
      category: cleanText(formData.get("category")),
      cost_type: costType,
      amount: cleanNumber(formData.get("amount")),
      start_date: cleanDate(formData.get("start_date")),
      end_date: cleanDate(formData.get("end_date")),
      notes: cleanText(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update overhead cost: ${error.message}`);
  }

  revalidatePath("/costs");
  revalidatePath("/revenue");
}

export async function deleteOverheadCost(id: string): Promise<void> {
  const { error } = await supabaseServer
    .from("overhead_costs")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete overhead cost: ${error.message}`);
  }

  revalidatePath("/costs");
  revalidatePath("/revenue");
}
