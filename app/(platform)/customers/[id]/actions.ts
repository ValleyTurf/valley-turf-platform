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

  const { error } = await supabaseServer
    .from("customers")
    .update(updates)
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    throw new Error(`Failed to update customer profile: ${error.message}`);
  }

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}
