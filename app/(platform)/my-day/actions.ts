"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { completeJobberVisit } from "@/lib/jobberVisit";

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
