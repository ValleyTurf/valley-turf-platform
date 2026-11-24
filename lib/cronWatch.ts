// Scheduled-job watchdog. Nearly every cron job in vercel.json records each
// run in jobber_sync_status (lib/jobberSyncTracking.ts). This reads that,
// works out how often each job should run from vercel.json itself, and
// tells you when one did not run, failed, or got stuck. It checks once a day (8:25am Phoenix)
// (app/api/ops/check-scheduled-jobs), and System Health shows the same
// verdicts live.
//
// Limits: the watchdog is itself a cron job, so if Vercel stopped all crons
// at once, nothing here would fire. System Health still shows the watchdog's
// own last run, so a glance there catches that case.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { sendPush } from "@/lib/webPush";
import { sendJobWatchEmail } from "@/lib/notifications";
import {
  evaluateJob,
  planWatchActions,
  watchedJobs,
  type WatchedJob,
  type JobEvaluation,
  type JobProblem,
  type JobStatusRow,
  type OpenAlert,
} from "@/lib/cronWatchLogic";

export type JobReport = { job: WatchedJob; evaluation: JobEvaluation };

type StatusRow = {
  sync_type: string;
  status: string | null;
  last_started_at: string | null;
  last_success_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
};

export async function evaluateAllJobs(now: Date = new Date()): Promise<JobReport[]> {
  const jobs = watchedJobs();

  const { data, error } = await supabaseServer
    .from("jobber_sync_status")
    .select("sync_type, status, last_started_at, last_success_at, last_failed_at, last_error")
    .in("sync_type", jobs.map((job) => job.syncType));

  if (error) throw new Error(`Could not read job status: ${error.message}`);

  const bySync = new Map<string, JobStatusRow>(
    ((data ?? []) as StatusRow[]).map((row) => [
      row.sync_type,
      {
        status: row.status,
        lastStartedAt: row.last_started_at,
        lastSuccessAt: row.last_success_at,
        lastFailedAt: row.last_failed_at,
        lastError: row.last_error,
      },
    ])
  );

  return jobs.map((job) => ({
    job,
    evaluation: evaluateJob(bySync.get(job.syncType) ?? null, job.gapHours, now),
  }));
}

const PROBLEM_WORDS: Record<JobProblem, string> = {
  late: "did not run on time",
  failed: "failed",
  stuck: "got stuck",
};

async function tell(job: WatchedJob, problem: JobProblem | "recovered", detail: string, reminder: boolean) {
  const title =
    problem === "recovered"
      ? `${job.label} is back to normal`
      : `${reminder ? "Still a problem: " : ""}${job.label} ${PROBLEM_WORDS[problem]}`;

  await Promise.all([
    sendPush("job_problem", { title, body: detail.slice(0, 160), url: "/health", badgeCount: 0 }),
    sendJobWatchEmail(title, [
      detail,
      problem === "recovered"
        ? "No action needed."
        : "Open System Health in the CRM to see all scheduled jobs. If a job keeps failing, the error above says why.",
    ]),
  ]);
}

export type WatchdogSummary = { checked: number; opened: number; notified: number; resolved: number };

export async function runWatchdog(now: Date = new Date()): Promise<WatchdogSummary> {
  const reports = await evaluateAllJobs(now);
  const jobBySync = new Map(reports.map((r) => [r.job.syncType, r.job]));

  const summary: WatchdogSummary = { checked: reports.length, opened: 0, notified: 0, resolved: 0 };

  const { data: openRows, error } = await supabaseServer
    .from("scheduled_job_alerts")
    .select("id, sync_type, problem, last_notified_at")
    .is("resolved_at", null);

  if (error) {
    // Most likely migration 120 has not been run. Without a place to record
    // alerts the same problem would be re-sent every hour, so send nothing.
    console.error("Job watchdog cannot read alerts (migration 120 run?):", error.message);
    return summary;
  }

  const openAlerts: OpenAlert[] = (openRows ?? []).map((row) => ({
    id: row.id as string,
    syncType: row.sync_type as string,
    problem: row.problem as JobProblem,
    lastNotifiedAt: row.last_notified_at as string | null,
  }));

  const actions = planWatchActions(
    reports.map((r) => ({ syncType: r.job.syncType, evaluation: r.evaluation })),
    openAlerts,
    now
  );

  for (const action of actions) {
    const job = jobBySync.get(action.syncType);
    if (!job) continue;

    if (action.kind === "open") {
      const { data: inserted, error: insertError } = await supabaseServer
        .from("scheduled_job_alerts")
        .insert({
          sync_type: action.syncType,
          problem: action.problem,
          detail: action.detail,
          last_notified_at: action.notifyNow ? now.toISOString() : null,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error("Job watchdog could not record an alert:", insertError?.message);
        continue;
      }

      summary.opened += 1;
      if (action.notifyNow) {
        await tell(job, action.problem, `${job.label}: ${action.detail}`, false);
        summary.notified += 1;
      }
    } else if (action.kind === "notify") {
      await supabaseServer
        .from("scheduled_job_alerts")
        .update({ last_notified_at: now.toISOString(), detail: action.detail })
        .eq("id", action.alertId);
      await tell(job, action.problem, `${job.label}: ${action.detail}`, action.reminder);
      summary.notified += 1;
    } else {
      const { data: closed } = await supabaseServer
        .from("scheduled_job_alerts")
        .update({ resolved_at: now.toISOString() })
        .eq("id", action.alertId)
        .select("last_notified_at")
        .maybeSingle();
      summary.resolved += 1;
      // Only say "back to normal" if someone was told it was down.
      if (closed?.last_notified_at) {
        await tell(job, "recovered", `${job.label} ran successfully again.`, false);
      }
    }
  }

  return summary;
}
