export const dynamic = "force-dynamic";
export const revalidate = 0;

// Payroll timecards — manager/admin only (lib/permissionRules.ts's
// MANAGER_PLUS_PREFIXES, enforced in (platform)/layout.tsx; the role
// check below is defense in depth). Reads shift_time_logs, the general
// daily clock in/out table from /timeclock — NOT visit_time_logs, which
// is per-job timing for cost analytics, a deliberately separate concern
// (see supabase/migrations/020_add_shift_time_logs.sql).
//
// Grid is a fixed semi-monthly pay period (1st–15th, 16th–end of month
// — see lib/payPeriods.ts) instead of a Sun–Sat week, since that's how
// paychecks actually get cut. Pay = hours × hourly_rate (wages only);
// Tips is a separate column/section, sourced from lib/tips.ts's
// invoice-tip → visit → assignee join, since tip income and wage pay
// are conventionally reported separately.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { totalMinutes, formatHoursMinutes, minutesToDecimalHours, type ShiftSegment } from "@/lib/shiftHours";
import { getTipsByUserAndDay } from "@/lib/tips";
import { formatCurrencyPrecise } from "@/lib/format";
import {
  getCurrentPayPeriod,
  getPreviousPayPeriod,
  getNextPayPeriod,
  getPreviousPayPeriods,
  parsePayPeriodParam,
  isSamePayPeriod,
  formatPayPeriodLabel,
  payPeriodQueryRange,
  payPeriodExclusiveEndDate,
  type PayPeriod,
} from "@/lib/payPeriods";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import TimecardsInteractive, {
  type Employee,
  type Punch,
} from "./TimecardsInteractive";

type TimecardsPageProps = {
  searchParams: Promise<{ period?: string }>;
};

type UserRow = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  hourly_rate: number | string | null;
};

type ShiftRow = {
  id: string;
  user_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  notes: string | null;
  edited_by: string | null;
};

const PREVIOUS_PERIODS_SHOWN = 6;

// Phoenix-local calendar day (YYYY-MM-DD) for a UTC timestamp.
function phoenixDayKey(iso: string): string {
  return toPhoenixDateString(iso) ?? iso.slice(0, 10);
}

// The list of Phoenix-local calendar days in a period, inclusive —
// 15 or 16 entries depending on the half/month. Replaces the old fixed
// 7-column Sun–Sat grid, since a pay period isn't a fixed length.
function periodDayKeys(period: PayPeriod): string[] {
  const [startYear, startMonth, startDay] = period.startDate.split("-").map(Number);
  const [, , endDay] = period.endDate.split("-").map(Number);

  const keys: string[] = [];
  for (let day = startDay; day <= endDay; day++) {
    keys.push(
      `${startYear}-${String(startMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }
  return keys;
}

function dayOfMonthLabel(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
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
  const currentPeriod = getCurrentPayPeriod();
  const selectedPeriod = parsePayPeriodParam(params.period);
  const isCurrentPeriod = isSamePayPeriod(selectedPeriod, currentPeriod);

  const { queryStart, queryEnd } = payPeriodQueryRange(selectedPeriod);

  const [{ data: usersData }, { data: shiftsData }, tipsByUserAndDay] = await Promise.all([
    // No active filter here — a punch from someone who's since gone
    // inactive should still show their real name in "Punches this
    // pay period" rather than falling back to "Unknown". The grid
    // below filters this list down to active employees only, since
    // that's the "who should be punching in" view.
    supabaseServer
      .from("users")
      .select("id, name, role, active, hourly_rate")
      .order("name", { ascending: true }),
    supabaseServer
      .from("shift_time_logs")
      .select("id, user_id, clocked_in_at, clocked_out_at, notes, edited_by")
      .gte("clocked_in_at", queryStart)
      .lt("clocked_in_at", queryEnd)
      .order("clocked_in_at", { ascending: true }),
    getTipsByUserAndDay(selectedPeriod.startDate, selectedPeriod.endDate),
  ]);

  const users = (usersData ?? []) as UserRow[];
  const shifts = (shiftsData ?? []) as ShiftRow[];

  const userNameById = new Map<string, string>(users.map((u) => [u.id, u.name]));
  const hourlyRateById = new Map<string, number | null>(
    users.map((u) => [u.id, u.hourly_rate === null || u.hourly_rate === undefined ? null : Number(u.hourly_rate)])
  );
  const activeUsers = users.filter((u) => u.active);

  const dayKeys = periodDayKeys(selectedPeriod);
  const dayIndexByKey = new Map(dayKeys.map((key, index) => [key, index]));

  // Grid: minutes per employee per day-of-period, plus a running total
  // and an "still clocked in" flag per employee.
  const dailyMinutes = new Map<string, number>(); // `${userId}:${dayIndex}`
  const periodMinutesByUser = new Map<string, number>();
  const hasOpenShiftByUser = new Set<string>();

  for (const shift of shifts) {
    const segment: ShiftSegment = {
      clockedInAt: shift.clocked_in_at,
      clockedOutAt: shift.clocked_out_at,
    };
    const minutes = totalMinutes([segment]);

    const dayIndex = dayIndexByKey.get(phoenixDayKey(shift.clocked_in_at));

    if (dayIndex !== undefined) {
      const gridKey = `${shift.user_id}:${dayIndex}`;
      dailyMinutes.set(gridKey, (dailyMinutes.get(gridKey) ?? 0) + minutes);
    }

    periodMinutesByUser.set(
      shift.user_id,
      (periodMinutesByUser.get(shift.user_id) ?? 0) + minutes
    );

    if (!shift.clocked_out_at) {
      hasOpenShiftByUser.add(shift.user_id);
    }
  }

  // Per-employee tip total for the period, plus a flat list (newest
  // first) of every individual tip attribution for the "Tips this pay
  // period" section below — who got what, for which job, on which day.
  const tipTotalByUser = new Map<string, number>();
  type TipListRow = { userId: string; userName: string; date: string; amount: number; jobNumbers: string[] };
  const tipRows: TipListRow[] = [];

  for (const [userId, dayMap] of tipsByUserAndDay) {
    let userTotal = 0;
    for (const [date, tip] of dayMap) {
      userTotal += tip.amount;
      tipRows.push({
        userId,
        userName: userNameById.get(userId) ?? "Unknown",
        date,
        amount: tip.amount,
        jobNumbers: tip.jobs.map((j) => j.jobNumber ?? "job"),
      });
    }
    tipTotalByUser.set(userId, userTotal);
  }
  tipRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

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

  const prevHref = `/timecards?period=${getPreviousPayPeriod(selectedPeriod).startDate}`;
  const nextHref = `/timecards?period=${getNextPayPeriod(selectedPeriod).startDate}`;
  const currentHref = `/timecards?period=${currentPeriod.startDate}`;
  const previousPeriods = getPreviousPayPeriods(currentPeriod, PREVIOUS_PERIODS_SHOWN);
  const exportHref = `/api/timecards/export?start=${selectedPeriod.startDate}&end=${payPeriodExclusiveEndDate(
    selectedPeriod
  )}`;

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
            <p className="font-bold">{formatPayPeriodLabel(selectedPeriod)}</p>
            {!isCurrentPeriod && (
              <Link
                href={currentHref}
                className="text-xs font-semibold text-[#9c7a20] hover:underline"
              >
                Jump to current period
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                <th className="pb-2 pr-2">Employee</th>
                {dayKeys.map((key) => (
                  <th key={key} className="pb-2 px-1 text-center">
                    {dayOfMonthLabel(key)}
                  </th>
                ))}
                <th className="pb-2 pl-2 text-right">Hours</th>
                <th className="pb-2 pl-2 text-right">Pay</th>
                <th className="pb-2 pl-2 text-right">Tips</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const minutes = periodMinutesByUser.get(employee.id) ?? 0;
                const hourlyRate = hourlyRateById.get(employee.id) ?? null;
                const pay = hourlyRate !== null ? minutesToDecimalHours(minutes) * hourlyRate : null;
                const tips = tipTotalByUser.get(employee.id) ?? 0;

                return (
                  <tr key={employee.id} className="border-t border-[#f0eee6]">
                    <td className="py-2 pr-2 font-semibold">
                      {employee.name}
                      {hasOpenShiftByUser.has(employee.id) && (
                        <span className="ml-1 rounded-full bg-[#eef4ee] px-1.5 py-0.5 text-[9px] font-bold text-[#174734]">
                          on the clock
                        </span>
                      )}
                    </td>
                    {dayKeys.map((_, dayIndex) => {
                      const dayMinutes = dailyMinutes.get(`${employee.id}:${dayIndex}`) ?? 0;
                      return (
                        <td key={dayIndex} className="px-1 py-2 text-center tabular-nums text-[#6b705c]">
                          {dayMinutes > 0 ? (dayMinutes / 60).toFixed(1) : "–"}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-2 text-right font-bold tabular-nums">
                      {formatHoursMinutes(minutes)}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums text-[#6b705c]">
                      {pay !== null ? formatCurrencyPrecise(pay) : "–"}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums text-[#9c7a20]">
                      {tips > 0 ? formatCurrencyPrecise(tips) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-4 rounded-2xl bg-white p-4 shadow">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            Tips this pay period
          </p>

          {tipRows.length === 0 ? (
            <p className="mt-2 text-sm text-[#6b705c]">No tips recorded this pay period.</p>
          ) : (
            <div className="mt-2 divide-y divide-[#f0eee6]">
              {tipRows.map((row, index) => (
                <div key={`${row.userId}-${row.date}-${index}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{row.userName}</p>
                    <p className="text-xs text-[#6b705c]">
                      {row.date} · {row.jobNumbers.join(", ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[#9c7a20]">
                    {formatCurrencyPrecise(row.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-4">
          <TimecardsInteractive employees={employees} punches={punches} />
        </div>

        <h2 className="mt-6 text-lg font-bold">Previous Pay Periods</h2>
        <section className="mt-2 rounded-2xl bg-white p-2 shadow">
          {previousPeriods.map((period) => (
            <Link
              key={period.startDate}
              href={`/timecards?period=${period.startDate}`}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-[#f7f6f1] ${
                isSamePayPeriod(period, selectedPeriod) ? "bg-[#fdf8ea] text-[#9c7a20]" : ""
              }`}
            >
              <span>{formatPayPeriodLabel(period)}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
