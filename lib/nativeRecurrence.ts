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
  | "bimonthly"
  | "monthly"
  | "quarterly"
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

// The next occurrence after `date`, same cadence rule this app already
// uses for Jobber's RRULE (see lib/jobberJob.ts's RECURRENCE_RULES) —
// "Bi-Monthly" means every 2 months here, not twice a month, matching
// this app's trade usage throughout (job-costs page's RECURRING_CATEGORIES,
// the schedule page's service-color rules).
export function nextOccurrenceDate(
  date: string,
  frequency: RecurrenceFrequency
): string {
  const parsed = parseDateOnly(date);

  switch (frequency) {
    case "weekly":
      parsed.setUTCDate(parsed.getUTCDate() + 7);
      break;
    case "bimonthly":
      parsed.setUTCMonth(parsed.getUTCMonth() + 2);
      break;
    case "monthly":
      parsed.setUTCMonth(parsed.getUTCMonth() + 1);
      break;
    case "quarterly":
      parsed.setUTCMonth(parsed.getUTCMonth() + 3);
      break;
    case "semiannual":
      parsed.setUTCMonth(parsed.getUTCMonth() + 6);
      break;
  }

  return formatDateOnly(parsed);
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

  let current = anchorDate;
  let iterations = 0;

  // Walk forward from the anchor (not from afterDate) so the cadence
  // never drifts, but don't start collecting until we're past afterDate.
  while (iterations < 500) {
    iterations += 1;

    if (current > windowEndDate) {
      break;
    }

    if (current > afterDate) {
      occurrences.push(current);
    }

    current = nextOccurrenceDate(current, frequency);
  }

  return occurrences;
}
