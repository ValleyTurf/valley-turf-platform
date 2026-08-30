"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { isChurnReason } from "@/lib/deactivation";

// Shared by the Reactivation Pipeline's "Save" form and the
// Deactivation section's "Save" form (both rendered via
// ExclusionSaveForm.tsx) — both just log a reason against a customer
// under a different exclusion_type, so one action and one shared
// CHURN_REASONS list (see lib/deactivation.ts) keeps them from
// drifting into two different reason vocabularies again.
//
// Pulled into its own module-level "use server" file (rather than an
// inline action inside page.tsx) specifically so ExclusionSaveForm.tsx
// — a client component — can import and call it directly via
// useTransition, instead of relying on a bare <form action={...}>'s
// implicit post-submit refresh, which wasn't reliably updating the
// list without a manual page reload.
export async function saveExclusionReason(formData: FormData) {
  const jobberClientId = String(
    formData.get("jobber_client_id") ?? "",
  ).trim();
  const exclusionType = String(formData.get("exclusion_type") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const allowedTypes = new Set(["reactivation", "deactivation"]);

  if (
    !jobberClientId ||
    !allowedTypes.has(exclusionType) ||
    !isChurnReason(reason)
  ) {
    return;
  }

  const { error } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .upsert(
      {
        jobber_client_id: jobberClientId,
        exclusion_type: exclusionType,
        reason,
        excluded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "jobber_client_id,exclusion_type",
        ignoreDuplicates: false,
      },
    );

  if (error) {
    throw new Error(`Could not save this customer's status: ${error.message}`);
  }

  revalidatePath("/customers/intelligence");
  revalidatePath("/reactivation");
}
