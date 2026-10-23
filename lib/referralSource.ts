// Shared source of truth for the "how did you hear about us?" field on
// the customer record. Used by both the New Customer form and the
// existing-customer Property Profile edit
// (app/components/ReferralSourceField.tsx renders the options, but now
// takes them as a prop instead of importing a static list -- see below),
// the two server actions that write them
// (app/(platform)/customers/new/actions.ts,
// app/(platform)/customers/[id]/actions.ts), the referral report
// (app/(platform)/reports/referrals/page.tsx), and the new
// /settings/referral-sources page where Ryan manages the list himself.
//
// Backed by the referral_sources table (migration
// 099_referral_sources_table.sql) instead of a hardcoded union -- Ryan
// (2026-10-23) wanted a way to add new sources (starting with per-
// neighborhood ones: Sky Crossing, DC Ranch -- people who heard about us
// from someone in that community without scanning that community's QR
// code) without a code change + migration every time.
//
// "referral" and "qr_code" are the two values
// ReferralSourceField.tsx still special-cases by literal string (showing
// the referred-by picker / QR campaign picker respectively). Renaming
// their LABEL from the Settings page is fine; those two VALUES
// themselves should stay put.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

// No longer a fixed union -- the valid set is whatever rows exist in
// referral_sources, which grows from the Settings page. Kept as a type
// alias (rather than deleted) so existing call sites that imported this
// name don't all need a second edit.
export type ReferralSource = string;

export type ReferralSourceOption = {
  value: string;
  label: string;
};

// Active options, in display order -- what every dropdown (New Customer
// form, Property Profile edit) actually offers.
export async function listActiveReferralSources(): Promise<
  ReferralSourceOption[]
> {
  const { data, error } = await supabaseServer
    .from("referral_sources")
    .select("value, label")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("listActiveReferralSources failed:", error.message);
    return [];
  }

  return (data ?? []) as ReferralSourceOption[];
}

// Every option, active or not -- for the /settings/referral-sources
// management page (so Ryan can see and reactivate something he turned
// off) and the referral report (so a deactivated source's historical
// counts don't just vanish).
export async function listAllReferralSources(): Promise<
  (ReferralSourceOption & { active: boolean })[]
> {
  const { data, error } = await supabaseServer
    .from("referral_sources")
    .select("value, label, active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("listAllReferralSources failed:", error.message);
    return [];
  }

  return (data ?? []) as (ReferralSourceOption & { active: boolean })[];
}

// Validates a value against the FULL table (active or not) -- an
// existing customer's source shouldn't fail to save just because
// something else on the form changed, even if that source has since
// been deactivated. The dropdown itself only ever offers active options
// (listActiveReferralSources), so a deactivated value can only reach
// here if it was already on the record being edited.
export async function isReferralSource(value: string | null): Promise<boolean> {
  if (!value) return false;

  const { data, error } = await supabaseServer
    .from("referral_sources")
    .select("value")
    .eq("value", value)
    .maybeSingle();

  if (error) {
    console.error("isReferralSource lookup failed:", error.message);
    return false;
  }

  return data !== null;
}

export async function referralSourceLabel(value: string | null): Promise<string> {
  if (!value) return "Not set";

  const { data } = await supabaseServer
    .from("referral_sources")
    .select("label")
    .eq("value", value)
    .maybeSingle();

  return (data as { label: string } | null)?.label ?? "Not set";
}

// Appended sort_order for a brand-new source added from the Settings
// page -- goes right before 'other' (pinned at 9999, see migration 099)
// so a growing list of community names stays above it instead of
// landing after it in every dropdown.
export async function nextReferralSourceSortOrder(): Promise<number> {
  const { data } = await supabaseServer
    .from("referral_sources")
    .select("sort_order")
    .lt("sort_order", 9000)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = (data as { sort_order: number } | null)?.sort_order ?? 0;
  return current + 10;
}

// Turns a label into a stable slug for the primary key -- lowercased,
// non-alphanumerics collapsed to a single underscore, trimmed. Ryan
// types "Sky Crossing", this stores 'sky_crossing' so
// customers.referral_source stays a short, code-friendly value rather
// than the display label itself, which he might want to reword later
// without orphaning every customer already saved under it.
export function slugifyReferralSource(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
