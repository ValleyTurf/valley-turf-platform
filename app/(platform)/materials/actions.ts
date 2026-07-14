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

export async function addMaterial(formData: FormData): Promise<void> {
  const { error } = await supabaseServer.from("materials").insert({
    name: cleanText(formData.get("name")),
    unit_label: cleanText(formData.get("unit_label")),
    unit_cost: cleanNumber(formData.get("unit_cost")),
    notes: cleanText(formData.get("notes")),
  });

  if (error) {
    throw new Error(`Failed to add material: ${error.message}`);
  }

  revalidatePath("/materials");
  revalidatePath("/job-costs");
}

export async function updateMaterial(
  id: string,
  formData: FormData
): Promise<void> {
  const { error } = await supabaseServer
    .from("materials")
    .update({
      name: cleanText(formData.get("name")),
      unit_label: cleanText(formData.get("unit_label")),
      unit_cost: cleanNumber(formData.get("unit_cost")),
      notes: cleanText(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update material: ${error.message}`);
  }

  revalidatePath("/materials");
  revalidatePath("/job-costs");
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabaseServer.from("materials").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete material: ${error.message}`);
  }

  revalidatePath("/materials");
  revalidatePath("/job-costs");
}

export async function saveInvoiceMaterialUsage(
  formData: FormData
): Promise<void> {
  const parsedRows: {
    jobber_invoice_id: string;
    material_id: string;
    quantity_used: number;
  }[] = [];

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^usage\[(.+?)\]\[(.+?)\]$/);

    if (!match) {
      continue;
    }

    const [, jobberInvoiceId, materialId] = match;
    const quantity = typeof value === "string" ? Number(value) : NaN;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    parsedRows.push({
      jobber_invoice_id: jobberInvoiceId,
      material_id: materialId,
      quantity_used: quantity,
    });
  }

  if (parsedRows.length === 0) {
    revalidatePath("/job-costs");
    return;
  }

  // Snapshot each material's current rate so historical entries keep the
  // price that was actually in effect when the usage was logged, even if
  // the rate (e.g. fuel price) changes later.
  const materialIds = Array.from(
    new Set(parsedRows.map((row) => row.material_id))
  );

  const { data: materialsData, error: materialsError } = await supabaseServer
    .from("materials")
    .select("id, unit_cost")
    .in("id", materialIds);

  if (materialsError) {
    throw new Error(
      `Failed to load material rates: ${materialsError.message}`
    );
  }

  const unitCostMap = new Map<string, number>(
    (materialsData ?? []).map((material) => [
      material.id as string,
      Number(material.unit_cost ?? 0),
    ])
  );

  const rows = parsedRows.map((row) => ({
    ...row,
    unit_cost_at_time: unitCostMap.get(row.material_id) ?? 0,
  }));

  const { error } = await supabaseServer
    .from("invoice_material_usage")
    .upsert(rows, { onConflict: "jobber_invoice_id,material_id" });

  if (error) {
    throw new Error(
      `Failed to save invoice material usage: ${error.message}`
    );
  }

  revalidatePath("/job-costs");
}
