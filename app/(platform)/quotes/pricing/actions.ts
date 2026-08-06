"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { TURF_SIZE_RANGES } from "@/lib/servicePricing";

type ServicePricingRow = {
  service_name: string;
};

// Case-insensitive match against whatever's already on file, so typing
// "aeration" when "Aeration" already exists reuses the existing row
// set instead of silently creating a second, differently-cased
// service — see 032_add_service_pricing.sql's comment for why this is
// handled here instead of a DB-level expression index.
async function findCanonicalServiceName(rawName: string): Promise<string> {
  const trimmed = rawName.trim();

  const { data } = await supabaseServer
    .from("service_pricing")
    .select("service_name")
    .ilike("service_name", trimmed)
    .limit(1);

  const existing = (data as ServicePricingRow[] | null)?.[0]?.service_name;
  return existing ?? trimmed;
}

// Saves one service's full price grid in one call: a value present for
// a range upserts that row, a blank value deletes it if it existed
// (this is persistent pricing config, not a per-visit usage log, so
// "blank" here means "no price set for this range" — different from
// the "blank = leave untouched" convention on My Day's quick-entry
// form, which is logging actual usage for one visit, not editing a
// standing table).
export async function saveServicePricing(
  rawServiceName: string,
  priceByRange: Record<string, string>
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "You must be signed in." };

  const trimmedName = rawServiceName.trim();
  if (!trimmedName) return { error: "Service name is required." };

  const serviceName = await findCanonicalServiceName(trimmedName);

  const upserts: { service_name: string; turf_size_range: string; price: number; updated_at: string }[] = [];
  const rangesToClear: string[] = [];

  for (const range of TURF_SIZE_RANGES) {
    const raw = priceByRange[range];
    const trimmedValue = typeof raw === "string" ? raw.trim() : "";

    if (!trimmedValue) {
      rangesToClear.push(range);
      continue;
    }

    const value = Number(trimmedValue);
    if (!Number.isFinite(value) || value < 0) {
      return { error: `Invalid price for ${range} sq ft.` };
    }

    upserts.push({
      service_name: serviceName,
      turf_size_range: range,
      price: value,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length > 0) {
    const { error } = await supabaseServer
      .from("service_pricing")
      .upsert(upserts, { onConflict: "service_name,turf_size_range" });

    if (error) {
      return { error: `Failed to save pricing: ${error.message}` };
    }
  }

  if (rangesToClear.length > 0) {
    const { error } = await supabaseServer
      .from("service_pricing")
      .delete()
      .eq("service_name", serviceName)
      .in("turf_size_range", rangesToClear);

    if (error) {
      return { error: `Failed to clear pricing: ${error.message}` };
    }
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "service_pricing",
    entityId: serviceName,
    entityLabel: `${serviceName} pricing`,
    after: { pricedRanges: upserts.length, clearedRanges: rangesToClear.length },
  });

  revalidatePath("/quotes/pricing");
  revalidatePath("/quotes/new");

  return { error: null };
}

export async function deleteServicePricing(serviceName: string): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "You must be signed in." };

  const trimmed = serviceName.trim();
  if (!trimmed) return { error: "Missing service." };

  const { error } = await supabaseServer.from("service_pricing").delete().eq("service_name", trimmed);

  if (error) {
    return { error: `Failed to delete pricing: ${error.message}` };
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "service_pricing",
    entityId: trimmed,
    entityLabel: `${trimmed} pricing`,
  });

  revalidatePath("/quotes/pricing");
  revalidatePath("/quotes/new");

  return { error: null };
}
