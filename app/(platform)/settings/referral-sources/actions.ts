"use server";

// Server actions for the /settings/referral-sources management page --
// lets Ryan add, rename, and deactivate "how did you hear about us?"
// options himself instead of asking for a code change + migration every
// time (see migration 099_referral_sources_table.sql and
// lib/referralSource.ts for the table/helpers this reads and writes).
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireManager } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  slugifyReferralSource,
  nextReferralSourceSortOrder,
} from "@/lib/referralSource";

// Values app/components/ReferralSourceField.tsx special-cases by literal
// string -- "referral" shows the Referred By customer picker, "qr_code"
// shows the QR campaign picker. Deactivating either would silently
// break that sub-field for anyone who then picks from what's left, so
// setReferralSourceActive refuses to turn these two off. Renaming their
// label is still fine (see renameReferralSource below).
const STRUCTURAL_VALUES = ["referral", "qr_code"];

function revalidateReferralSourcePages() {
  revalidatePath("/settings/referral-sources");
  revalidatePath("/customers/new");
  revalidatePath("/reports/referrals");
}

export async function addReferralSource(
  label: string
): Promise<{ error: string | null }> {
  const actor = await requireManager();
  const trimmed = label.trim();

  if (!trimmed) {
    return { error: "Enter a name for the source." };
  }

  const value = slugifyReferralSource(trimmed);

  if (!value) {
    return {
      error:
        "That name doesn't convert into a usable value -- try adding a letter or number.",
    };
  }

  const { data: existing } = await supabaseServer
    .from("referral_sources")
    .select("label")
    .eq("value", value)
    .maybeSingle();

  if (existing) {
    return {
      error: `A source with a similar name already exists: "${(existing as { label: string }).label}".`,
    };
  }

  const sortOrder = await nextReferralSourceSortOrder();

  const { error } = await supabaseServer.from("referral_sources").insert({
    value,
    label: trimmed,
    active: true,
    sort_order: sortOrder,
  });

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "referral_source",
    entityId: value,
    entityLabel: trimmed,
    after: { value, label: trimmed },
  });

  revalidateReferralSourcePages();

  return { error: null };
}

export async function setReferralSourceActive(
  value: string,
  active: boolean
): Promise<{ error: string | null }> {
  const actor = await requireManager();

  if (!active && STRUCTURAL_VALUES.includes(value)) {
    return {
      error:
        "This source has special behavior built into the form (Referred By / QR code picker) and can't be turned off.",
    };
  }

  const { error } = await supabaseServer
    .from("referral_sources")
    .update({ active })
    .eq("value", value);

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "referral_source",
    entityId: value,
    entityLabel: value,
    after: { active },
  });

  revalidateReferralSourcePages();

  return { error: null };
}

export async function renameReferralSource(
  value: string,
  label: string
): Promise<{ error: string | null }> {
  const actor = await requireManager();
  const trimmed = label.trim();

  if (!trimmed) {
    return { error: "Enter a name for the source." };
  }

  const { error } = await supabaseServer
    .from("referral_sources")
    .update({ label: trimmed })
    .eq("value", value);

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "referral_source",
    entityId: value,
    entityLabel: trimmed,
    after: { label: trimmed },
  });

  revalidateReferralSourcePages();

  return { error: null };
}
