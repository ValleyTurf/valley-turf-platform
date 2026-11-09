"use server";

// Server actions for the /settings/schedule-colors management page --
// lets Ryan add, edit, reorder, and remove the rules that decide which
// color each service type gets on the Schedule, instead of asking for a
// code change every time (see migration
// 104_schedule_service_colors.sql and lib/scheduleServiceColors.ts for
// the table/helpers this reads and writes).
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireManager } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  fetchServiceColorRules,
  isNamedColorKey,
  nextServiceColorRuleSortOrder,
  parseServiceColorKeywords,
} from "@/lib/scheduleServiceColors";

function revalidateScheduleColorPages() {
  revalidatePath("/settings/schedule-colors");
  revalidatePath("/schedule");
}

export async function addServiceColorRule(
  label: string,
  keywordsText: string,
  colorKey: string
): Promise<{ error: string | null }> {
  const actor = await requireManager();
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return { error: "Enter a name for this rule." };
  }

  const keywords = parseServiceColorKeywords(keywordsText);
  if (keywords.length === 0) {
    return {
      error:
        "Enter at least one match word -- e.g. \"quarterly\", or \"full, clean\" for a service whose title needs to contain both.",
    };
  }

  if (!isNamedColorKey(colorKey)) {
    return { error: "Pick a color." };
  }

  const sortOrder = await nextServiceColorRuleSortOrder();

  const { data, error } = await supabaseServer
    .from("schedule_service_colors")
    .insert({
      sort_order: sortOrder,
      label: trimmedLabel,
      keywords,
      color_key: colorKey,
      is_default: false,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "schedule_service_color",
    entityId: (data as { id: string }).id,
    entityLabel: trimmedLabel,
    after: { label: trimmedLabel, keywords, color_key: colorKey },
  });

  revalidateScheduleColorPages();

  return { error: null };
}

export async function updateServiceColorRule(
  id: string,
  label: string,
  keywordsText: string,
  colorKey: string
): Promise<{ error: string | null }> {
  const actor = await requireManager();
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return { error: "Enter a name for this rule." };
  }

  if (!isNamedColorKey(colorKey)) {
    return { error: "Pick a color." };
  }

  const { data: existing, error: fetchError } = await supabaseServer
    .from("schedule_service_colors")
    .select("is_default")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: fetchError?.message ?? "That rule no longer exists." };
  }

  const isDefault = (existing as { is_default: boolean }).is_default;

  // The fallback/"everything else" row never matches by keyword -- it's
  // used whenever nothing else matches -- so its keywords always stay
  // empty regardless of what's in the form.
  let keywords: string[] = [];
  if (!isDefault) {
    keywords = parseServiceColorKeywords(keywordsText);
    if (keywords.length === 0) {
      return {
        error:
          "Enter at least one match word -- e.g. \"quarterly\", or \"full, clean\" for a service whose title needs to contain both.",
      };
    }
  }

  const { error } = await supabaseServer
    .from("schedule_service_colors")
    .update({
      label: trimmedLabel,
      keywords,
      color_key: colorKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "schedule_service_color",
    entityId: id,
    entityLabel: trimmedLabel,
    after: { label: trimmedLabel, keywords, color_key: colorKey },
  });

  revalidateScheduleColorPages();

  return { error: null };
}

export async function deleteServiceColorRule(
  id: string
): Promise<{ error: string | null }> {
  const actor = await requireManager();

  const { data: existing, error: fetchError } = await supabaseServer
    .from("schedule_service_colors")
    .select("label, is_default")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: fetchError?.message ?? "That rule no longer exists." };
  }

  const row = existing as { label: string; is_default: boolean };

  if (row.is_default) {
    return {
      error:
        "This is the fallback color used whenever nothing else matches -- it can't be deleted, only recolored.",
    };
  }

  const { error } = await supabaseServer
    .from("schedule_service_colors")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "schedule_service_color",
    entityId: id,
    entityLabel: row.label,
    before: { label: row.label },
  });

  revalidateScheduleColorPages();

  return { error: null };
}

// Swaps this rule's position with the one above/below it in the match
// order -- rules are tried top-to-bottom, first match wins, so order
// matters whenever two rules could both match the same service title.
// The pinned-last fallback row is excluded from reordering entirely (it
// always matches "nothing else matched", a concept that isn't
// comparable to the others).
export async function moveServiceColorRule(
  id: string,
  direction: "up" | "down"
): Promise<{ error: string | null }> {
  const actor = await requireManager();

  const rules = (await fetchServiceColorRules()).filter((r) => !r.isDefault);
  const index = rules.findIndex((r) => r.id === id);

  if (index === -1) {
    return { error: "That rule no longer exists." };
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rules.length) {
    return { error: null };
  }

  const current = rules[index];
  const target = rules[targetIndex];

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    supabaseServer
      .from("schedule_service_colors")
      .update({ sort_order: target.sortOrder })
      .eq("id", current.id),
    supabaseServer
      .from("schedule_service_colors")
      .update({ sort_order: current.sortOrder })
      .eq("id", target.id),
  ]);

  if (error1 || error2) {
    return { error: (error1 ?? error2)?.message ?? "Couldn't reorder." };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "schedule_service_color",
    entityId: current.id,
    entityLabel: current.label,
    note: `Moved ${direction} past "${target.label}"`,
  });

  revalidateScheduleColorPages();

  return { error: null };
}
