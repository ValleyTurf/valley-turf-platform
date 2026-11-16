"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { pairKey } from "@/lib/duplicateCustomersLogic";

// Folds the duplicate into the customer being kept: every invoice, job,
// visit, payment, message, saved card and so on moves over, blank details
// are filled in, and the duplicate is removed (a full copy is kept in
// customer_merges). One database transaction -- all or nothing.
export async function mergeCustomers(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const keep = String(formData.get("keep") ?? "");
  const drop = String(formData.get("drop") ?? "");

  if (!keep || !drop || keep === drop) {
    throw new Error("Pick two different customers.");
  }

  const { data, error } = await supabaseServer.rpc("merge_customers", {
    p_keep: keep,
    p_drop: drop,
    p_actor: actor.name,
  });

  if (error) throw new Error(`Merge failed, nothing was changed: ${error.message}`);

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "customer",
    entityId: keep,
    entityLabel: "Customer merge",
    note: `Merged customer ${drop} into ${keep}. ${JSON.stringify(data ?? {})}`,
  });

  revalidatePath("/customers");
  revalidatePath("/customers/duplicates");
}

// "These are two different people": never suggest this pair again.
export async function dismissPair(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const a = String(formData.get("a") ?? "");
  const b = String(formData.get("b") ?? "");

  if (!a || !b) throw new Error("Missing customers.");

  const { error } = await supabaseServer
    .from("customer_duplicate_dismissals")
    .upsert(
      { pair_key: pairKey(a, b), dismissed_by: actor.name },
      { onConflict: "pair_key" }
    );

  if (error) throw new Error(`Couldn't save that: ${error.message}`);

  revalidatePath("/customers/duplicates");
}
