"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { rescheduleJobberVisit, skipJobberVisit } from "@/lib/jobberVisit";

// Arizona doesn't observe DST, so Phoenix local time is always UTC-7 —
// same fixed-offset assumption schedule/page.tsx already makes. Used to
// translate the Phoenix-local date/time this app collects back into the
// UTC timestamp jobber_visits (the local mirror the schedule/my-day/
// job-costs pages actually read) stores everything in.
const BUSINESS_UTC_OFFSET = "-07:00";

function toUtcIso(date: string, time: string): string | null {
  const parsed = new Date(`${date}T${time}:00${BUSINESS_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function revalidateVisitPaths(): void {
  revalidatePath("/schedule");
  revalidatePath("/my-day");
  revalidatePath("/job-costs");
  revalidatePath("/recurring-services");
}

// Moves a single visit's date/time in Jobber (see lib/jobberVisit.ts's
// rescheduleJobberVisit for the mutation itself), then mirrors the same
// change onto the local jobber_visits row directly — the schedule/my-day/
// job-costs pages all read that local table, not live Jobber, so without
// this the moved visit would still show at its old slot until the
// VISIT_UPDATE webhook round-trips back (usually fast, but no reason to
// make staff wait or refresh twice for something we already know
// succeeded).
//
// Called directly from client components (the schedule detail modal's
// reschedule form, and month-view drag-and-drop) via useTransition, not
// bound to a <form action>, so it returns an { error } result instead of
// redirecting — the caller stays on the same calendar view either way.
export async function rescheduleVisit(
  visitId: string,
  date: string,
  startTime: string | null,
  endTime: string | null
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to reschedule a visit." };
  }

  if (!visitId || !date) {
    return { error: "Missing visit or date." };
  }

  const result = await rescheduleJobberVisit({
    visitId,
    date,
    startTime,
    endTime,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (startTime) {
    const iso = toUtcIso(date, startTime);
    if (iso) updates.start_at = iso;
  }

  if (endTime) {
    const iso = toUtcIso(date, endTime);
    if (iso) updates.end_at = iso;
  }

  await supabaseServer
    .from("jobber_visits")
    .update(updates)
    .eq("jobber_visit_id", visitId);

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "visit",
    entityId: visitId,
    entityLabel: "Reschedule visit",
    after: { date, start_time: startTime, end_time: endTime },
  });

  revalidateVisitPaths();

  return { error: null };
}

// Assigns (or unassigns, when userId is null) a crew member to a single
// visit — see the 017_add_visit_assignments.sql migration header for why
// this is a local-only table rather than synced to Jobber's own
// assignedUsers concept. Managers/admins only, enforced here (not just in
// the UI) since this is a Server Action any signed-in session could in
// principle call directly.
export async function assignVisit(
  visitId: string,
  userId: string | null
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to assign a visit." };
  }

  if (actor.role !== "admin" && actor.role !== "manager") {
    return { error: "Only managers and admins can assign visits." };
  }

  if (!visitId) {
    return { error: "Missing visit." };
  }

  if (userId === null) {
    const { error } = await supabaseServer
      .from("visit_assignments")
      .delete()
      .eq("jobber_visit_id", visitId);

    if (error) {
      return { error: error.message };
    }

    await recordAuditLog({
      actor,
      action: "delete",
      entityType: "visit_assignment",
      entityId: visitId,
      entityLabel: "Unassign visit",
    });

    revalidateVisitPaths();

    return { error: null };
  }

  const { error } = await supabaseServer.from("visit_assignments").upsert(
    {
      jobber_visit_id: visitId,
      assigned_user_id: userId,
      assigned_by: actor.id,
      assigned_at: new Date().toISOString(),
    },
    { onConflict: "jobber_visit_id" }
  );

  if (error) {
    return { error: error.message };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "visit_assignment",
    entityId: visitId,
    entityLabel: "Assign visit",
    after: { assigned_user_id: userId },
  });

  revalidateVisitPaths();

  return { error: null };
}

// "Skip" this one occurrence — see lib/jobberVisit.ts's skipJobberVisit
// header comment: Jobber has no dedicated "skip" primitive, deleting the
// single visit IS the mechanism, and it doesn't touch the job or any
// other visit. Same local cleanup as handleDestroyedVisit in
// lib/jobberWebhookProcessor.ts (that VISIT_DESTROY webhook will also
// fire for this and re-run the same cleanup — harmless, deleting an
// already-deleted row is a no-op).
export async function skipVisit(
  visitId: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to skip a visit." };
  }

  if (!visitId) {
    return { error: "Missing visit." };
  }

  const result = await skipJobberVisit(visitId);

  if (!result.ok) {
    return { error: result.error };
  }

  await supabaseServer
    .from("visit_material_usage")
    .delete()
    .eq("jobber_visit_id", visitId);

  await supabaseServer
    .from("visit_equipment_usage")
    .delete()
    .eq("jobber_visit_id", visitId);

  await supabaseServer.from("jobber_visits").delete().eq("jobber_visit_id", visitId);

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "visit",
    entityId: visitId,
    entityLabel: "Skip visit",
  });

  revalidateVisitPaths();

  return { error: null };
}
