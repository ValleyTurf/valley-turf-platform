// Pure date-math for native recurring jobs (Tier 2 Stage 1/3 of the
// Jobber Independence Roadmap) — no DB, no network, so this is fully
// unit-testable the same way lib/payPeriods.ts and lib/shiftHours.ts
// are. lib/nativeJobs.ts is the thin, side-effecting caller that turns
// these dates into actual jobber_visits rows.
//
// Dates are plain "YYYY-MM-DD" strings throughout, matched to how HTML
// <input type="date"> and this app's other date-only fields already work
// (see schedule/actions.ts's own toUtcIso for the same convention). Every
// calculation happens in UTC-anchored Date math on the date parts alone —
// never wall-clock/timezone arithmetic — because this business operates
// only in Phoenix, which doesn't observe DST, so calendar-date math here
// can't drift the way it could for a business spanning a DST boundary.

export type RecurrenceFrequency =
  | "weekly"
  | "biweekly"
  | "bimonthly"
  | "monthly"
  | "quarterly"
  | "triannual"
  | "semiannual";

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTHS_PER_STEP: Partial<Record<RecurrenceFrequency, number>> = {
  bimonthly: 2,
  monthly: 1,
  quarterly: 3,
  triannual: 4,
  semiannual: 6,
};

const DAYS_PER_STEP: Partial<Record<RecurrenceFrequency, number>> = {
  weekly: 7,
  biweekly: 14,
};

function daysInMonth(year: number, monthIndex0: number): number {
  // Day 0 of the month AFTER monthIndex0 is the last day of monthIndex0.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

// Adds `months` calendar months to `date`, keeping the same day-of-month
// whenever the target month has one, and CLAMPING to that month's last
// day when it doesn't — Jan 31 + 1 month lands on Feb 28 (or Feb 29 in a
// leap year), not "Mar 3." Plain JS Date month arithmetic (setUTCMonth)
// does not do this on its own: it overflows a too-high day-of-month
// into the following month instead of clamping. That overflow is what
// silently ate Katie Ray's February 2027 visit (Ryan, 2026-11-09): her
// job is anchored on the 29th, and Feb 2027 (not a leap year) has no
// 29th, so the old unclamped math landed on March 1 instead of February
// at all — see app/api/jobs/restore-ray-feb-2027-visit/route.ts for the
// one-time backfill this bug fix doesn't retroactively apply on its own.
function addCalendarMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex));
  return new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay));
}

// `step` occurrences of `frequency` after `anchorDate` (step 0 is the
// anchor itself). Always computed relative to the ORIGINAL anchor, never
// by chaining off a previously-computed (and possibly clamped) date —
// that's what keeps a day-29 anchor landing back on the 29th every month
// that has one, instead of permanently drifting to the 28th (or into the
// next month) after the one short month that needed clamping. See
// occurrencesInWindow below, the only caller.
function occurrenceAtStep(
  anchorDate: string,
  frequency: RecurrenceFrequency,
  step: number
): string {
  const anchor = parseDateOnly(anchorDate);

  const days = DAYS_PER_STEP[frequency];
  if (days !== undefined) {
    anchor.setUTCDate(anchor.getUTCDate() + days * step);
    return formatDateOnly(anchor);
  }

  const months = MONTHS_PER_STEP[frequency] as number;
  return formatDateOnly(addCalendarMonths(anchor, months * step));
}

// The next occurrence after `date`, same cadence rule this app already
// uses for Jobber's RRULE (see lib/jobberJob.ts's RECURRENCE_RULES) —
// "Bi-Monthly" means every 2 months here, not twice a month, matching
// this app's trade usage throughout (job-costs page's RECURRING_CATEGORIES,
// the schedule page's service-color rules).
export function nextOccurrenceDate(
  date: string,
  frequency: RecurrenceFrequency
): string {
  return occurrenceAtStep(date, frequency, 1);
}

// Every occurrence strictly after `afterDate` (exclusive) up through
// `windowEndDate` (inclusive), starting the cadence from `anchorDate` —
// e.g. a monthly job anchored on the 5th stays anchored on the 5th no
// matter how far forward the window is computed, rather than drifting
// off whatever `afterDate` happens to be. Used two ways: at job-creation
// time (afterDate = anchorDate itself, so the anchor's own visit is
// created separately and this fills in everything after it) and by the
// rolling-window generator (afterDate = the latest visit that already
// exists for this job).
//
// Capped at 500 iterations as a safety backstop against a malformed
// window (e.g. windowEndDate before anchorDate) turning into an infinite
// loop — 500 weekly occurrences is close to 10 years, far beyond any
// realistic rolling window this app would ever request.
export function occurrencesInWindow(
  anchorDate: string,
  frequency: RecurrenceFrequency,
  afterDate: string,
  windowEndDate: string
): string[] {
  const occurrences: string[] = [];

  let step = 0;
  let iterations = 0;

  // Each occurrence is computed fresh from the anchor (occurrenceAtStep),
  // not chained off the previous one, so the cadence never drifts — see
  // that function's comment for why chaining would be wrong whenever a
  // short month clamps one occurrence in the middle of the window.
  while (iterations < 500) {
    iterations += 1;

    const current = occurrenceAtStep(anchorDate, frequency, step);
    step += 1;

    if (current > windowEndDate) {
      break;
    }

    if (current > afterDate) {
      occurrences.push(current);
    }
  }

  return occurrences;
}
