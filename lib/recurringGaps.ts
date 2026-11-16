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

import {
  SCHEDULE_GAP_ACK_ENTITY,
  describeGap,
  detectGaps,
  type GapJob,
  type ScheduleGap,
} from "@/lib/recurringGapsLogic";

// Re-exported so existing imports of these keep working.
export { SCHEDULE_GAP_ACK_ENTITY, describeGap, detectGaps };
export type { GapJob, ScheduleGap };

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
