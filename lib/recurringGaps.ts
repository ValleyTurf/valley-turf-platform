// Nightly "is there a hole in anyone's recurring schedule?" check
// (Ryan, 2026-11-15). Katie Ray's February 2027 visit silently never
// existed -- every month around it was there, nothing errored, and it
// was only caught because Ryan happened to notice. This looks at every
// active recurring job's visits and flags two things:
//
//   - a GAP: two consecutive visits further apart than the job's cadence
//     allows (more than 1.5x its interval -- wide enough that an
//     ordinary reschedule by a week or two never trips it, narrow enough
//     that one missing occurrence always does), where the later visit is
//     still ahead of today;
//   - NONE UPCOMING: an active recurring job with no visit from today
//     forward at all (its schedule ran dry).
//
// Two things deliberately do NOT count:
//   - a gap someone has marked as intended on the Recurring Services
//     page (stored as an audit_log row, entity_type "schedule_gap_ack"
//     -- no new table, and it doubles as the record of who said so);
//   - a gap that contains a visit someone skipped on purpose. Schedule's
//     Skip button records the job and date of what it removed (added
//     alongside this file), so those explain themselves from here on.
//     Skips made before that was recorded can't be matched to a job and
//     need the one-time "intended" click instead.
//
// detectGaps() is pure (no database) so the date logic can be checked
// on its own.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";

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

const PAGE_SIZE = 1000;
const JOB_ID_CHUNK = 40;

type JobRow = {
  jobber_job_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  job_number: string | null;
  recurrence_frequency: string | null;
  end_at: string | null;
};

export async function findRecurringScheduleGaps(): Promise<{
  gaps: ScheduleGap[];
  errors: string[];
}> {
  const errors: string[] = [];
  const today = toPhoenixDateString(new Date().toISOString());

  if (!today) {
    return { gaps: [], errors: ["Couldn't determine today's date in Phoenix time."] };
  }

  // Same "active recurring job" definition the visit generator uses
  // (lib/nativeJobs.ts's generateUpcomingNativeVisits).
  const { data: jobsData, error: jobsError } = await supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, jobber_client_id, customer_name, title, job_number, recurrence_frequency, end_at"
    )
    .eq("source", "native")
    .not("job_status", "in", "(archived,completed)")
    .not("recurrence_frequency", "is", null);

  if (jobsError) {
    return { gaps: [], errors: [`Couldn't load recurring jobs: ${jobsError.message}`] };
  }

  const jobs = ((jobsData ?? []) as JobRow[]).filter((job) => {
    // A job whose own end date has passed is finished, not dry.
    const endDay = toPhoenixDateString(job.end_at);
    return !endDay || endDay >= today;
  });

  if (jobs.length === 0) return { gaps: [], errors };

  // Far enough back to always include the visit just before today, even
  // for the longest cadence at its widest allowed gap.
  const floor = new Date(Date.now() - 400 * 86400000).toISOString();
  const datesByJob = new Map<string, string[]>();

  for (let i = 0; i < jobs.length; i += JOB_ID_CHUNK) {
    const ids = jobs.slice(i, i + JOB_ID_CHUNK).map((job) => job.jobber_job_id);
    let from = 0;

    while (true) {
      const { data, error } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_job_id, start_at")
        .in("jobber_job_id", ids)
        .gte("start_at", floor)
        .order("jobber_visit_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        errors.push(`Couldn't load visits for the schedule gap check: ${error.message}`);
        return { gaps: [], errors };
      }

      for (const row of data ?? []) {
        const day = toPhoenixDateString(row.start_at as string | null);
        const jobId = row.jobber_job_id as string | null;

        if (!day || !jobId) continue;

        const list = datesByJob.get(jobId) ?? [];
        list.push(day);
        datesByJob.set(jobId, list);
      }

      if ((data ?? []).length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const found = jobs.flatMap((job) =>
    detectGaps(
      {
        jobId: job.jobber_job_id,
        jobNumber: job.job_number,
        clientId: job.jobber_client_id,
        customerName: job.customer_name,
        title: job.title,
        frequency: job.recurrence_frequency as string,
      },
      datesByJob.get(job.jobber_job_id) ?? [],
      today
    )
  );

  if (found.length === 0) return { gaps: [], errors };

  const [ackResult, skipResult] = await Promise.all([
    supabaseServer
      .from("audit_log")
      .select("entity_id")
      .eq("entity_type", SCHEDULE_GAP_ACK_ENTITY)
      .in(
        "entity_id",
        found.map((gap) => gap.key)
      ),
    supabaseServer
      .from("audit_log")
      .select("changes")
      .eq("entity_type", "visit")
      .eq("entity_label", "Skip visit")
      .gte("created_at", floor)
      .limit(PAGE_SIZE),
  ]);

  if (ackResult.error) errors.push(`Couldn't load acknowledged gaps: ${ackResult.error.message}`);
  if (skipResult.error) errors.push(`Couldn't load skipped visits: ${skipResult.error.message}`);

  const acknowledged = new Set((ackResult.data ?? []).map((row) => row.entity_id as string));

  const skippedDaysByJob = new Map<string, string[]>();

  for (const row of skipResult.data ?? []) {
    const changes = row.changes as Record<string, { before?: unknown } | undefined> | null;
    const jobId = changes?.jobber_job_id?.before;
    const startAt = changes?.start_at?.before;

    if (typeof jobId !== "string" || typeof startAt !== "string") continue;

    const day = toPhoenixDateString(startAt);
    if (!day) continue;

    const list = skippedDaysByJob.get(jobId) ?? [];
    list.push(day);
    skippedDaysByJob.set(jobId, list);
  }

  const gaps = found.filter((gap) => {
    if (acknowledged.has(gap.key)) return false;

    const skipped = skippedDaysByJob.get(gap.jobId) ?? [];

    if (gap.kind === "gap") {
      return !skipped.some((day) => day > (gap.from as string) && day < (gap.to as string));
    }

    // "None upcoming" is only explained by a skip that came after the
    // last visit still on the books.
    return !skipped.some((day) => !gap.from || day > gap.from);
  });

  gaps.sort((a, b) => (a.to ?? a.from ?? "").localeCompare(b.to ?? b.from ?? ""));

  return { gaps, errors };
}
