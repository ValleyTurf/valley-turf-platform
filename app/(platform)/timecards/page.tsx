export const dynamic = "force-dynamic";
export const revalidate = 0;

// Payroll timecards — manager/admin only (lib/permissionRules.ts's
// MANAGER_PLUS_PREFIXES, enforced in (platform)/layout.tsx; the role
// check below is defense in depth). Reads shift_time_logs, the general
// daily clock in/out table from /timeclock — NOT visit_time_logs, which
// is per-job timing for cost analytics, a deliberately separate concern
// (see supabase/migrations/020_add_shift_time_logs.sql).
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { totalMinutes, formatHoursMinutes, type ShiftSegment } from "@/lib/shiftHours";
import TimecardsInteractive, {
  type Employee,
  type Punch,
} from "./TimecardsInteractive";

type TimecardsPageProps = {
  searchParams: Promise<{ week?: string }>;
};

type UserRow = { id: string; name: string; role: string; active: boolean };

type ShiftRow = {
  id: string;
  user_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  notes: string | null;
  edited_by: string | null;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  return addDays(date, -date.getUTCDay());
}

function parseWeekStart(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return startOfWeek(parsed);
    }
  }

  return startOfWeek(getPhoenixToday());
}

function formatWeekHeading(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

// Phoenix-local calendar day (YYYY-MM-DD) for a UTC timestamp.
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

// 24-hour HH:MM in Phoenix time, the format <input type="time"> and
// Postgres both expect.
function phoenixTimeValue(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Phoenix",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default async function TimecardsPage({ searchParams }: TimecardsPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role === "staff") {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-xl">
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="font-bold">Manager access required</p>
            <p className="mt-2 text-sm text-[#6b705c]">
              Timecards is limited to managers and admins.{" "}
              <Link href="/timeclock" className="font-semibold text-[#9c7a20] hover:underline">
                Go to Timeclock
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const weekStart = parseWeekStart(params.week);
  const weekEndExclusive = addDays(weekStart, 7);
  const weekEndDisplay = addDays(weekStart, 6);

  const weekStartStr = formatDateInput(weekStart);
  const weekEndExclusiveStr = formatDateInput(weekEndExclusive);

  const queryStart = `${weekStartStr}T00:00:00-07:00`;
  const queryEnd = `${weekEndExclusiveStr}T00:00:00-07:00`;

  const [{ data: usersData }, { data: shiftsData }] = await Promise.all([
    // No active filter here — a punch from someone who's since gone
    // inactive should still show their real name in "Punches this
    // week" rather than falling back to "Unknown". The weekly grid
    // below filters this list down to active employees only, since
    // that's the "who should be punching in" view.
    supabaseServer
      .from("users")
      .select("id, name, role, active")
      .order("name", { ascending: true }),
    supabaseServer
      .from("shift_time_logs")
      .select("id, user_id, clocked_in_at, clocked_out_at, notes, edited_by")
      .gte("clocked_in_at", queryStart)
      .lt("clocked_in_at", queryEnd)
      .order("clocked_in_at", { ascending: true }),
  ]);

  const users = (usersData ?? []) as UserRow[];
  const shifts = (shiftsData ?? []) as ShiftRow[];

  const userNameById = new Map<string, string>(users.map((u) => [u.id, u.name]));
  const activeUsers = users.filter((u) => u.active);

  // Weekly grid: minutes per employee per day-of-week, plus a running
  // total and an "still clocked in this week" flag per employee.
  const dailyMinutes = new Map<string, number>(); // `${userId}:${dayIndex}`
  const weeklyMinutesByUser = new Map<string, number>();
  const hasOpenShiftByUser = new Set<string>();

  for (const shift of shifts) {
    const segment: ShiftSegment = {
      clockedInAt: shift.clocked_in_at,
      clockedOutAt: shift.clocked_out_at,
    };
    const minutes = totalMinutes([segment]);

    const dayKey = phoenixDayKey(shift.clocked_in_at);
    const dayIndex = Math.round(
      (new Date(`${dayKey}T00:00:00Z`).getTime() - weekStart.getTime()) /
        (24 * 60 * 60 * 1000)
    );

    if (dayIndex >= 0 && dayIndex < 7) {
      const gridKey = `${shift.user_id}:${dayIndex}`;
      dailyMinutes.set(gridKey, (dailyMinutes.get(gridKey) ?? 0) + minutes);
    }

    weeklyMinutesByUser.set(
      shift.user_id,
      (weeklyMinutesByUser.get(shift.user_id) ?? 0) + minutes
    );

    if (!shift.clocked_out_at) {
      hasOpenShiftByUser.add(shift.user_id);
    }
  }

  const punches: Punch[] = shifts
    .slice()
    .reverse()
    .map((shift) => ({
      id: shift.id,
      userId: shift.user_id,
      userName: userNameById.get(shift.user_id) ?? "Unknown",
      date: phoenixDayKey(shift.clocked_in_at),
      clockInTime: phoenixTimeValue(shift.clocked_in_at),
      clockOutTime: shift.clocked_out_at ? phoenixTimeValue(shift.clocked_out_at) : null,
      hoursLabel: formatHoursMinutes(
        totalMinutes([{ clockedInAt: shift.clocked_in_at, clockedOutAt: shift.clocked_out_at }], {
          includeActive: true,
        })
      ),
      notes: shift.notes,
      wasEdited: Boolean(shift.edited_by),
      isOpen: !shift.clocked_out_at,
    }));

  const employees: Employee[] = activeUsers.map((u) => ({ id: u.id, name: u.name, role: u.role }));

  const prevHref = `/timecards?week=${formatDateInput(addDays(weekStart, -7))}`;
  const nextHref = `/timecards?week=${formatDateInput(addDays(weekStart, 7))}`;
  const thisWeekHref = `/timecards?week=${formatDateInput(startOfWeek(getPhoenixToday()))}`;
  const isCurrentWeek = weekStartStr === formatDateInput(startOfWeek(getPhoenixToday()));
  const exportHref = `/api/timecards/export?start=${weekStartStr}&end=${weekEndExclusiveStr}`;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Timecards</h1>

            <p className="mt-2 text-sm text-[#6b705c]">
              Hours from everyone&apos;s daily clock in/out, for payroll.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/crew-status"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Crew Status
            </Link>
            <Link
              href="/timeclock"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              My Timeclock
            </Link>
            <a
              href={exportHref}
              className="rounded-xl bg-[#174734] px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Export CSV
            </a>
          </div>
        </header>

        <div className="mt-5 flex items-center justify-between gap-2 rounded-2xl bg-white p-4 shadow">
          <Link
            href={prevHref}
            className="rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
          >
            ← Prev
          </Link>

          <div className="text-center">
            <p className="font-bold">{formatWeekHeading(weekStart, weekEndDisplay)}</p>
            {!isCurrentWeek && (
              <Link
                href={thisWeekHref}
                className="text-xs font-semibold text-[#9c7a20] hover:underline"
              >
                Jump to this week
              </Link>
            )}
          </div>

          <Link
            href={nextHref}
            className="rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
          >
            Next →
          </Link>
        </div>

        <section className="mt-4 overflow-x-auto rounded-2xl bg-white p-4 shadow">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                <th className="pb-2 pr-2">Employee</th>
                {DAY_LABELS.map((label) => (
                  <th key={label} className="pb-2 px-1 text-center">
                    {label}
                  </th>
                ))}
                <th className="pb-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-t border-[#f0eee6]">
                  <td className="py-2 pr-2 font-semibold">
                    {employee.name}
                    {hasOpenShiftByUser.has(employee.id) && (
                      <span className="ml-1 rounded-full bg-[#eef4ee] px-1.5 py-0.5 text-[9px] font-bold text-[#174734]">
                        on the clock
                      </span>
                    )}
                  </td>
                  {DAY_LABELS.map((_, dayIndex) => {
                    const minutes = dailyMinutes.get(`${employee.id}:${dayIndex}`) ?? 0;
                    return (
                      <td key={dayIndex} className="px-1 py-2 text-center tabular-nums text-[#6b705c]">
                        {minutes > 0 ? (minutes / 60).toFixed(1) : "–"}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 text-right font-bold tabular-nums">
                    {formatHoursMinutes(weeklyMinutesByUser.get(employee.id) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mt-4">
          <TimecardsInteractive employees={employees} punches={punches} />
        </div>
      </div>
    </main>
  );
}
