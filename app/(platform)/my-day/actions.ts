"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { completeJobberVisit } from "@/lib/jobberVisit";

// Kept as a private, file-local copy of the same list rendered on the My
// Day page (QUICK_ENTRY_MATERIALS/QUICK_ENTRY_EQUIPMENT in page.tsx) —
// this file is "use server" and can only export async functions, so
// there's no way to share one constant between the two without a third
// file just for this. If the curated list ever changes, update both.
const QUICK_ENTRY_MATERIALS = ["Infill", "OxyTurf"];
const QUICK_ENTRY_EQUIPMENT = ["Blower", "Power Broom", "Vacuum"];

// Marks a stop done from the field — see lib/jobberVisit.ts's
// completeJobberVisit for the mutation itself. A plain <form action>
// rather than useTransition/client state (unlike the schedule page's
// reschedule/skip/assign, which all need instant local feedback in a
// modal that stays open) — My Day is otherwise a fully server-rendered
// page, and revalidatePath here is enough to make the completed stop's
// badge flip to "Done" on the next render.
export async function completeVisit(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const visitId = formData.get("visit_id");

  if (!actor || typeof visitId !== "string" || !visitId) {
    return;
  }

  const result = await completeJobberVisit(visitId);

  if (!result.ok) {
    // My Day has no error-banner slot today (this is a plain form, not a
    // client component with local state) — logged server-side so a
    // failure is at least visible in Vercel's logs rather than silently
    // swallowed. Worth adding an inline error surface if this turns out
    // to fail often in practice.
    console.error(`completeVisit failed for ${visitId}:`, result.error);
    return;
  }

  await supabaseServer
    .from("jobber_visits")
    .update({
      visit_status: "COMPLETED",
      completed_at: result.value.completedAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("jobber_visit_id", visitId);

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "visit",
    entityId: visitId,
    entityLabel: "Mark visit complete",
  });

  revalidatePath("/my-day");
  revalidatePath("/schedule");
  revalidatePath("/job-costs");
  revalidatePath("/recurring-services");
}

// Job timer — entirely local (see 019_add_visit_time_logs.sql's header
// comment for why), kept as its own Start/Stop pair rather than folded
// into completeVisit above: a tech might need to stop the clock for a
// break or because they're coming back later without the visit actually
// being finished, so tying "stop" to "complete" would be wrong more
// often than it'd save a tap. These take typed args and return
// {error, ...} rather than FormData/void — called from VisitTimer.tsx
// (a client component, since the live-ticking elapsed display needs
// real client state) via useTransition, not a plain form.
export async function startVisitTimer(
  visitId: string
): Promise<{ error: string | null; timeLogId: string | null; startedAt: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in.", timeLogId: null, startedAt: null };
  }

  if (!visitId) {
    return { error: "Missing visit.", timeLogId: null, startedAt: null };
  }

  // One active timer per person, globally — a tech can't physically be
  // clocked into two jobs at once. Checked here (not just relied on as
  // a UI affordance) since this is a Server Action any signed-in session
  // could call directly.
  const { data: existing } = await supabaseServer
    .from("visit_time_logs")
    .select("id, jobber_visit_id")
    .eq("user_id", actor.id)
    .is("stopped_at", null)
    .maybeSingle();

  if (existing) {
    if (existing.jobber_visit_id === visitId) {
      return {
        error: "Timer's already running for this visit.",
        timeLogId: null,
        startedAt: null,
      };
    }

    const { data: otherVisit } = await supabaseServer
      .from("jobber_visits")
      .select("customer_name")
      .eq("jobber_visit_id", existing.jobber_visit_id)
      .maybeSingle();

    return {
      error: `You already have a timer running for ${otherVisit?.customer_name ?? "another visit"} — stop that one first.`,
      timeLogId: null,
      startedAt: null,
    };
  }

  const startedAt = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("visit_time_logs")
    .insert({ jobber_visit_id: visitId, user_id: actor.id, started_at: startedAt })
    .select("id")
    .single();

  if (error) {
    return { error: error.message, timeLogId: null, startedAt: null };
  }

  revalidatePath("/my-day");

  return { error: null, timeLogId: data.id as string, startedAt };
}

export async function stopVisitTimer(
  timeLogId: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  if (!timeLogId) {
    return { error: "Missing timer." };
  }

  const { error } = await supabaseServer
    .from("visit_time_logs")
    .update({ stopped_at: new Date().toISOString() })
    .eq("id", timeLogId)
    .eq("user_id", actor.id)
    .is("stopped_at", null);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/my-day");

  return { error: null };
}

// Quick job-cost entry for the crew: Infill/OxyTurf usage and
// Blower/Power Broom/Vacuum equipment, right on the My Day card, instead
// of making a tech wait for a manager to log it later on the full /job-costs
// page (which still exists for the fuller material list plus
// manager-only fields like mileage/fuel). Writes to the exact same
// visit_material_usage/visit_equipment_usage tables /job-costs reads
// from, so anything saved here shows up there immediately — same "value
// present = save, blank = leave untouched" behavior for materials as
// saveVisitCosts (app/(platform)/materials/actions.ts), and the same
// "delete then re-insert checked ones" pattern for equipment.
export async function saveVisitJobCostQuickEntry(
  visitId: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor || !visitId) {
    return;
  }

  // Same "lowercase, spaces -> underscores" transform the My Day page
  // uses to build each field's name= attribute — quickEntryFieldKey() in
  // my-day/page.tsx. Kept as an independent copy rather than a shared
  // import: this file is "use server" and can only export async
  // functions (see the commit that fixed the Vercel build for exporting
  // a plain constant from a 'use server' file), so a shared helper isn't
  // an option without a third file just for this.
  function fieldKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "_");
  }

  const materialFields = QUICK_ENTRY_MATERIALS.map((materialName) => ({
    formKey: fieldKey(materialName),
    materialName,
  }));

  const equipmentFields = QUICK_ENTRY_EQUIPMENT.map((equipmentName) => ({
    formKey: fieldKey(equipmentName),
    equipmentName,
  }));

  const [materialsResult, equipmentResult] = await Promise.all([
    supabaseServer
      .from("materials")
      .select("id, name, unit_cost")
      .in(
        "name",
        materialFields.map((field) => field.materialName)
      ),
    supabaseServer
      .from("equipment")
      .select("id, name")
      .in(
        "name",
        equipmentFields.map((field) => field.equipmentName)
      ),
  ]);

  const materialByName = new Map<
    string,
    { id: string; unit_cost: number }
  >();
  for (const row of materialsResult.data ?? []) {
    materialByName.set(row.name as string, {
      id: row.id as string,
      unit_cost: Number(row.unit_cost ?? 0),
    });
  }

  const equipmentByName = new Map<string, string>();
  for (const row of equipmentResult.data ?? []) {
    equipmentByName.set(row.name as string, row.id as string);
  }

  const usageRows: {
    jobber_visit_id: string;
    material_id: string;
    quantity_used: number;
    unit_cost_at_time: number;
  }[] = [];

  for (const field of materialFields) {
    const material = materialByName.get(field.materialName);
    if (!material) continue;

    const rawValue = formData.get(field.formKey);
    const quantity =
      typeof rawValue === "string" ? Number(rawValue.trim()) : NaN;

    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    usageRows.push({
      jobber_visit_id: visitId,
      material_id: material.id,
      quantity_used: quantity,
      unit_cost_at_time: material.unit_cost,
    });
  }

  if (usageRows.length > 0) {
    const { error } = await supabaseServer
      .from("visit_material_usage")
      .upsert(usageRows, { onConflict: "jobber_visit_id,material_id" });

    if (error) {
      console.error(
        `saveVisitJobCostQuickEntry material usage failed for ${visitId}:`,
        error
      );
    }
  }

  const knownEquipmentIds = equipmentFields
    .map((field) => equipmentByName.get(field.equipmentName))
    .filter((id): id is string => Boolean(id));

  if (knownEquipmentIds.length > 0) {
    const checkedEquipmentIds = equipmentFields
      .filter((field) => formData.get(field.formKey) === "1")
      .map((field) => equipmentByName.get(field.equipmentName))
      .filter((id): id is string => Boolean(id));

    const { error: deleteError } = await supabaseServer
      .from("visit_equipment_usage")
      .delete()
      .eq("jobber_visit_id", visitId)
      .in("equipment_id", knownEquipmentIds);

    if (deleteError) {
      console.error(
        `saveVisitJobCostQuickEntry equipment reset failed for ${visitId}:`,
        deleteError
      );
    } else if (checkedEquipmentIds.length > 0) {
      const { error: insertError } = await supabaseServer
        .from("visit_equipment_usage")
        .insert(
          checkedEquipmentIds.map((equipmentId) => ({
            jobber_visit_id: visitId,
            equipment_id: equipmentId,
          }))
        );

      if (insertError) {
        console.error(
          `saveVisitJobCostQuickEntry equipment save failed for ${visitId}:`,
          insertError
        );
      }
    }
  }

  revalidatePath("/my-day");
  revalidatePath("/job-costs");
}
