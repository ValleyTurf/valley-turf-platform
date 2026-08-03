export const dynamic = "force-dynamic";
export const revalidate = 0;

// Self-service daily clock in/out for payroll — open to every signed-in
// role (like /schedule, /my-day), since every employee needs to punch
// in regardless of what they're allowed to see elsewhere. Deliberately
// separate from the per-visit job timer on /my-day; see
// supabase/migrations/020_add_shift_time_logs.sql for why. Managers/
// admins get a link to /timecards below for the full payroll view
// across everyone.
//
// Shows a fixed semi-monthly pay period (1st–15th, 16th–end of month —
// see lib/payPeriods.ts) instead of a rolling window, since that's how
// paychecks actually get cut. Tips are pulled in per day from
// lib/tips.ts (split evenly across whoever's assigned to the job) and
// combined with hourly_rate × hours worked into a daily pay figure.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { totalMinutes, formatHoursMinutes, minutesToDecimalHours, type ShiftSegment } from "@/lib/shiftHours";
import { getTipsByUserAndDay, type UserDailyTip } from "@/lib/tips";
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
} from "@/lib/payPeriods";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import ShiftClock from "./ShiftClock";

type ShiftRow = {
  id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  edited_by: string | null;
};

type TimeclockPageProps = {
  searchParams: Promise<{ period?: string }>;
};

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

// Phoenix-local calendar day (YYYY-MM-DD) for a UTC timestamp.
function phoenixDayKey(iso: string): string {
  return toPhoenixDateString(iso) ?? iso.slice(0, 10);
}

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const PREVIOUS_PERIODS_SHOWN = 6;

export default async function TimeclockPage({ searchParams }: TimeclockPageProps) {
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

  const params = await searchParams;
  const currentPeriod = getCurrentPayPeriod();
  const selectedPeriod = parsePayPeriodParam(params.period);
  const isCurrentPeriod = isSamePayPeriod(selectedPeriod, currentPeriod);

  const { queryStart, queryEnd } = payPeriodQueryRange(selectedPeriod);

  const [{ data: activeShiftData }, { data: periodShiftsData }, { data: rateData }, tipsByUserAndDay] =
    await Promise.all([
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
        .gte("clocked_in_at", queryStart)
        .lt("clocked_in_at", queryEnd)
        .order("clocked_in_at", { ascending: false }),
      supabaseServer.from("users").select("hourly_rate").eq("id", currentUser.id).maybeSingle(),
      getTipsByUserAndDay(selectedPeriod.startDate, selectedPeriod.endDate),
    ]);

  const activeShift = activeShiftData as ShiftRow | null;
  const periodShifts = (periodShiftsData ?? []) as ShiftRow[];
  const hourlyRate = (rateData as { hourly_rate: number | string | null } | null)?.hourly_rate;
  const hourlyRateNumber = hourlyRate === null || hourlyRate === undefined ? null : Number(hourlyRate);
  const myTips = tipsByUserAndDay.get(currentUser.id) ?? new Map<string, UserDailyTip>();

  // Grouped by Phoenix-local calendar day, most recent first. A day
  // with a tip but no punch (e.g. a manual correction hasn't been
  // entered yet) still shows up, since the tip is real money either
  // way. A shift that's still running is excluded from its day's total
  // (same convention as lib/shiftHours' totalMinutes default) and
  // flagged separately instead, since ShiftClock above already shows
  // its live elapsed time.
  const shiftsByDay = new Map<string, ShiftRow[]>();
  for (const shift of periodShifts) {
    const key = phoenixDayKey(shift.clocked_in_at);
    if (!shiftsByDay.has(key)) shiftsByDay.set(key, []);
    shiftsByDay.get(key)!.push(shift);
  }

  const dayKeys = Array.from(new Set([...shiftsByDay.keys(), ...myTips.keys()])).sort((a, b) =>
    a < b ? 1 : -1
  );

  const isManagerPlus = currentUser.role !== "staff";

  const prevHref = `/timeclock?period=${getPreviousPayPeriod(selectedPeriod).startDate}`;
  const nextHref = `/timeclock?period=${getNextPayPeriod(selectedPeriod).startDate}`;
  const currentHref = `/timeclock?period=${currentPeriod.startDate}`;
  const previousPeriods = getPreviousPayPeriods(currentPeriod, PREVIOUS_PERIODS_SHOWN);

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

        <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow">
          <Link
            href={prevHref}
            className="rounded-xl border border-[#174734] px-3 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
          >
            ← Prev
          </Link>

          <div className="text-center">
            <p className="font-bold">{formatPayPeriodLabel(selectedPeriod)}</p>
            {!isCurrentPeriod && (
              <Link href={currentHref} className="text-xs font-semibold text-[#9c7a20] hover:underline">
                Jump to current period
              </Link>
            )}
          </div>

          <Link
            href={nextHref}
            className="rounded-xl border border-[#174734] px-3 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
          >
            Next →
          </Link>
        </div>

        {dayKeys.length === 0 ? (
          <section className="mt-3 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">No shifts logged this pay period.</p>
          </section>
        ) : (
          <div className="mt-3 space-y-2">
            {dayKeys.map((dayKey) => {
              const shifts = shiftsByDay.get(dayKey) ?? [];
              const segments: ShiftSegment[] = shifts.map((s) => ({
                clockedInAt: s.clocked_in_at,
                clockedOutAt: s.clocked_out_at,
              }));
              const minutes = totalMinutes(segments);
              const hasOpenShift = shifts.some((s) => !s.clocked_out_at);
              const wasEdited = shifts.some((s) => s.edited_by);

              const dayTip = myTips.get(dayKey);
              const tipAmount = dayTip?.amount ?? 0;
              const wagePay = hourlyRateNumber !== null ? minutesToDecimalHours(minutes) * hourlyRateNumber : 0;
              const totalPay = wagePay + tipAmount;
              const showPay = hourlyRateNumber !== null || tipAmount > 0;

              return (
                <article
                  key={dayKey}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 shadow"
                >
                  <div>
                    <p className="font-semibold">{formatDayHeading(dayKey)}</p>
                    {shifts.length > 0 && (
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
                    )}
                    {tipAmount > 0 && (
                      <p className="text-xs text-[#9c7a20]">
                        + {formatCurrencyPrecise(tipAmount)} tip
                        {dayTip && dayTip.jobs.length > 0 && (
                          <>
                            {" "}
                            (
                            {dayTip.jobs
                              .map((j) => j.jobNumber ?? "job")
                              .join(", ")}
                            )
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="font-bold tabular-nums">
                      {formatHoursMinutes(minutes)}
                    </p>
                    {showPay && (
                      <p className="text-xs font-semibold tabular-nums text-[#6b705c]">
                        {formatCurrencyPrecise(totalPay)}
                      </p>
                    )}
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

        <h2 className="mt-6 text-lg font-bold">Previous Pay Periods</h2>
        <section className="mt-2 rounded-2xl bg-white p-2 shadow">
          {previousPeriods.map((period) => (
            <Link
              key={period.startDate}
              href={`/timeclock?period=${period.startDate}`}
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
