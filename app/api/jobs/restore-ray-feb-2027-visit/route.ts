// One-off, single-visit backfill (2026-11-09). Ryan: "Somehow Katie
// Ray's Feb 2027 visit got removed. Can you put it back in?"
//
// Job #1223 (gid://Jobber/Job/143759498) is a real Jobber job whose
// future visits are generated natively by this app (jobber_jobs.
// recurrence_frequency/recurrence_anchor_date, source: "native" on each
// generated jobber_visits row -- see lib/nativeJobs.ts). Its list of
// upcoming visits goes ...Jan 29, 2027, Mar 29, 2027... with nothing in
// February at all -- every other month lines up on the 29th.
//
// Root cause: lib/nativeRecurrence.ts's nextOccurrenceDate() used to
// compute a monthly step with plain JS Date month arithmetic
// (setUTCMonth), which OVERFLOWS into the next month when the
// anchor's day-of-month doesn't exist in the target month, instead of
// clamping to that month's last day -- Jan 29 + 1 month lands on "Feb
// 29," which doesn't exist in 2027 (not a leap year), so JS Date rolled
// it forward into March instead of landing in February at all. That bug
// is fixed in the same commit as this file (nextOccurrenceDate now
// clamps, and occurrencesInWindow recomputes each occurrence from the
// original anchor day rather than chaining off a possibly-clamped
// result, so a short February no longer permanently shifts every later
// occurrence) -- but the fix only prevents this going forward. Whatever
// already generated (or got wiped and regenerated, e.g. by a past
// "Update recurring schedule" edit) already skipped February, and nothing
// retroactively re-walks a job's history, so this one visit needs to be
// inserted directly.
//
// Title picked the same way every other generator path on this job
// would (lib/nativeJobs.ts's resolveMonthlyVisitTitle): Ray's
// full_cleaning_months controls Full vs. Maintenance per calendar
// month, not alternation -- fetched live here rather than assumed, so
// this route fails closed (refuses to write) if that doesn't actually
// call February a Full month.
//
// Dry-run by default (?apply=true to write), admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { generateNativeId } from "@/lib/nativeJobs";

export const dynamic = "force-dynamic";

// jobber_jobs/jobber_clients store the base64-encoded Jobber gid (the
// same string used in this app's own /jobs/<id>/edit and
// /customers/<id> URLs), not the decoded "gid://Jobber/..." form --
// confirmed live via the existing debug-jobber-jobs-columns route
// before writing this constant, after an initial version of this route
// (using the decoded gid) returned "Job not found" against production.
const JOBBER_JOB_ID = "Z2lkOi8vSm9iYmVyL0pvYi8xNDM3NTk0OTg=";
const JOBBER_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC8xMjA5MDUwOTc=";

// Last day of Feb 2027 (not a leap year) -- the nearest sane date to
// the job's day-29 cadence that actually falls in February, matching
// standard "recurring charge" clamping semantics (same behavior the
// date-math fix in this commit gives every job going forward).
const TARGET_DATE = "2027-02-28";
const TARGET_MONTH = 2;

const DEFAULT_VISIT_START_TIME = "08:00";
const DEFAULT_VISIT_DURATION_MINUTES = 60;
const BUSINESS_UTC_OFFSET = "-07:00";

function toUtcRange(date: string): { startAt: string; endAt: string } {
  const start = new Date(
    `${date}T${DEFAULT_VISIT_START_TIME}:00${BUSINESS_UTC_OFFSET}`
  );
  const end = new Date(start.getTime() + DEFAULT_VISIT_DURATION_MINUTES * 60000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true";

  const { data: job, error: jobError } = await supabaseServer
    .from("jobber_jobs")
    .select("jobber_job_id, jobber_client_id, customer_name, job_number")
    .eq("jobber_job_id", JOBBER_JOB_ID)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message ?? "Job not found." },
      { status: 404 }
    );
  }

  const { data: customer, error: customerError } = await supabaseServer
    .from("customers")
    .select("last_name, full_cleaning_months, service_instructions")
    .eq("jobber_client_id", JOBBER_CLIENT_ID)
    .maybeSingle();

  if (customerError || !customer) {
    return NextResponse.json(
      { error: customerError?.message ?? "Customer not found." },
      { status: 404 }
    );
  }

  const fullCleaningMonths = (customer.full_cleaning_months as number[] | null) ?? null;
  const lastName = (customer.last_name as string | null)?.trim() || null;

  if (!fullCleaningMonths || !fullCleaningMonths.includes(TARGET_MONTH) || !lastName) {
    return NextResponse.json({
      error:
        "Katie Ray's full_cleaning_months doesn't mark February as a Full month (or last_name is missing) -- refusing to guess the title. Check customers.full_cleaning_months for this client before retrying.",
      fullCleaningMonths,
      lastName,
    });
  }

  const title = `${lastName} - Full - Monthly`;

  const { data: existing } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, start_at, title")
    .eq("jobber_job_id", JOBBER_JOB_ID)
    .gte("start_at", "2027-02-01T00:00:00-07:00")
    .lt("start_at", "2027-03-01T00:00:00-07:00");

  if (existing && existing.length > 0) {
    return NextResponse.json({
      error: "A visit already exists in February 2027 for this job -- not inserting another.",
      existing,
    });
  }

  const { startAt, endAt } = toUtcRange(TARGET_DATE);

  const newVisit = {
    jobber_visit_id: generateNativeId(),
    jobber_job_id: job.jobber_job_id as string,
    jobber_client_id: job.jobber_client_id as string,
    jobber_invoice_id: null,
    customer_name: job.customer_name as string | null,
    job_number: job.job_number as string,
    job_status: "upcoming",
    title,
    visit_status: "UPCOMING",
    start_at: startAt,
    end_at: endAt,
    completed_at: null,
    duration_minutes: DEFAULT_VISIT_DURATION_MINUTES,
    is_last_scheduled_visit: false,
    source: "native",
    updated_at: new Date().toISOString(),
  };

  if (apply) {
    const { error: insertError } = await supabaseServer
      .from("jobber_visits")
      .insert(newVisit);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, apply, inserted: newVisit });
}
