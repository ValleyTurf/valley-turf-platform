// Pure half of the recurring-schedule gap check (see lib/recurringGaps.ts
// for what a gap is and how acknowledgements work): date logic only, no
// database, so it can be unit tested.
export const SCHEDULE_GAP_ACK_ENTITY = "schedule_gap_ack";

const INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 31,
  bimonthly: 62,
  quarterly: 92,
  triannual: 123,
  semiannual: 184,
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "weekly",
  biweekly: "every 2 weeks",
  monthly: "monthly",
  bimonthly: "every 2 months",
  quarterly: "quarterly",
  triannual: "every 4 months",
  semiannual: "every 6 months",
};

export type GapJob = {
  jobId: string;
  jobNumber: string | null;
  clientId: string | null;
  customerName: string | null;
  title: string | null;
  frequency: string;
};

export type ScheduleGap = GapJob & {
  // Stable id for "mark as intended" -- the job plus the two dates the
  // hole sits between, so acknowledging one gap never hides a different
  // one that shows up on the same job later.
  key: string;
  kind: "gap" | "none_upcoming";
  from: string | null;
  to: string | null;
  days: number | null;
};

function daysBetween(earlier: string, later: string): number {
  const [ey, em, ed] = earlier.split("-").map(Number);
  const [ly, lm, ld] = later.split("-").map(Number);
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86400000);
}

export function maxAllowedGapDays(frequency: string): number | null {
  const interval = INTERVAL_DAYS[frequency];
  return interval ? Math.ceil(interval * 1.5) : null;
}

export function detectGaps(job: GapJob, visitDates: string[], today: string): ScheduleGap[] {
  const allowed = maxAllowedGapDays(job.frequency);

  if (allowed === null) return [];

  const dates = Array.from(new Set(visitDates)).sort();
  const upcoming = dates.filter((date) => date >= today);

  if (upcoming.length === 0) {
    const last = dates.length > 0 ? dates[dates.length - 1] : null;

    return [
      {
        ...job,
        key: `${job.jobId}|none|${last ?? "never"}`,
        kind: "none_upcoming",
        from: last,
        to: null,
        days: null,
      },
    ];
  }

  const gaps: ScheduleGap[] = [];

  for (let i = 1; i < dates.length; i += 1) {
    const from = dates[i - 1];
    const to = dates[i];

    if (to < today) continue;

    const days = daysBetween(from, to);

    if (days > allowed) {
      gaps.push({ ...job, key: `${job.jobId}|${from}|${to}`, kind: "gap", from, to, days });
    }
  }

  return gaps;
}

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function describeGap(gap: ScheduleGap): string {
  const who = `${gap.customerName || "Unknown customer"} (Job #${gap.jobNumber ?? "?"}, ${
    FREQUENCY_LABELS[gap.frequency] ?? gap.frequency
  })`;

  if (gap.kind === "none_upcoming") {
    return gap.from
      ? `${who} -- no upcoming visits; last one was ${formatDay(gap.from)}`
      : `${who} -- no visits scheduled at all`;
  }

  return `${who} -- nothing between ${formatDay(gap.from as string)} and ${formatDay(
    gap.to as string
  )} (${gap.days} days)`;
}
