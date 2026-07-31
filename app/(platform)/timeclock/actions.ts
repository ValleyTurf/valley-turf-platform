"use server";

// Self-service daily clock in/out — deliberately separate from
// my-day/actions.ts's startVisitTimer/stopVisitTimer, which time an
// individual VISIT for job costing. This times a whole WORKDAY for
// payroll (see supabase/migrations/020_add_shift_time_logs.sql's header
// for why the two are kept independent). Same typed-args / {error, ...}
// -return shape as that file, called via useTransition from
// ShiftClock.tsx, not a plain <form action>.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";

export async function clockIn(): Promise<{
  error: string | null;
  shiftId: string | null;
  clockedInAt: string | null;
}> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in.", shiftId: null, clockedInAt: null };
  }

  // One active shift per person, globally — checked here (not just
  // relied on as a UI affordance) since this is a Server Action any
  // signed-in session could call directly, same reasoning as
  // startVisitTimer.
  const { data: existing } = await supabaseServer
    .from("shift_time_logs")
    .select("id")
    .eq("user_id", actor.id)
    .is("clocked_out_at", null)
    .maybeSingle();

  if (existing) {
    return {
      error: "You're already clocked in.",
      shiftId: null,
      clockedInAt: null,
    };
  }

  const clockedInAt = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("shift_time_logs")
    .insert({ user_id: actor.id, clocked_in_at: clockedInAt })
    .select("id")
    .single();

  if (error) {
    return { error: error.message, shiftId: null, clockedInAt: null };
  }

  revalidatePath("/timeclock");
  revalidatePath("/timecards");

  return { error: null, shiftId: data.id as string, clockedInAt };
}

export async function clockOut(shiftId: string): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  if (!shiftId) {
    return { error: "Missing shift." };
  }

  const { error } = await supabaseServer
    .from("shift_time_logs")
    .update({
      clocked_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shiftId)
    .eq("user_id", actor.id)
    .is("clocked_out_at", null);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/timeclock");
  revalidatePath("/timecards");

  return { error: null };
}
