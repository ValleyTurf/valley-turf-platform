"use server";

// Manager-side escape hatch for a stuck job timer. startVisitTimer
// (my-day/actions.ts) enforces one active timer per person globally, so
// if a tech's active timer belongs to a visit that isn't on their
// current My Day list (see page.tsx's comment above
// missingActiveVisitIds — the visit's start_at doesn't land in today's
// window, or they just forgot to stop it days ago), they have no Stop
// button anywhere reachable to them: their My Day only renders a Stop
// control on the card for the specific visit that's actively timing, and
// that card isn't there. Brittanie hit exactly this — couldn't start a
// new timer ("already have one running") and had nothing on her screen
// to stop the old one. Crew Status already surfaces the stuck timer (see
// page.tsx's statusFor -> "clocked_in"), so the fix lives here: a
// manager/admin can force-stop anyone's active timer from this page.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

export async function forceStopTimer(
  targetUserId: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor || (actor.role !== "admin" && actor.role !== "manager")) {
    return { error: "Manager access required." };
  }

  if (!targetUserId) {
    return { error: "Missing crew member." };
  }

  const { data: activeLog, error: lookupError } = await supabaseServer
    .from("visit_time_logs")
    .select("id, jobber_visit_id, started_at")
    .eq("user_id", targetUserId)
    .is("stopped_at", null)
    .maybeSingle();

  if (lookupError) {
    return { error: `Couldn't look up timer: ${lookupError.message}` };
  }

  if (!activeLog) {
    // Already stopped by the time the manager tapped this (they beat you
    // to it, or it self-resolved) -- not really a failure from the
    // manager's point of view, but say so rather than pretending success.
    return { error: "No active timer found — it may have already been stopped." };
  }

  const [{ data: targetUser }, { data: visit }] = await Promise.all([
    supabaseServer.from("users").select("name").eq("id", targetUserId).maybeSingle(),
    supabaseServer
      .from("jobber_visits")
      .select("customer_name")
      .eq("jobber_visit_id", activeLog.jobber_visit_id)
      .maybeSingle(),
  ]);

  const stoppedAt = new Date().toISOString();

  const { error: updateError } = await supabaseServer
    .from("visit_time_logs")
    .update({ stopped_at: stoppedAt })
    .eq("id", activeLog.id);

  if (updateError) {
    return { error: `Couldn't stop timer: ${updateError.message}` };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "visit_time_log",
    entityId: activeLog.id,
    entityLabel: `Force-stopped ${targetUser?.name ?? "crew member"}'s timer (${
      visit?.customer_name ?? "unknown job"
    })`,
    before: { started_at: activeLog.started_at, stopped_at: null },
    after: { stopped_at: stoppedAt },
  });

  revalidatePath("/crew-status");
  revalidatePath("/my-day");
  revalidatePath("/job-costs");

  return { error: null };
}
