// Pure helpers for the Reactivation Pipeline (app/(platform)/reactivation
// and the "Reactivation Pipeline" card on app/(platform)/customers/intelligence).
// Zero dependency on lib/supabase-server.ts or any other server-only
// module, same reasoning as lib/permissionRules.ts and lib/shiftHours.ts —
// keeps this importable from tests and from the "use server" action
// without dragging in a Supabase client construction.

export type ReactivationStatus =
  | "candidate"
  | "contacted_email"
  | "contacted_text"
  | "follow_up_3mo"
  | "follow_up_6mo"
  | "scheduled"
  | "not_interested"
  | "dog_passed_away"
  | "removed";

export const REACTIVATION_STATUSES: ReactivationStatus[] = [
  "candidate",
  "contacted_email",
  "contacted_text",
  "follow_up_3mo",
  "follow_up_6mo",
  "scheduled",
  "not_interested",
  "dog_passed_away",
  "removed",
];

export function isReactivationStatus(
  value: string
): value is ReactivationStatus {
  return (REACTIVATION_STATUSES as string[]).includes(value);
}

// /reactivation predates this file's status set (contacted / follow_up /
// booked, no email-vs-text or 3mo-vs-6mo distinction). Any row still
// carrying one of those old values normalizes to its closest current
// equivalent here — a display-time safety net, not a bulk rewrite of old
// rows. Shared by app/(platform)/reactivation (rendering the pipeline)
// and app/(platform)/customers/intelligence (deciding whether a
// candidate is still "untouched" or already being worked in
// Reactivation) so the two pages can't drift on what counts as which
// status.
const LEGACY_STATUS_MAP: Record<string, ReactivationStatus> = {
  contacted: "contacted_email",
  follow_up: "follow_up_3mo",
  booked: "scheduled",
};

export function normalizeReactivationStatus(
  raw: string | null
): ReactivationStatus {
  if (!raw) return "candidate";
  if (isReactivationStatus(raw)) return raw;
  return LEGACY_STATUS_MAP[raw] ?? "candidate";
}

export const REACTIVATION_STATUS_LABELS: Record<ReactivationStatus, string> =
  {
    candidate: "Candidate",
    contacted_email: "Contacted – Emailed",
    contacted_text: "Contacted – Text Messaged",
    follow_up_3mo: "Reach Out in 3 Months",
    follow_up_6mo: "Reach Out in 6 Months",
    scheduled: "Cleaning Scheduled",
    not_interested: "Not Interested",
    dog_passed_away: "Dog Passed Away",
    removed: "Removed",
  };

export const REACTIVATION_STATUS_STYLES: Record<
  ReactivationStatus,
  { background: string; color: string }
> = {
  candidate: { background: "#f3e8ff", color: "#7e22ce" },
  contacted_email: { background: "#dbeafe", color: "#1d4ed8" },
  contacted_text: { background: "#e0f2fe", color: "#0369a1" },
  follow_up_3mo: { background: "#fef3c7", color: "#92400e" },
  follow_up_6mo: { background: "#fde68a", color: "#78350f" },
  scheduled: { background: "#dcfce7", color: "#166534" },
  not_interested: { background: "#fee2e2", color: "#991b1b" },
  dog_passed_away: { background: "#e5e7eb", color: "#374151" },
  removed: { background: "#f3f4f6", color: "#6b7280" },
};

// A "contact" action is one where we actually reached out to the
// customer just now — as opposed to an outcome/disposition change
// (scheduled, not_interested, dog_passed_away, removed) that may be
// recorded some time after the last real contact. Only contact actions
// bump reactivation_last_contacted_at / reactivation_contact_attempts.
const CONTACT_STATUSES: ReactivationStatus[] = [
  "contacted_email",
  "contacted_text",
  "follow_up_3mo",
  "follow_up_6mo",
];

export type RecontactInterval = "3mo" | "6mo";

export function addMonthsIso(base: Date, months: number): string {
  const result = new Date(base.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

export type ReactivationCurrentState = {
  lastContactedAt: string | null;
  contactAttempts: number;
  recontactInterval: RecontactInterval | null;
};

export type ReactivationUpdate = {
  status: ReactivationStatus;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  contactAttempts: number;
  recontactInterval: RecontactInterval | null;
};

// The single state-transition function driving every status button on
// /reactivation. Deliberately pure (takes "now" as a parameter) so it's
// fully testable without mocking Date or hitting the database.
export function nextReactivationState(
  current: ReactivationCurrentState,
  status: ReactivationStatus,
  now: Date
): ReactivationUpdate {
  const isContact = CONTACT_STATUSES.includes(status);

  let nextFollowUpAt: string | null = null;
  let recontactInterval = current.recontactInterval;

  if (status === "follow_up_3mo") {
    nextFollowUpAt = addMonthsIso(now, 3);
    recontactInterval = "3mo";
  } else if (status === "follow_up_6mo") {
    nextFollowUpAt = addMonthsIso(now, 6);
    recontactInterval = "6mo";
  }
  // Every other status (contacted_email/contacted_text/scheduled/
  // not_interested/dog_passed_away/removed/candidate) clears the
  // follow-up date — there's nothing scheduled until a 3mo/6mo choice
  // is made again. recontactInterval is left untouched (not reset) so
  // the follow-up date badge still shows which window a customer was
  // last placed in, even after they move to a different status.

  return {
    status,
    lastContactedAt: isContact ? now.toISOString() : current.lastContactedAt,
    nextFollowUpAt,
    contactAttempts: isContact
      ? current.contactAttempts + 1
      : current.contactAttempts,
    recontactInterval,
  };
}

export function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isOverdue(nextFollowUpAt: string | null, now: Date): boolean {
  if (!nextFollowUpAt) return false;
  return startOfDay(new Date(nextFollowUpAt)).getTime() < startOfDay(now).getTime();
}

export function isDueToday(
  nextFollowUpAt: string | null,
  now: Date
): boolean {
  if (!nextFollowUpAt) return false;
  return isSameDay(new Date(nextFollowUpAt), now);
}

export function isUpcoming(
  nextFollowUpAt: string | null,
  now: Date
): boolean {
  if (!nextFollowUpAt) return false;
  return startOfDay(new Date(nextFollowUpAt)).getTime() > startOfDay(now).getTime();
}

// Statuses that represent an in-progress or completed workflow — kept
// visible on /reactivation even if a customer's days-since-last-invoice
// has drifted outside the normal 90–547 day candidate window (see
// isReactivationCandidate below), since staff are actively working the
// account. Only "candidate" (never touched) and "removed" (explicitly
// dropped) fall back to the plain time-bucket filter.
export function isActiveWorkflowStatus(
  status: string | null
): boolean {
  return (
    status === "contacted_email" ||
    status === "contacted_text" ||
    status === "follow_up_3mo" ||
    status === "follow_up_6mo" ||
    status === "scheduled" ||
    status === "not_interested" ||
    status === "dog_passed_away"
  );
}

export type ReactivationFilter =
  | "all"
  | "candidate"
  | "contacted"
  | "follow_up"
  | "scheduled";

export function matchesReactivationFilter(
  status: ReactivationStatus | null,
  filter: ReactivationFilter
): boolean {
  const effectiveStatus = status ?? "candidate";

  if (filter === "all") return true;

  if (filter === "candidate") return effectiveStatus === "candidate";

  if (filter === "contacted") {
    return (
      effectiveStatus === "contacted_email" ||
      effectiveStatus === "contacted_text"
    );
  }

  if (filter === "follow_up") {
    return (
      effectiveStatus === "follow_up_3mo" || effectiveStatus === "follow_up_6mo"
    );
  }

  if (filter === "scheduled") return effectiveStatus === "scheduled";

  return false;
}

// Plain day-count between two YYYY-MM-DD-ish date strings, treated as
// UTC midnight — the same math Customer Intelligence's local daysBetween
// already used. Shared here so both pages compute "days since last
// invoice" identically; this function existing in one place is what
// keeps their candidate counts from silently drifting apart again.
export function daysBetweenDateStrings(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  return Math.max(
    0,
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000)
  );
}

export type ReactivationTimeBucketKey = "3-6" | "6-12" | "12-18";

// The three buckets shown on both Customer Intelligence's Reactivation
// Pipeline card and /reactivation's pipeline — same day ranges, same
// titles, defined once. 18+ months is deliberately excluded from this
// list (matches Intelligence's existing "leave 18+ months off the
// active list" behavior); /reactivation adds its own catch-all bucket
// on top of this for anyone being actively worked whose day count has
// drifted past 547 — see pipelineTimeBucketForCustomer-style logic in
// that page.
export const REACTIVATION_TIME_BUCKETS: {
  key: ReactivationTimeBucketKey;
  title: string;
  subtitle: string;
  minDays: number;
  maxDaysExclusive: number;
}[] = [
  {
    key: "3-6",
    title: "3–6 Months",
    subtitle: "90–179 days since last invoice",
    minDays: 90,
    maxDaysExclusive: 180,
  },
  {
    key: "6-12",
    title: "6–12 Months",
    subtitle: "180–364 days since last invoice",
    minDays: 180,
    maxDaysExclusive: 365,
  },
  {
    key: "12-18",
    title: "12–18 Months",
    subtitle: "365–547 days since last invoice",
    minDays: 365,
    maxDaysExclusive: 548,
  },
];

export function timeBucketForDays(
  days: number
): ReactivationTimeBucketKey | null {
  const match = REACTIVATION_TIME_BUCKETS.find(
    (bucket) => days >= bucket.minDays && days < bucket.maxDaysExclusive
  );

  return match ? match.key : null;
}

// The single rule for "is this customer a reactivation candidate at
// all" — has at least one invoice, hasn't invoiced in 90–547 days,
// isn't on a recurring service plan, and hasn't been permanently
// excluded (Customer Intelligence's exclusion reasons: Moved, Do Not
// Contact, Dog Passed Away, etc). Shared by both pages so the
// population feeding their bucket counts can't diverge — this exact
// mismatch (125 on Intelligence vs. 195 on Reactivation) is what
// prompted pulling it out here instead of each page rolling its own
// version of this filter.
export function isReactivationCandidate(input: {
  invoiceCount: number;
  daysSinceLastInvoice: number | null;
  isRecurring: boolean;
  isExcluded: boolean;
}): boolean {
  return (
    input.invoiceCount > 0 &&
    input.daysSinceLastInvoice !== null &&
    input.daysSinceLastInvoice >= 90 &&
    input.daysSinceLastInvoice < 548 &&
    !input.isRecurring &&
    !input.isExcluded
  );
}
