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

function cleanNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateCustomerProfile(
  jobberClientId: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  const updates = {
    turf_size_sqft: cleanNumber(formData.get("turf_size_sqft")),
    gate_code: cleanText(formData.get("gate_code")),
    pet_count: cleanNumber(formData.get("pet_count")),
    pet_names: cleanText(formData.get("pet_names")),
    odor_level: cleanText(formData.get("odor_level")),
    subscription_plan: cleanText(formData.get("subscription_plan")),
    service_instructions: cleanText(formData.get("service_instructions")),
    notes: cleanText(formData.get("notes")),
  };

  const { data: before } = await supabaseServer
    .from("customers")
    .select(
      "full_name, turf_size_sqft, gate_code, pet_count, pet_names, odor_level, subscription_plan, service_instructions, notes"
    )
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("customers")
    .update(updates)
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    throw new Error(`Failed to update customer profile: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "customer",
    entityId: jobberClientId,
    entityLabel: before?.full_name ?? null,
    before,
    after: { ...updates, full_name: before?.full_name ?? null },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}
