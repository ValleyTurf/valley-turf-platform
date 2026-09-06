import "server-only";

import { supabaseServer } from "@/lib/supabase-server";

// A lighter-weight sibling to app/(platform)/crew-status/page.tsx's own
// data fetch: that page derives a full clocked_in/idle_next_up/finished/
// off state for every crew member today, which is more than either the
// AI Copilot or the Command Center dashboard need. Both of those only
// want "who is on the clock right now, and on what" -- this just reads
// the currently-open timers (visit_time_logs with no stopped_at yet)
// and joins in who + what job, without the full per-person day timeline.

export type ActiveCrewMember = {
  employeeName: string;
  customerName: string;
  jobTitle: string | null;
  clockedInSince: string;
};

export type CrewStatusSnapshot = {
  clockedInCount: number;
  crew: ActiveCrewMember[];
};

type ActiveTimerRow = {
  jobber_visit_id: string;
  user_id: string;
  started_at: string;
};

export async function getActiveCrewSnapshot(): Promise<CrewStatusSnapshot> {
  const { data: timersData, error: timersError } = await supabaseServer
    .from("visit_time_logs")
    .select("jobber_visit_id, user_id, started_at")
    .is("stopped_at", null);

  if (timersError) {
    throw new Error(`Could not load active timers: ${timersError.message}`);
  }

  const timers = (timersData ?? []) as ActiveTimerRow[];

  if (timers.length === 0) {
    return { clockedInCount: 0, crew: [] };
  }

  const userIds = Array.from(new Set(timers.map((t) => t.user_id)));
  const visitIds = Array.from(new Set(timers.map((t) => t.jobber_visit_id)));

  const [{ data: usersData, error: usersError }, { data: visitsData, error: visitsError }] =
    await Promise.all([
      supabaseServer.from("users").select("id, name").in("id", userIds),
      supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, customer_name, title")
        .in("jobber_visit_id", visitIds),
    ]);

  if (usersError) throw new Error(`Could not load users: ${usersError.message}`);
  if (visitsError) throw new Error(`Could not load visits: ${visitsError.message}`);

  const userNameById = new Map(
    ((usersData ?? []) as { id: string; name: string | null }[]).map((u) => [
      u.id,
      u.name ?? "Unknown",
    ])
  );
  const visitById = new Map(
    (
      (visitsData ?? []) as {
        jobber_visit_id: string;
        customer_name: string | null;
        title: string | null;
      }[]
    ).map((v) => [v.jobber_visit_id, v])
  );

  return {
    clockedInCount: timers.length,
    crew: timers.map((t) => {
      const visit = visitById.get(t.jobber_visit_id);
      return {
        employeeName: userNameById.get(t.user_id) ?? "Unknown",
        customerName: visit?.customer_name ?? "Unknown",
        jobTitle: visit?.title ?? null,
        clockedInSince: t.started_at,
      };
    }),
  };
}
