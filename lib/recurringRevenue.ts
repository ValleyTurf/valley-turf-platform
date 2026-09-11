// Recurring-revenue (MRR) dashboard -- ROADMAP.md Fresh Ideas #4. See
// app/(platform)/revenue/recurring/page.tsx for the UI this feeds.
//
// "Recurring job" here means the same thing lib/nativeJobs.ts's
// generateUpcomingNativeVisits already means by it: a jobber_jobs row
// with recurrence_frequency set. Everything below reads from that same
// table/columns -- no new schema beyond recurrence_cancelled_at
// (migration 071_add_recurrence_cancelled_at.sql).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import type { RecurrenceFrequency } from "@/lib/nativeRecurrence";
import { toNumber } from "@/lib/format";

// Average occurrences per calendar month for each cadence -- the
// standard way a subscription-style business normalizes different
// billing frequencies onto one comparable "monthly recurring revenue"
// figure. 52/12 and 26/12 (not 4 and 2) for weekly/biweekly since months
// don't divide evenly into either -- using a flat 4x would systematically
// understate a weekly job's true monthly value.
export const MONTHLY_EQUIVALENT: Record<RecurrenceFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  bimonthly: 0.5,
  monthly: 1,
  quarterly: 1 / 3,
  triannual: 0.25,
  semiannual: 1 / 6,
};

export function monthlyEquivalentValue(
  total: number,
  frequency: RecurrenceFrequency
): number {
  return total * MONTHLY_EQUIVALENT[frequency];
}

// The calendar month migration 071 shipped in -- recurrence_cancelled_at
// is only ever populated for a cancellation from this point forward (see
// that migration's header comment), so any month before this one has no
// real Lost figure to report, not a true zero. Fixed, not derived from
// "today" at request time, so a month doesn't silently start being
// reported as "tracked" just because time passed without a code change --
// it's tracked because the column existed and cancelNativeJob was already
// writing to it during that month.
const LOST_MRR_TRACKING_STARTS = "2026-09";

function isRecurrenceFrequency(value: string | null): value is RecurrenceFrequency {
  return (
    value !== null &&
    value in MONTHLY_EQUIVALENT
  );
}

type RecurringJobRow = {
  jobber_job_id: string;
  total: number | string | null;
  recurrence_frequency: string | null;
  recurrence_anchor_date: string | null;
  recurrence_cancelled_at: string | null;
  job_status: string | null;
};

export type MonthlyRecurringRevenue = {
  month: string; // "YYYY-MM"
  newMrr: number;
  lostMrr: number;
  netMrr: number;
  lostTracked: boolean;
};

export type RecurringRevenueSummary = {
  currentMrr: number;
  activeRecurringJobs: number;
  months: MonthlyRecurringRevenue[]; // newest first
};

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function lastNMonthKeys(n: number, endingAt: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(endingAt.getUTCFullYear(), endingAt.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys; // newest first
}

export async function getRecurringRevenueSummary(
  monthsBack = 12
): Promise<RecurringRevenueSummary> {
  const { data, error } = await supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, total, recurrence_frequency, recurrence_anchor_date, recurrence_cancelled_at, job_status"
    )
    .not("recurrence_frequency", "is", null);

  if (error) {
    throw new Error(`Couldn't load recurring jobs: ${error.message}`);
  }

  const jobs = ((data ?? []) as RecurringJobRow[]).filter((job) =>
    isRecurrenceFrequency(job.recurrence_frequency)
  );

  let currentMrr = 0;
  let activeRecurringJobs = 0;

  const newByMonth = new Map<string, number>();
  const lostByMonth = new Map<string, number>();

  for (const job of jobs) {
    const frequency = job.recurrence_frequency as RecurrenceFrequency;
    const total = toNumber(job.total);
    const value = monthlyEquivalentValue(total, frequency);

    const isActive = job.job_status !== "archived" && job.job_status !== "completed";
    if (isActive) {
      currentMrr += value;
      activeRecurringJobs += 1;
    }

    if (job.recurrence_anchor_date) {
      const month = monthKeyOf(job.recurrence_anchor_date);
      newByMonth.set(month, (newByMonth.get(month) ?? 0) + value);
    }

    if (job.recurrence_cancelled_at) {
      const month = monthKeyOf(job.recurrence_cancelled_at);
      lostByMonth.set(month, (lostByMonth.get(month) ?? 0) + value);
    }
  }

  const months: MonthlyRecurringRevenue[] = lastNMonthKeys(monthsBack).map((month) => {
    const newMrr = newByMonth.get(month) ?? 0;
    const lostTracked = month >= LOST_MRR_TRACKING_STARTS;
    const lostMrr = lostTracked ? lostByMonth.get(month) ?? 0 : 0;

    return {
      month,
      newMrr,
      lostMrr,
      netMrr: newMrr - lostMrr,
      lostTracked,
    };
  });

  return { currentMrr, activeRecurringJobs, months };
}
