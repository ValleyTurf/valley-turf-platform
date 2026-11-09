// Supabase-backed half of the Schedule's service-color system. See
// lib/scheduleServiceColorPalette.ts for the pure, client-safe half
// (the NAMED_COLORS palette and the string-matching helpers), which this
// file re-exports so existing importers only need one import line.
//
// Used by app/(platform)/schedule/page.tsx (to classify each visit into
// a chip/pin color) and the /settings/schedule-colors management page
// (to let Ryan edit the rules himself) -- backed by the
// schedule_service_colors table (migration
// 104_schedule_service_colors.sql) instead of the SERVICE_COLOR_RULES
// array that used to be hardcoded directly in schedule/page.tsx.
//
// Ryan (2026-11-09): "We set colors for the different cleanings in the
// schedule. Is there a menu where I can go and change these colors?" --
// chose "Build a Settings page" over a one-off code change.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  isNamedColorKey,
  type NamedColorKey,
  type ServiceColorRule,
} from "@/lib/scheduleServiceColorPalette";

export * from "@/lib/scheduleServiceColorPalette";

type ServiceColorRuleRow = {
  id: string;
  sort_order: number;
  label: string;
  keywords: string[] | null;
  color_key: string;
  is_default: boolean;
};

function toServiceColorRule(row: ServiceColorRuleRow): ServiceColorRule {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    label: row.label,
    keywords: row.keywords ?? [],
    // Falls back to emerald (the old hardcoded fallback color) for a row
    // whose color_key somehow isn't one of the ten NAMED_COLORS, so bad
    // data here can't crash the whole Schedule page.
    colorKey: isNamedColorKey(row.color_key)
      ? (row.color_key as NamedColorKey)
      : "emerald",
    isDefault: row.is_default,
  };
}

// Appended sort_order for a brand-new rule added from the Settings page
// -- goes right before the pinned-last default row (9999, see migration
// 104) so a growing list of rules stays above it instead of landing
// after it in the matching order.
export async function nextServiceColorRuleSortOrder(): Promise<number> {
  const { data } = await supabaseServer
    .from("schedule_service_colors")
    .select("sort_order")
    .eq("is_default", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = (data as { sort_order: number } | null)?.sort_order ?? 0;
  return current + 10;
}

// Every rule, in display/matching order -- what both the Schedule page
// (to classify visits) and the Settings page (to list/edit) read.
export async function fetchServiceColorRules(): Promise<ServiceColorRule[]> {
  const { data, error } = await supabaseServer
    .from("schedule_service_colors")
    .select("id, sort_order, label, keywords, color_key, is_default")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("fetchServiceColorRules failed:", error.message);
    return [];
  }

  return ((data ?? []) as ServiceColorRuleRow[]).map(toServiceColorRule);
}
