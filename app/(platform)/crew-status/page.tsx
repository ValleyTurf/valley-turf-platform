export const dynamic = "force-dynamic";
export const revalidate = 0;

// Live dispatch board: at a glance, who's clocked in right now (and on
// what job, and for how long), who's idle between stops, who's already
// finished their day, and who has nothing scheduled. Built entirely from
// data the timer/assignment features already produce (visit_time_logs,
// visit_assignments) — nothing new to sync from Jobber. Manager+ only:
// see lib/permissionRules.ts's MANAGER_PLUS_PREFIXES (staff shouldn't
// see a roster of their coworkers' live clock activity) — enforced at
// the route level via proxy.ts, this page's own role check below is
// defense in depth in case that ever drifts.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import LiveElapsed from "./LiveElapsed";
import AutoRefresh from "./AutoRefresh";
import ForceStopTimerButton from "./ForceStopTimerButton";

type UserRow = {
  id: string;
  name: string;
  role: string;
  inactiveAccount?: boolean;
};

type VisitRow = {
  jobber_visit_id: string;
  customer_name: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
};

type AssignmentRow = {
  jobber_visit_id: string;
  assigned_user_id: string;
};

type ActiveTimerRow = {
  id: string;
  jobber_visit_id: string;
  user_id: string;
  started_at: string;
};

type TimeLogRow = {
  user_id: string;
  started_at: string;
  stopped_at: string | null;
};

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTime(value: string | null): string {
  if (!value) return "Unscheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

// Same "{Customer} - {Service}" convention used on /schedule and /my-day
// — strip the leading customer segment so a card doesn't repeat the
// customer name twice.
function visitServiceLabel(title: string | null): string | null {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return null;

  const separatorIndex = trimmed.indexOf(" - ");
  if (separatorIndex === -1) return trimmed;

  const service = trimmed.slice(separatorIndex + 3).trim();
  return service || trimmed;
}

type CrewStatus =
  | { kind: "clocked_in"; startedAt: string; visit: VisitRow }
  | { kind: "idle_next_up"; visit: VisitRow; doneCount: number; totalCount: number }
  | { kind: "finished"; totalCount: number }
  | { kind: "off" };

export default async function CrewStatusPage() {
  const currentUser = await getCurrentUser();

  // Defense in depth — proxy.ts already blocks staff from reaching this
  // route via MANAGER_PLUS_PREFIXES, but this page renders the same
  // "you don't have access" treatment rather than crashing if that ever
  // gets bypassed or the role check drifts out of sync.
  if (!currentUser || currentUser.role === "staff") {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-xl">
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="font-bold">Manager access required</p>
            <p className="mt-2 text-sm text-[#6b705c]">
              Crew Status shows everyone&apos;s live clock activity, so
              it&apos;s limited to managers and admins.{" "}
              <Link href="/my-day" className="font-semibold text-[#9c7a20] hover:underline">
                Go to My Day
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    );
  }

  const today = getPhoenixToday();
  const todayStr = formatDateInput(today);
  const queryStart = `${todayStr}T00:00:00-07:00`;
  const queryEnd = `${todayStr}T23:59:59-07:00`;

  const [{ data: usersData }, { data: todayVisitsData }, { data: activeTimersData }] =
    await Promise.all([
      supabaseServer
        .from("users")
        .select("id, name, role")
        .eq("active", true)
        .neq("role", "admin")
        .order("name", { ascending: true }),
      supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, customer_name, title, visit_status, start_at")
        .gte("start_at", queryStart)
        .lte("start_at", queryEnd)
        .order("start_at", { ascending: true }),
      supabaseServer
        .from("visit_time_logs")
        .select("id, jobber_visit_id, user_id, started_at")
        .is("stopped_at", null),
    ]);

  const crew = (usersData ?? []) as UserRow[];
  const todayVisits = (todayVisitsData ?? []) as VisitRow[];
  const activeTimers = (activeTimersData ?? []) as ActiveTimerRow[];

  const visitIds = todayVisits.map((v) => v.jobber_visit_id);
  const visitById = new Map<string, VisitRow>(
    todayVisits.map((v) => [v.jobber_visit_id, v])
  );

  // An active timer's visit might not be one of today's (a tech forgot
  // to stop the clock overnight, or the visit's own start_at doesn't
  // land in today's window) — fetch those specific visits separately so
  // the board still shows what job they're clocked into rather than
  // silently dropping the row.
  const missingActiveVisitIds = Array.from(
    new Set(
      activeTimers
        .map((t) => t.jobber_visit_id)
        .filter((id) => !visitById.has(id))
    )
  );

  // Same idea, but for the person, not the job: the top query only
  // pulls active users, so a stuck timer belonging to someone who's
  // since been deactivated in Team was invisible here — the timer
  // existed in visit_time_logs, but their row never rendered, so there
  // was nothing on screen to force-stop it from (confirmed live: exactly
  // this happened, two days after the fact). Fetch those users
  // separately, with no active filter, so a stuck timer is always
  // reachable regardless of whether the account is still active.
  const crewUserIds = new Set(crew.map((u) => u.id));
  const missingActiveUserIds = Array.from(
    new Set(
      activeTimers.map((t) => t.user_id).filter((id) => !crewUserIds.has(id))
    )
  );

  const [
    { data: assignmentsData },
    { data: todayTimeLogsData },
    { data: extraVisitsData },
    { data: extraUsersData },
  ] = await Promise.all([
    visitIds.length > 0
      ? supabaseServer
          .from("visit_assignments")
          .select("jobber_visit_id, assigned_user_id")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as AssignmentRow[] }),
    supabaseServer
      .from("visit_time_logs")
      .select("user_id, started_at, stopped_at")
      .gte("started_at", queryStart)
      .lte("started_at", queryEnd),
    missingActiveVisitIds.length > 0
      ? supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, customer_name, title, visit_status, start_at")
          .in("jobber_visit_id", missingActiveVisitIds)
      : Promise.resolve({ data: [] as VisitRow[] }),
    missingActiveUserIds.length > 0
      ? supabaseServer
          .from("users")
          .select("id, name, role")
          .in("id", missingActiveUserIds)
      : Promise.resolve({ data: [] as UserRow[] }),
  ]);

  for (const visit of (extraVisitsData ?? []) as VisitRow[]) {
    visitById.set(visit.jobber_visit_id, visit);
  }

  for (const extraUser of (extraUsersData ?? []) as UserRow[]) {
    crew.push({ ...extraUser, inactiveAccount: true });
  }

  const assignedVisitsByUser = new Map<string, VisitRow[]>();
  for (const row of (assignmentsData ?? []) as AssignmentRow[]) {
    const visit = visitById.get(row.jobber_visit_id);
    if (!visit) continue;

    if (!assignedVisitsByUser.has(row.assigned_user_id)) {
      assignedVisitsByUser.set(row.assigned_user_id, []);
    }
    assignedVisitsByUser.get(row.assigned_user_id)!.push(visit);
  }
  for (const visits of assignedVisitsByUser.values()) {
    visits.sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));
  }

  const activeTimerByUser = new Map<string, ActiveTimerRow>();
  for (const timer of activeTimers) {
    activeTimerByUser.set(timer.user_id, timer);
  }

  // Total minutes worked so far today per user, from finished segments
  // only — a still-running segment is covered by the live LiveElapsed
  // display instead, so it isn't counted here too.
  const loggedMinutesTodayByUser = new Map<string, number>();
  for (const log of (todayTimeLogsData ?? []) as TimeLogRow[]) {
    if (!log.stopped_at) continue;

    const startMs = new Date(log.started_at).getTime();
    const stopMs = new Date(log.stopped_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(stopMs) || stopMs < startMs) continue;

    const minutes = (stopMs - startMs) / 60000;
    loggedMinutesTodayByUser.set(
      log.user_id,
      (loggedMinutesTodayByUser.get(log.user_id) ?? 0) + minutes
    );
  }

  function statusFor(userId: string): CrewStatus {
    const activeTimer = activeTimerByUser.get(userId);
    if (activeTimer) {
      const visit = visitById.get(activeTimer.jobber_visit_id);
      return {
        kind: "clocked_in",
        startedAt: activeTimer.started_at,
        visit: visit ?? {
          jobber_visit_id: activeTimer.jobber_visit_id,
          customer_name: null,
          title: null,
          visit_status: null,
          start_at: null,
        },
      };
    }

    const assigned = assignedVisitsByUser.get(userId) ?? [];
    if (assigned.length === 0) {
      return { kind: "off" };
    }

    const remaining = assigned.filter(
      (v) => (v.visit_status ?? "").toUpperCase() !== "COMPLETED"
    );

    if (remaining.length === 0) {
      return { kind: "finished", totalCount: assigned.length };
    }

    return {
      kind: "idle_next_up",
      visit: remaining[0],
      doneCount: assigned.length - remaining.length,
      totalCount: assigned.length,
    };
  }

  const rows = crew.map((user) => ({ user, status: statusFor(user.id) }));

  const statusOrder: Record<CrewStatus["kind"], number> = {
    clocked_in: 0,
    idle_next_up: 1,
    finished: 2,
    off: 3,
  };

  rows.sort((a, b) => {
    const orderDiff = statusOrder[a.status.kind] - statusOrder[b.status.kind];
    if (orderDiff !== 0) return orderDiff;
    return a.user.name.localeCompare(b.user.name);
  });

  const onClockCount = rows.filter((r) => r.status.kind === "clocked_in").length;
  const idleCount = rows.filter((r) => r.status.kind === "idle_next_up").length;
  const finishedCount = rows.filter((r) => r.status.kind === "finished").length;
  const offCount = rows.filter((r) => r.status.kind === "off").length;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <AutoRefresh />

      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>

        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Crew Status</h1>
        <p className="mt-2 text-sm text-[#6b705c]">
          Live view of who&apos;s clocked in, idle, or done for the day.
          Refreshes automatically.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-[#eef4ee] px-3 py-1.5 text-[#174734]">
            {onClockCount} on the clock
          </span>
          <span className="rounded-full bg-[#fdf8ea] px-3 py-1.5 text-[#9c7a20]">
            {idleCount} idle
          </span>
          <span className="rounded-full bg-[#f0f0ec] px-3 py-1.5 text-[#6b705c]">
            {finishedCount} finished
          </span>
          <span className="rounded-full bg-[#f0f0ec] px-3 py-1.5 text-[#6b705c]">
            {offCount} off today
          </span>
        </div>

        {rows.length === 0 ? (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">No active crew members yet.</p>
          </section>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map(({ user, status }) => (
              <article
                key={user.id}
                className="rounded-2xl bg-white p-4 shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{user.name}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9c7a20]">
                      {user.role}
                      {user.inactiveAccount && (
                        <span className="ml-2 text-red-600">
                          Inactive account — has a stuck timer
                        </span>
                      )}
                    </p>
                  </div>

                  {status.kind === "clocked_in" && (
                    <span className="shrink-0 rounded-full bg-[#eef4ee] px-2 py-1 text-[10px] font-bold text-[#174734]">
                      ⏱ On the clock
                    </span>
                  )}
                  {status.kind === "idle_next_up" && (
                    <span className="shrink-0 rounded-full bg-[#fdf8ea] px-2 py-1 text-[10px] font-bold text-[#9c7a20]">
                      Idle
                    </span>
                  )}
                  {status.kind === "finished" && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-800">
                      Done for the day
                    </span>
                  )}
                  {status.kind === "off" && (
                    <span className="shrink-0 rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-bold text-[#6b705c]">
                      Nothing scheduled
                    </span>
                  )}
                </div>

                {status.kind === "clocked_in" && (
                  <div className="mt-3 rounded-lg bg-[#f7f6f1] px-3 py-2">
                    <p className="font-semibold">
                      {status.visit.customer_name || "Unnamed Customer"}
                    </p>
                    {visitServiceLabel(status.visit.title) && (
                      <p className="text-xs text-[#6b705c]">
                        {visitServiceLabel(status.visit.title)}
                      </p>
                    )}
                    <p className="mt-1 text-lg font-bold tabular-nums">
                      <LiveElapsed startedAt={status.startedAt} />
                    </p>

                    <ForceStopTimerButton userId={user.id} userName={user.name} />
                  </div>
                )}

                {status.kind === "idle_next_up" && (
                  <div className="mt-3 rounded-lg bg-[#f7f6f1] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b705c]">
                      Next up · {formatTime(status.visit.start_at)}
                    </p>
                    <p className="font-semibold">
                      {status.visit.customer_name || "Unnamed Customer"}
                    </p>
                    {visitServiceLabel(status.visit.title) && (
                      <p className="text-xs text-[#6b705c]">
                        {visitServiceLabel(status.visit.title)}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-semibold text-[#9c7a20]">
                      {status.doneCount} of {status.totalCount} stops done today
                    </p>
                  </div>
                )}

                {status.kind === "finished" && (
                  <p className="mt-3 text-xs font-semibold text-[#6b705c]">
                    Completed all {status.totalCount} assigned stop
                    {status.totalCount === 1 ? "" : "s"} today.
                  </p>
                )}

                {loggedMinutesTodayByUser.get(user.id) ? (
                  <p className="mt-2 text-xs text-[#6b705c]">
                    Logged {formatMinutes(loggedMinutesTodayByUser.get(user.id)!)}{" "}
                    today
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
