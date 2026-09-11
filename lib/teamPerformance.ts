// Team performance scorecard -- ROADMAP.md Fresh Ideas #8. Deliberately
// just avg time per visit + tips (Ryan's call, 2026-09-11): there's no
// "expected/budgeted cost per job" concept anywhere in this app to
// compare actual cost against, so a "cost accuracy" column would have no
// real benchmark behind it -- dropped rather than built on a made-up one.
//
// Both numbers reuse existing engines rather than re-deriving anything:
// time from lib/shiftHours.ts's segmentMinutes (same math /timecards
// already uses for payroll), tips from lib/tips.ts's getTipsByUserAndDay
// (same split-across-assigned-crew logic /timecards already uses for
// tip payouts).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { segmentMinutes } from "@/lib/shiftHours";
import { getTipsByUserAndDay } from "@/lib/tips";

// Same fixed-offset assumption used throughout this app (Phoenix doesn't
// observe DST -- see lib/nativeJobs.ts's BUSINESS_UTC_OFFSET,
// lib/visitReminders.ts).
const BUSINESS_UTC_OFFSET = "-07:00";

export type TeamPerformanceRow = {
  userId: string;
  name: string;
  visitCount: number;
  avgMinutesPerVisit: number;
  totalTips: number;
};

type TimeLogRow = {
  jobber_visit_id: string;
  user_id: string;
  started_at: string;
  stopped_at: string | null;
};

export async function getTeamPerformanceSummary(
  startDate: string,
  endDate: string
): Promise<TeamPerformanceRow[]> {
  const { data: timeLogsData, error: timeLogsError } = await supabaseServer
    .from("visit_time_logs")
    .select("jobber_visit_id, user_id, started_at, stopped_at")
    .not("stopped_at", "is", null)
    .gte("started_at", `${startDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
    .lte("started_at", `${endDate}T23:59:59${BUSINESS_UTC_OFFSET}`);

  if (timeLogsError) {
    throw new Error(`Couldn't load visit time logs: ${timeLogsError.message}`);
  }

  const timeLogs = (timeLogsData ?? []) as TimeLogRow[];

  // A visit can have more than one start/stop segment for the same
  // person (paused and resumed) -- sum minutes per (user, visit) pair
  // first, so a paused visit counts as ONE visit in the average, not two.
  const minutesByUserVisit = new Map<string, number>();
  for (const log of timeLogs) {
    const key = `${log.user_id}:${log.jobber_visit_id}`;
    const minutes = segmentMinutes({
      clockedInAt: log.started_at,
      clockedOutAt: log.stopped_at,
    });
    minutesByUserVisit.set(key, (minutesByUserVisit.get(key) ?? 0) + minutes);
  }

  const visitMinutesByUser = new Map<string, number[]>();
  for (const [key, minutes] of minutesByUserVisit) {
    const userId = key.split(":")[0];
    const list = visitMinutesByUser.get(userId) ?? [];
    list.push(minutes);
    visitMinutesByUser.set(userId, list);
  }

  const tipsByUserAndDay = await getTipsByUserAndDay(startDate, endDate);

  const tipsByUser = new Map<string, number>();
  for (const [userId, dayMap] of tipsByUserAndDay) {
    let total = 0;
    for (const day of dayMap.values()) {
      total += day.amount;
    }
    tipsByUser.set(userId, total);
  }

  const allUserIds = new Set<string>([
    ...visitMinutesByUser.keys(),
    ...tipsByUser.keys(),
  ]);

  if (allUserIds.size === 0) {
    return [];
  }

  const { data: usersData, error: usersError } = await supabaseServer
    .from("users")
    .select("id, name")
    .in("id", Array.from(allUserIds));

  if (usersError) {
    throw new Error(`Couldn't load users: ${usersError.message}`);
  }

  const nameById = new Map(
    ((usersData ?? []) as { id: string; name: string | null }[]).map((u) => [
      u.id,
      u.name ?? "Unknown",
    ])
  );

  const rows: TeamPerformanceRow[] = Array.from(allUserIds).map((userId) => {
    const perVisitMinutes = visitMinutesByUser.get(userId) ?? [];
    const totalMinutes = perVisitMinutes.reduce((sum, m) => sum + m, 0);

    return {
      userId,
      name: nameById.get(userId) ?? "Unknown",
      visitCount: perVisitMinutes.length,
      avgMinutesPerVisit:
        perVisitMinutes.length > 0 ? totalMinutes / perVisitMinutes.length : 0,
      totalTips: tipsByUser.get(userId) ?? 0,
    };
  });

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
