export const dynamic = "force-dynamic";
export const revalidate = 0;

// Self-service daily clock in/out for payroll — open to every signed-in
// role (like /schedule, /my-day), since every employee needs to punch
// in regardless of what they're allowed to see elsewhere. Deliberately
// separate from the per-visit job timer on /my-day; see
// supabase/migrations/020_add_shift_time_logs.sql for why. Managers/
// admins get a link to /timecards below for the full payroll view
// across everyone.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { totalMinutes, formatHoursMinutes, type ShiftSegment } from "@/lib/shiftHours";
import ShiftClock from "./ShiftClock";

type ShiftRow = {
  id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  edited_by: string | null;
};

const HISTORY_DAYS = 14;

function formatDayHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

// Phoenix-local calendar day (YYYY-MM-DD) for a UTC timestamp — same
// approach as the various getPhoenixToday helpers elsewhere, just
// applied to an arbitrary instant instead of "now".
function phoenixDayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function TimeclockPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-md">
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">Please sign in.</p>
          </section>
        </div>
      </main>
    );
  }

  const historyStart = new Date();
  historyStart.setDate(historyStart.getDate() - HISTORY_DAYS);

  const [{ data: activeShiftData }, { data: recentShiftsData }] = await Promise.all([
    supabaseServer
      .from("shift_time_logs")
      .select("id, clocked_in_at, clocked_out_at, edited_by")
      .eq("user_id", currentUser.id)
      .is("clocked_out_at", null)
      .maybeSingle(),
    supabaseServer
      .from("shift_time_logs")
      .select("id, clocked_in_at, clocked_out_at, edited_by")
      .eq("user_id", currentUser.id)
      .gte("clocked_in_at", historyStart.toISOString())
      .order("clocked_in_at", { ascending: false }),
  ]);

  const activeShift = activeShiftData as ShiftRow | null;
  const recentShifts = (recentShiftsData ?? []) as ShiftRow[];

  // Grouped by Phoenix-local calendar day, most recent first — a shift
  // that's still running is excluded from its day's total (same
  // convention as lib/shiftHours' totalMinutes default) and flagged
  // separately instead, since ShiftClock above already shows its live
  // elapsed time.
  const shiftsByDay = new Map<string, ShiftRow[]>();
  for (const shift of recentShifts) {
    const key = phoenixDayKey(shift.clocked_in_at);
    if (!shiftsByDay.has(key)) shiftsByDay.set(key, []);
    shiftsByDay.get(key)!.push(shift);
  }

  const dayKeys = Array.from(shiftsByDay.keys()).sort((a, b) => (a < b ? 1 : -1));

  const isManagerPlus = currentUser.role !== "staff";

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>

        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Timeclock</h1>
        <p className="mt-2 text-sm text-[#6b705c]">
          Clock in when your workday starts, out when it ends. This is
          separate from the per-job timer on My Day.
        </p>

        <div className="mt-4">
          <ShiftClock
            activeShiftId={activeShift?.id ?? null}
            activeClockedInAt={activeShift?.clocked_in_at ?? null}
          />
        </div>

        {isManagerPlus && (
          <Link
            href="/timecards"
            className="mt-4 block text-center text-sm font-semibold text-[#9c7a20] hover:underline"
          >
            View everyone&apos;s timecards →
          </Link>
        )}

        <h2 className="mt-6 text-lg font-bold">My Timecard</h2>
        <p className="text-xs text-[#6b705c]">Last {HISTORY_DAYS} days</p>

        {dayKeys.length === 0 ? (
          <section className="mt-3 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">No shifts logged yet.</p>
          </section>
        ) : (
          <div className="mt-3 space-y-2">
            {dayKeys.map((dayKey) => {
              const shifts = shiftsByDay.get(dayKey)!;
              const segments: ShiftSegment[] = shifts.map((s) => ({
                clockedInAt: s.clocked_in_at,
                clockedOutAt: s.clocked_out_at,
              }));
              const minutes = totalMinutes(segments);
              const hasOpenShift = shifts.some((s) => !s.clocked_out_at);
              const wasEdited = shifts.some((s) => s.edited_by);

              return (
                <article
                  key={dayKey}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 shadow"
                >
                  <div>
                    <p className="font-semibold">{formatDayHeading(dayKey)}</p>
                    <p className="text-xs text-[#6b705c]">
                      {shifts
                        .slice()
                        .reverse()
                        .map((s) => (
                          `${formatClockTime(s.clocked_in_at)}–${
                            s.clocked_out_at ? formatClockTime(s.clocked_out_at) : "now"
                          }`
                        ))
                        .join(", ")}
                      {wasEdited ? " · corrected" : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold tabular-nums">
                      {formatHoursMinutes(minutes)}
                    </p>
                    {hasOpenShift && (
                      <p className="text-[10px] font-bold text-[#9c7a20]">
                        still clocked in
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
