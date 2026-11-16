"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { clearBusinessCache, getBusiness } from "@/lib/business";
import { validateBusinessInput } from "@/lib/businessFormat";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function saveBusinessDetails(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = validateBusinessInput({
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    website: field(formData, "website"),
    ownerFirstName: field(formData, "ownerFirstName"),
  });

  if (!result.ok) {
    redirect(`/settings/business?error=${encodeURIComponent(result.error)}`);
  }

  const before = await getBusiness();

  const { error } = await supabaseServer.from("business_settings").upsert(
    {
      id: 1,
      business_name: result.value.name,
      phone_digits: result.value.phoneDigits,
      website: result.value.website,
      owner_first_name: result.value.ownerFirstName,
      updated_at: new Date().toISOString(),
      updated_by_name: user.name,
    },
    { onConflict: "id" }
  );

  if (error) {
    redirect(`/settings/business?error=${encodeURIComponent(error.message)}`);
  }

  clearBusinessCache();

  await recordAuditLog({
    actor: user,
    action: "update",
    entityType: "business_settings",
    entityId: "1",
    entityLabel: "Business details",
    before: {
      name: before.name,
      phone: before.phoneDigits,
      website: before.website,
      owner_first_name: before.ownerFirstName,
    },
    after: {
      name: result.value.name,
      phone: result.value.phoneDigits,
      website: result.value.website,
      owner_first_name: result.value.ownerFirstName,
    },
  });

  revalidatePath("/settings/business");
  redirect("/settings/business?saved=1");
}
