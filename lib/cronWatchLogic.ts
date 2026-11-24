// Pure logic for the scheduled-job watchdog (no server imports, so it is
// unit-testable). The server half is lib/cronWatch.ts.
import vercelConfig from "@/vercel.json";
import { phoenixHour } from "@/lib/nativeMigrationLogic";

// --- How often a job is supposed to run, from its cron expressions -------

// Longest gap, in hours, between consecutive scheduled runs of one job
// across the week. Handles the forms vercel.json uses: "m h * * *",
// "m h * * d" and "m * * * *".
export function maxGapHours(cronExpressions: string[]): number | null {
  const minutes = new Set<number>();

  for (const expr of cronExpressions) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [min, hour, dom, month, dow] = parts;
    if (dom !== "*" || month !== "*") return null;
    if (!/^\d+$/.test(min)) return null;

    const hours = hour === "*" ? Array.from({ length: 24 }, (_, i) => i) : /^\d+$/.test(hour) ? [Number(hour)] : null;
    const days = dow === "*" ? [0, 1, 2, 3, 4, 5, 6] : /^\d$/.test(dow) ? [Number(dow) % 7] : null;
    if (!hours || !days) return null;

    for (const d of days) {
      for (const h of hours) minutes.add(d * 1440 + h * 60 + Number(min));
    }
  }

  const sorted = Array.from(minutes).sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  let widest = sorted[0] + 10080 - sorted[sorted.length - 1];
  for (let i = 1; i < sorted.length; i++) widest = Math.max(widest, sorted[i] - sorted[i - 1]);

  return widest / 60;
}

// A run can start a little late (Vercel cron is not to the minute) or take
// a while, so allow some grace before calling a job missed.
export function allowedGapHours(gapHours: number): number {
  return gapHours + Math.max(3, gapHours * 0.25);
}

// --- Judging one job -----------------------------------------------------

export type JobStatusRow = {
  status: string | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
};

export type JobProblem = "late" | "failed" | "stuck";
export type JobState = "ok" | "never" | JobProblem;

export type JobEvaluation = { state: JobState; detail: string };

export const STUCK_AFTER_MINUTES = 15;
export const FAILED_ALERT_AFTER_MINUTES = 60;

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

function ago(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes ago`;
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function evaluateJob(row: JobStatusRow | null, expectedGapHours: number, now: Date): JobEvaluation {
  if (!row || (!row.lastSuccessAt && !row.lastStartedAt && !row.lastFailedAt)) {
    return { state: "never", detail: "Has not run yet." };
  }

  if (row.status === "failed" && row.lastFailedAt) {
    const minutes = hoursSince(row.lastFailedAt, now) * 60;
    // A failure that the next retry may already be fixing is not worth a page yet.
    if (minutes >= FAILED_ALERT_AFTER_MINUTES) {
      return {
        state: "failed",
        detail: `The last run failed ${ago(minutes / 60)}${row.lastError ? `: ${row.lastError.slice(0, 200)}` : "."}`,
      };
    }
  }

  if (row.status === "running" && row.lastStartedAt) {
    const minutes = hoursSince(row.lastStartedAt, now) * 60;
    if (minutes >= STUCK_AFTER_MINUTES) {
      return { state: "stuck", detail: `Has been running for ${Math.round(minutes)} minutes and never finished.` };
    }
  }

  const allowed = allowedGapHours(expectedGapHours);
  const last = row.lastSuccessAt;

  if (!last) {
    return { state: "late", detail: "Has started but never finished successfully." };
  }

  const since = hoursSince(last, now);
  if (since > allowed) {
    return {
      state: "late",
      detail: `Last finished ${ago(since)}; it should run about every ${Math.round(expectedGapHours)} hours.`,
    };
  }

  return { state: "ok", detail: `Last finished ${ago(since)}.` };
}

// --- Deciding who to tell and when --------------------------------------

export const REMIND_AFTER_HOURS = 24;

// Alerts go out 7am-9pm Phoenix time. At night the problem is still recorded
// and the alert goes out at the first check after 7am.
export function isAlertHour(now: Date): boolean {
  const hour = phoenixHour(now);
  return hour >= 7 && hour < 21;
}

export type OpenAlert = {
  id: string;
  syncType: string;
  problem: JobProblem;
  lastNotifiedAt: string | null;
};

export type WatchAction =
  | { kind: "open"; syncType: string; problem: JobProblem; detail: string; notifyNow: boolean }
  | { kind: "notify"; alertId: string; syncType: string; problem: JobProblem; detail: string; reminder: boolean }
  | { kind: "resolve"; alertId: string; syncType: string };

export function planWatchActions(
  evaluations: { syncType: string; evaluation: JobEvaluation }[],
  openAlerts: OpenAlert[],
  now: Date
): WatchAction[] {
  const actions: WatchAction[] = [];
  const openBySync = new Map(openAlerts.map((alert) => [alert.syncType, alert]));
  const canNotify = isAlertHour(now);

  for (const { syncType, evaluation } of evaluations) {
    const open = openBySync.get(syncType);
    const state = evaluation.state;
    const isProblem = state === "late" || state === "failed" || state === "stuck";

    if (!isProblem) {
      // "never" is not a problem (a brand-new job); anything else is healthy.
      if (open && state === "ok") actions.push({ kind: "resolve", alertId: open.id, syncType });
      continue;
    }

    if (!open) {
      actions.push({ kind: "open", syncType, problem: state, detail: evaluation.detail, notifyNow: canNotify });
      continue;
    }

    if (!canNotify) continue;

    if (!open.lastNotifiedAt) {
      actions.push({ kind: "notify", alertId: open.id, syncType, problem: state, detail: evaluation.detail, reminder: false });
    } else if (hoursSince(open.lastNotifiedAt, now) >= REMIND_AFTER_HOURS) {
      actions.push({ kind: "notify", alertId: open.id, syncType, problem: state, detail: evaluation.detail, reminder: true });
    }
  }

  return actions;
}

// --- Which jobs are watched ----------------------------------------------

export type WatchedJob = {
  path: string;
  syncType: string;
  label: string;
  // Hours between scheduled runs (the longest gap), from vercel.json.
  gapHours: number;
};

// Every cron path that records its runs, and what to call it. A path in
// vercel.json that is not here or in UNTRACKED_PATHS fails the unit test
// (lib/cronWatch.test.ts), so a new cron cannot be added and forgotten.
export const JOB_REGISTRY: Record<string, { syncType: string; label: string }> = {
  "/api/jobber/sync-invoices": { syncType: "invoices", label: "Jobber invoice sync" },
  "/api/jobber/sync-payments": { syncType: "payments", label: "Jobber payment sync" },
  "/api/jobber/sync-payouts": { syncType: "payouts", label: "Jobber payout sync" },
  "/api/jobber/sync-payment-fees": { syncType: "payment-fees", label: "Jobber card fee sync" },
  "/api/jobs/generate-recurring-visits": { syncType: "native-recurring-visits", label: "Recurring visit generation" },
  "/api/visits/send-reminders": { syncType: "visit-reminders", label: "Visit reminders" },
  "/api/visits/send-review-requests": { syncType: "review-requests", label: "Review requests" },
  "/api/invoices/charge-scheduled-autopay": { syncType: "autopay-scheduled-charges", label: "Scheduled autopay charges" },
  "/api/invoices/send-overdue-reminders": { syncType: "invoice-overdue-reminders", label: "Overdue invoice reminders" },
  "/api/invoices/send-scheduled-migration-invites": { syncType: "migration-invites", label: "Scheduled migration invites" },
  "/api/quotes/send-followups": { syncType: "quote-followups", label: "Quote follow-ups" },
  "/api/ops/send-daily-digest": { syncType: "daily-digest", label: "Daily digest" },
  "/api/ops/weekly-backup": { syncType: "weekly-backup", label: "Weekly backup" },
  "/api/ops/check-scheduled-jobs": { syncType: "job-watchdog", label: "This watchdog" },
};

// Cron paths that deliberately do not record runs. The Jobber webhook
// processor has its own backlog check on System Health.
export const UNTRACKED_PATHS = ["/api/jobber/process-webhooks"];

type CronEntry = { path: string; schedule: string };

export function watchedJobs(crons: CronEntry[] = vercelConfig.crons as CronEntry[]): WatchedJob[] {
  const byPath = new Map<string, string[]>();
  for (const cron of crons) {
    byPath.set(cron.path, [...(byPath.get(cron.path) ?? []), cron.schedule]);
  }

  const jobs: WatchedJob[] = [];
  for (const [path, schedules] of byPath) {
    const known = JOB_REGISTRY[path];
    const gap = maxGapHours(schedules);
    if (!known || gap === null) continue;
    jobs.push({ path, syncType: known.syncType, label: known.label, gapHours: gap });
  }
  return jobs;
}

