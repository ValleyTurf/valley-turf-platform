// Fixed semi-monthly pay periods — the 1st–15th and the 16th–end of
// every month, always in Phoenix-local calendar days. Replaces the old
// rolling "last 14 days" window on /timeclock and the Sun–Sat weekly
// grid on /timecards: payroll needs a period that lines up with how
// paychecks actually get cut, not an arbitrary trailing window.
//
// Kept dependency-free (no supabase-server import) so it's
// unit-testable on its own, same reasoning as lib/shiftHours.ts.
import { toPhoenixDateString } from "./phoenixDate";

export type PayPeriod = {
  /** Phoenix-local calendar date, YYYY-MM-DD, inclusive. */
  startDate: string;
  /** Phoenix-local calendar date, YYYY-MM-DD, inclusive. */
  endDate: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

// month is 1-indexed; day 0 of "next month" is the last day of this one.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getPhoenixTodayKey(): string {
  return toPhoenixDateString(new Date().toISOString()) ?? dateKey(1970, 1, 1);
}

// The period a given Phoenix-local calendar date (YYYY-MM-DD) falls in.
export function getPayPeriodForDate(dateKeyStr: string): PayPeriod {
  const { year, month, day } = parseDateKey(dateKeyStr);

  if (day <= 15) {
    return { startDate: dateKey(year, month, 1), endDate: dateKey(year, month, 15) };
  }

  return {
    startDate: dateKey(year, month, 16),
    endDate: dateKey(year, month, daysInMonth(year, month)),
  };
}

export function getCurrentPayPeriod(): PayPeriod {
  return getPayPeriodForDate(getPhoenixTodayKey());
}

export function getPreviousPayPeriod(period: PayPeriod): PayPeriod {
  const { year, month, day } = parseDateKey(period.startDate);

  if (day === 1) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return {
      startDate: dateKey(prevYear, prevMonth, 16),
      endDate: dateKey(prevYear, prevMonth, daysInMonth(prevYear, prevMonth)),
    };
  }

  return { startDate: dateKey(year, month, 1), endDate: dateKey(year, month, 15) };
}

export function getNextPayPeriod(period: PayPeriod): PayPeriod {
  const { year, month, day } = parseDateKey(period.startDate);

  if (day === 1) {
    return {
      startDate: dateKey(year, month, 16),
      endDate: dateKey(year, month, daysInMonth(year, month)),
    };
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return { startDate: dateKey(nextYear, nextMonth, 1), endDate: dateKey(nextYear, nextMonth, 15) };
}

// A period's startDate (always the 1st or the 16th) is a stable,
// unique key for it — used as the `?period=` query param on both
// /timeclock and /timecards.
export function parsePayPeriodParam(value: string | undefined): PayPeriod {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const { day } = parseDateKey(value);
    if (day === 1 || day === 16) {
      return getPayPeriodForDate(value);
    }
  }

  return getCurrentPayPeriod();
}

export function isSamePayPeriod(a: PayPeriod, b: PayPeriod): boolean {
  return a.startDate === b.startDate;
}

// "Aug 1–15, 2026" / "Aug 16–31, 2026" — periods never cross a month
// boundary by construction, so a single month name always suffices.
export function formatPayPeriodLabel(period: PayPeriod): string {
  const start = parseDateKey(period.startDate);
  const end = parseDateKey(period.endDate);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
  }).format(new Date(Date.UTC(start.year, start.month - 1, 1)));

  return `${monthLabel} ${start.day}–${end.day}, ${start.year}`;
}

// The calendar day (YYYY-MM-DD) immediately after a period's last day —
// the exclusive upper bound a `.lt("clocked_in_at", ...)` query (or the
// CSV export route's `end` param, which the same convention) needs.
export function payPeriodExclusiveEndDate(period: PayPeriod): string {
  const end = parseDateKey(period.endDate);
  const nextDay = new Date(Date.UTC(end.year, end.month - 1, end.day + 1));
  return dateKey(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate());
}

// Supabase range for a period's shift/tip queries — exclusive end,
// same `${dateStr}T00:00:00-07:00` convention already used on
// /timecards and the CSV export route (Phoenix is fixed UTC-7, no DST).
export function payPeriodQueryRange(period: PayPeriod): {
  queryStart: string;
  queryEnd: string;
} {
  return {
    queryStart: `${period.startDate}T00:00:00-07:00`,
    queryEnd: `${payPeriodExclusiveEndDate(period)}T00:00:00-07:00`,
  };
}

// The `count` periods immediately before `current`, most recent first —
// backs the "Previous Pay Periods" list on /timeclock and /timecards.
export function getPreviousPayPeriods(current: PayPeriod, count: number): PayPeriod[] {
  const periods: PayPeriod[] = [];
  let cursor = current;

  for (let i = 0; i < count; i++) {
    cursor = getPreviousPayPeriod(cursor);
    periods.push(cursor);
  }

  return periods;
}
