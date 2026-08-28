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
  // is made again. recontactInterval is left untouched so scheduled/
  // not_interested/dog_passed_away outcomes still remember which
  // window they came from, for buildRecontactGroupStats() below.

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
// visible on /reactivation regardless of how long it's been since their
// last completed job, since staff are actively working the account.
// Only "candidate" (never touched) and "removed" (explicitly dropped)
// fall back to the plain inactivity-based filter.
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
  | "scheduled"
  | "dog_passed_away"
  | "win_back";

export function matchesReactivationFilter(
  status: ReactivationStatus | null,
  daysSinceLastJob: number,
  filter: ReactivationFilter,
  twelveMonthsInDays: number
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

  if (filter === "dog_passed_away") return effectiveStatus === "dog_passed_away";

  if (filter === "win_back") {
    return (
      daysSinceLastJob >= twelveMonthsInDays && effectiveStatus === "candidate"
    );
  }

  return false;
}

export type RecontactGroupStats = {
  interval: RecontactInterval;
  label: string;
  total: number;
  scheduled: number;
  conversionRate: number;
};

// "How many customers we placed in the 3-month (or 6-month) reach-out
// window are now a Cleaning Scheduled?" — the metric the whole
// recontact-interval column exists to answer. `total` deliberately
// excludes not_interested/dog_passed_away/removed outcomes for that
// interval, since a "no" doesn't tell us anything about whether the
// *timing* worked, only that the customer wasn't a fit at all.
export function buildRecontactGroupStats(
  customers: {
    reactivationStatus: ReactivationStatus | null;
    recontactInterval: RecontactInterval | null;
  }[]
): RecontactGroupStats[] {
  const intervals: RecontactInterval[] = ["3mo", "6mo"];

  return intervals.map((interval) => {
    const inGroup = customers.filter(
      (customer) =>
        customer.recontactInterval === interval &&
        customer.reactivationStatus !== "not_interested" &&
        customer.reactivationStatus !== "dog_passed_away" &&
        customer.reactivationStatus !== "removed"
    );

    const scheduled = inGroup.filter(
      (customer) => customer.reactivationStatus === "scheduled"
    );

    return {
      interval,
      label: interval === "3mo" ? "3-Month Group" : "6-Month Group",
      total: inGroup.length,
      scheduled: scheduled.length,
      conversionRate:
        inGroup.length > 0 ? scheduled.length / inGroup.length : 0,
    };
  });
}
