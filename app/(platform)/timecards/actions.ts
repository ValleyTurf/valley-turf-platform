"use server";

// Payroll corrections — add a missed punch, fix a wrong time, or delete
// a duplicate entry. Manager/admin only (checked here as defense in
// depth; the real gate is lib/permissionRules.ts's MANAGER_PLUS_PREFIXES
// enforced in (platform)/layout.tsx). Every write here also goes to
// audit_log — unlike most of this app's data, shift punches directly
// determine what someone gets paid, so a full before/after trail
// matters more here than almost anywhere else in the app.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireManager } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

// Fixed -07:00 offset, not the "America/Phoenix" IANA name — same
// reasoning as everywhere else in this app that builds a wall-clock
// local timestamp: Phoenix doesn't observe DST, so the offset is always
// correct, and Postgres/JS both parse a literal offset without needing
// a timezone database lookup.
function toPhoenixIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00-07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type ShiftActionResult = { error: string | null };

export async function addManualShift(params: {
  userId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string | null;
  notes: string | null;
}): Promise<ShiftActionResult> {
  let actor;
  try {
    actor = await requireManager();
  } catch {
    return { error: "Manager access required." };
  }

  const { userId, date, clockInTime, clockOutTime, notes } = params;

  if (!userId) return { error: "Pick an employee." };

  const clockedInAt = toPhoenixIso(date, clockInTime);
  if (!clockedInAt) return { error: "Enter a valid clock-in date/time." };

  let clockedOutAt: string | null = null;
  if (clockOutTime) {
    clockedOutAt = toPhoenixIso(date, clockOutTime);
    if (!clockedOutAt) return { error: "Enter a valid clock-out time." };
    if (clockedOutAt <= clockedInAt) {
      return { error: "Clock out must be after clock in." };
    }
  }

  const { data, error } = await supabaseServer
    .from("shift_time_logs")
    .insert({
      user_id: userId,
      clocked_in_at: clockedInAt,
      clocked_out_at: clockedOutAt,
      notes: notes || null,
      edited_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "shift_time_log",
    entityId: data?.id ?? null,
    entityLabel: "Manual timecard entry",
    after: { user_id: userId, clocked_in_at: clockedInAt, clocked_out_at: clockedOutAt, notes },
  });

  revalidatePath("/timecards");
  revalidatePath("/timeclock");

  return { error: null };
}

export async function updateShift(params: {
  shiftId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string | null;
  notes: string | null;
}): Promise<ShiftActionResult> {
  let actor;
  try {
    actor = await requireManager();
  } catch {
    return { error: "Manager access required." };
  }

  const { shiftId, date, clockInTime, clockOutTime, notes } = params;

  if (!shiftId) return { error: "Missing shift." };

  const clockedInAt = toPhoenixIso(date, clockInTime);
  if (!clockedInAt) return { error: "Enter a valid clock-in date/time." };

  let clockedOutAt: string | null = null;
  if (clockOutTime) {
    clockedOutAt = toPhoenixIso(date, clockOutTime);
    if (!clockedOutAt) return { error: "Enter a valid clock-out time." };
    if (clockedOutAt <= clockedInAt) {
      return { error: "Clock out must be after clock in." };
    }
  }

  const { data: before } = await supabaseServer
    .from("shift_time_logs")
    .select("user_id, clocked_in_at, clocked_out_at, notes")
    .eq("id", shiftId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("shift_time_logs")
    .update({
      clocked_in_at: clockedInAt,
      clocked_out_at: clockedOutAt,
      notes: notes || null,
      edited_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shiftId);

  if (error) return { error: error.message };

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "shift_time_log",
    entityId: shiftId,
    entityLabel: "Timecard correction",
    before,
    after: { clocked_in_at: clockedInAt, clocked_out_at: clockedOutAt, notes },
  });

  revalidatePath("/timecards");
  revalidatePath("/timeclock");

  return { error: null };
}

export async function deleteShift(shiftId: string): Promise<ShiftActionResult> {
  let actor;
  try {
    actor = await requireManager();
  } catch {
    return { error: "Manager access required." };
  }

  if (!shiftId) return { error: "Missing shift." };

  const { data: before } = await supabaseServer
    .from("shift_time_logs")
    .select("user_id, clocked_in_at, clocked_out_at, notes")
    .eq("id", shiftId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("shift_time_logs")
    .delete()
    .eq("id", shiftId);

  if (error) return { error: error.message };

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "shift_time_log",
    entityId: shiftId,
    entityLabel: "Timecard entry deleted",
    before,
  });

  revalidatePath("/timecards");
  revalidatePath("/timeclock");

  return { error: null };
}
