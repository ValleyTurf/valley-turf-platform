// Tier 2 (Jobber Independence Roadmap) — native job/visit creation and
// management, writing directly into jobber_jobs/jobber_visits instead of
// round-tripping through Jobber's jobCreate/jobEdit/visit mutations (see
// lib/jobberJob.ts and lib/jobberVisit.ts's header comments for the
// Jobber-side mutation shapes this replaces). See migration
// 054_add_native_jobs.sql for the schema this writes to, and its header
// comment for why this evolves the existing tables in place rather than
// building a parallel schema.
//
// A row's `source` column ('jobber' | 'native') is the single source of
// truth for which world it belongs to. isNativeId() below is a
// convenience for callers that only have an id string in hand (most of
// them) — every id this file generates is prefixed "native-", which
// Jobber's own opaque base64 ids can never collide with, so branching on
// the prefix and branching on the `source` column agree by construction.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  occurrencesInWindow,
  type RecurrenceFrequency,
} from "@/lib/nativeRecurrence";

export type { RecurrenceFrequency } from "@/lib/nativeRecurrence";

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const NATIVE_ID_PREFIX = "native-";

export function isNativeId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(NATIVE_ID_PREFIX);
}

function generateNativeId(): string {
  return `${NATIVE_ID_PREFIX}${crypto.randomUUID()}`;
}

// Same fixed-offset assumption made throughout this app (schedule/
// actions.ts's toUtcIso, lib/jobberVisit.ts's BUSINESS_TIMEZONE) — Phoenix
// doesn't observe DST, so "-07:00" is always correct, not just usually.
const BUSINESS_UTC_OFFSET = "-07:00";

// A native job/visit created without a specific time needs SOME time to
// land on the calendar at — Jobber-created jobs get whatever a crew
// schedules them at manually; this app's own /jobs/new form only collects
// a date, not a time (see NewJobForm.tsx), so a native job needs a
// sensible default. 8:00 AM matches a typical first-stop-of-the-day
// arrival time for this business; staff can reschedule to a specific time
// afterward exactly like they would any other visit.
const DEFAULT_VISIT_START_TIME = "08:00";
const DEFAULT_VISIT_DURATION_MINUTES = 60;

// How many days of future visits a recurring native job should always
// have generated and sitting on the schedule. Stage 3's cron
// (app/api/jobs/generate-recurring-visits) walks every active native
// recurring job and tops it up to this horizon; createNativeJob below
// does the same for the initial batch at creation time, so a brand-new
// recurring job doesn't have to wait for the next cron tick to show more
// than its first visit.
export const RECURRING_WINDOW_DAYS = 90;

function toUtcRange(date: string): { startAt: string; endAt: string } {
  const start = new Date(
    `${date}T${DEFAULT_VISIT_START_TIME}:00${BUSINESS_UTC_OFFSET}`
  );
  const end = new Date(start.getTime() + DEFAULT_VISIT_DURATION_MINUTES * 60000);

  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

type VisitInsertRow = {
  jobber_visit_id: string;
  jobber_job_id: string;
  jobber_client_id: string;
  jobber_invoice_id: null;
  customer_name: string | null;
  job_number: string;
  job_status: string;
  title: string;
  visit_status: string;
  start_at: string;
  end_at: string;
  completed_at: null;
  duration_minutes: number;
  is_last_scheduled_visit: boolean;
  source: "native";
  updated_at: string;
};

function buildVisitRow(params: {
  jobId: string;
  jobberClientId: string;
  customerName: string | null;
  jobNumber: string;
  title: string;
  date: string;
  isLast: boolean;
}): VisitInsertRow {
  const { startAt, endAt } = toUtcRange(params.date);

  return {
    jobber_visit_id: generateNativeId(),
    jobber_job_id: params.jobId,
    jobber_client_id: params.jobberClientId,
    jobber_invoice_id: null,
    customer_name: params.customerName,
    job_number: params.jobNumber,
    job_status: "upcoming",
    title: params.title,
    visit_status: "UPCOMING",
    start_at: startAt,
    end_at: endAt,
    completed_at: null,
    duration_minutes: DEFAULT_VISIT_DURATION_MINUTES,
    is_last_scheduled_visit: params.isLast,
    source: "native",
    updated_at: new Date().toISOString(),
  };
}

// Wraps the next_native_job_number() Postgres function (migration 054) —
// same atomic-counter pattern as lib/invoices.ts's generateInvoiceNumber(),
// just not year-scoped. "N-" prefix keeps these visually distinct from
// Jobber's own plain-integer job numbers at a glance.
async function generateNativeJobNumber(): Promise<MutationOutcome<string>> {
  const { data, error } = await supabaseServer.rpc("next_native_job_number");

  if (error) {
    return { ok: false, error: error.message };
  }

  if (typeof data !== "string" || !data) {
    return { ok: false, error: "Could not generate a job number." };
  }

  return { ok: true, value: data };
}

export type CreateNativeJobParams = {
  jobberClientId: string;
  customerName: string | null;
  title: string;
  instructions?: string | null;
  price?: number | null;
  startDate?: string | null; // YYYY-MM-DD, Phoenix-local
  recurrence?: RecurrenceFrequency | null;
};

// Creates a job (and its first batch of visits) directly in this app's
// own tables — no Jobber round-trip, no waiting on the next sync/webhook
// for the job to become visible. Mirrors createJobberJob's shape (see
// lib/jobberJob.ts) closely enough that app/(platform)/jobs/actions.ts
// barely has to change to call this instead.
export async function createNativeJob(
  params: CreateNativeJobParams
): Promise<MutationOutcome<{ jobId: string; jobNumber: string }>> {
  const {
    jobberClientId,
    customerName,
    title,
    instructions,
    price,
    startDate,
    recurrence,
  } = params;

  const numberResult = await generateNativeJobNumber();

  if (!numberResult.ok) {
    return numberResult;
  }

  const jobId = generateNativeId();
  const jobNumber = numberResult.value;
  const isRecurring = Boolean(startDate && recurrence);

  // Computed before the insert (rather than after) so the initial batch's
  // last date can be saved as recurrence_generated_through in the same
  // insert -- see migration 054's header comment on that column for why
  // this cursor has to be set up front rather than derived later from
  // whatever visit rows happen to exist.
  const dates = startDate
    ? isRecurring
      ? [
          startDate,
          ...occurrencesInWindow(
            startDate,
            recurrence as RecurrenceFrequency,
            startDate,
            addDays(startDate, RECURRING_WINDOW_DAYS)
          ),
        ]
      : [startDate]
    : [];

  const jobRow = {
    jobber_job_id: jobId,
    jobber_client_id: jobberClientId,
    customer_name: customerName,
    title,
    job_number: jobNumber,
    job_status: "upcoming",
    // Matches Jobber's own ONE_OFF/RECURRING convention (see
    // app/(platform)/dashboard/page.tsx and recurring-services/page.tsx,
    // both of which do `.ilike("job_type", "%recur%")` to detect
    // recurring jobs) so those existing queries keep working unchanged
    // for native jobs too.
    job_type: isRecurring ? "RECURRING" : "ONE_OFF",
    jobber_web_uri: null,
    end_at: null,
    completed_at: null,
    total: typeof price === "number" && price > 0 ? price : null,
    source: "native",
    instructions: instructions ?? null,
    recurrence_frequency: isRecurring ? recurrence : null,
    recurrence_anchor_date: isRecurring ? startDate : null,
    recurrence_generated_through:
      isRecurring && dates.length > 0 ? dates[dates.length - 1] : null,
    updated_at: new Date().toISOString(),
  };

  const { error: jobError } = await supabaseServer
    .from("jobber_jobs")
    .insert(jobRow);

  if (jobError) {
    return { ok: false, error: `Couldn't create the job: ${jobError.message}` };
  }

  if (dates.length > 0) {
    const visitRows = dates.map((date, index) =>
      buildVisitRow({
        jobId,
        jobberClientId,
        customerName,
        jobNumber,
        title,
        date,
        isLast: !isRecurring && index === dates.length - 1,
      })
    );

    const { error: visitError } = await supabaseServer
      .from("jobber_visits")
      .insert(visitRows);

    if (visitError) {
      // Best-effort cleanup, same reasoning as lib/invoices.ts's
      // createInvoice() -- a job with no visits and a burned job number
      // is confusing to leave sitting around, and the Supabase JS client
      // has no multi-statement transaction support to fall back on.
      await supabaseServer.from("jobber_jobs").delete().eq("jobber_job_id", jobId);

      return {
        ok: false,
        error: `Job number reserved but visit creation failed: ${visitError.message}`,
      };
    }
  }

  return { ok: true, value: { jobId, jobNumber } };
}

// Tops up every active (not archived, not one-time-already-visited)
// native recurring job so it always has RECURRING_WINDOW_DAYS of future
// visits generated. Called by the Stage 3 cron
// (app/api/jobs/generate-recurring-visits/route.ts) — see that route for
// the actual schedule this runs on.
//
// "Active" deliberately excludes archived jobs (cancelJob sets
// job_status to 'archived', same status Jobber-sourced cancelled jobs
// use — see migration 051's header comment) so a cancelled recurring
// job stops generating new visits the moment it's cancelled, without
// this function needing its own separate "is this job cancelled" check.
export async function generateUpcomingNativeVisits(): Promise<{
  jobsProcessed: number;
  visitsCreated: number;
  errors: string[];
}> {
  const windowEnd = addDays(
    new Date().toISOString().slice(0, 10),
    RECURRING_WINDOW_DAYS
  );

  const { data: jobs, error: jobsError } = await supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, jobber_client_id, customer_name, title, job_number, recurrence_frequency, recurrence_anchor_date, recurrence_generated_through"
    )
    .eq("source", "native")
    .eq("job_status", "upcoming")
    .not("recurrence_frequency", "is", null);

  if (jobsError) {
    return {
      jobsProcessed: 0,
      visitsCreated: 0,
      errors: [`Couldn't load native recurring jobs: ${jobsError.message}`],
    };
  }

  let visitsCreated = 0;
  const errors: string[] = [];

  for (const job of jobs ?? []) {
    if (!job.recurrence_frequency || !job.recurrence_anchor_date) {
      continue;
    }

    // The generator's "afterDate" cursor is recurrence_generated_through
    // (falling back to the anchor date for a job that's never had this
    // function run for it yet), NOT whatever visit rows currently exist.
    // Deliberately not derived from MAX(start_at) of existing visits --
    // skipping a visit deletes its row (see skipJobberVisit's native
    // branch in lib/jobberVisit.ts), so if the furthest-out generated
    // visit happened to be the one staff skipped, deriving the cursor
    // from what's left would make this function think that date was
    // never generated and recreate it right back. See migration 054's
    // header comment on this column for the full reasoning.
    const afterDate = job.recurrence_generated_through ?? job.recurrence_anchor_date;

    const newDates = occurrencesInWindow(
      job.recurrence_anchor_date,
      job.recurrence_frequency as RecurrenceFrequency,
      afterDate,
      windowEnd
    );

    if (newDates.length === 0) {
      continue;
    }

    const visitRows = newDates.map((date) =>
      buildVisitRow({
        jobId: job.jobber_job_id,
        jobberClientId: job.jobber_client_id,
        customerName: job.customer_name,
        jobNumber: job.job_number ?? "",
        title: job.title ?? "Service",
        date,
        isLast: false,
      })
    );

    const { error: insertError } = await supabaseServer
      .from("jobber_visits")
      .insert(visitRows);

    if (insertError) {
      errors.push(`${job.jobber_job_id}: ${insertError.message}`);
      continue;
    }

    visitsCreated += visitRows.length;

    // Advance the cursor to the last date actually generated this run —
    // deliberately after the insert succeeds, not before, so a failed
    // insert (caught above) doesn't advance the cursor past visits that
    // don't actually exist.
    await supabaseServer
      .from("jobber_jobs")
      .update({ recurrence_generated_through: newDates[newDates.length - 1] })
      .eq("jobber_job_id", job.jobber_job_id);
  }

  return { jobsProcessed: (jobs ?? []).length, visitsCreated, errors };
}

// ---------------------------------------------------------------------
// Management: edit / price / cancel / reopen, and the visit-level
// reschedule / skip / complete equivalents. lib/jobberJob.ts and
// lib/jobberVisit.ts call into these when they see a native id, so every
// existing call site (Manage Job UI, VisitDetailModal, schedule
// drag-and-drop, My Day) keeps working completely unchanged.
// ---------------------------------------------------------------------

export type NativeJobDetails = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  instructions: string | null;
  jobStatus: string | null;
  lineItems: { id: string; name: string | null; unitPrice: number | null }[];
};

export async function fetchNativeJobDetails(
  jobId: string
): Promise<NativeJobDetails | null> {
  const { data, error } = await supabaseServer
    .from("jobber_jobs")
    .select("jobber_job_id, job_number, title, instructions, job_status, total")
    .eq("jobber_job_id", jobId)
    .eq("source", "native")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.jobber_job_id,
    jobNumber: data.job_number,
    title: data.title,
    instructions: data.instructions,
    jobStatus: data.job_status,
    // Synthesizes the single-line-item shape fetchJobDetails() returns
    // for Jobber jobs (see lib/jobberJob.ts) -- native jobs don't have a
    // real line-items concept, just the one `total` column, but
    // ManageJobForm.tsx only ever reads lineItems[0].unitPrice, so this
    // is enough for that form to keep working unmodified.
    lineItems:
      data.total != null
        ? [{ id: `${data.jobber_job_id}-price`, name: data.title, unitPrice: Number(data.total) }]
        : [],
  };
}

export async function editNativeJob(params: {
  jobId: string;
  title?: string | null;
  instructions?: string | null;
  startDate?: string | null;
  recurrence?: RecurrenceFrequency | null;
  updateSchedule?: boolean;
}): Promise<MutationOutcome<{ jobId: string }>> {
  const { jobId, title, instructions, startDate, recurrence, updateSchedule } =
    params;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (title) {
    updates.title = title;
  }

  if (instructions !== undefined) {
    updates.instructions = instructions ?? "";
  }

  // Computed up front (same reasoning as createNativeJob above) so the
  // new batch's last date can be saved as recurrence_generated_through in
  // the same update as everything else, rather than in a second write.
  const newSchedule = updateSchedule && startDate;
  const isRecurring = newSchedule ? Boolean(recurrence) : false;
  const newDates = newSchedule
    ? isRecurring
      ? [
          startDate as string,
          ...occurrencesInWindow(
            startDate as string,
            recurrence as RecurrenceFrequency,
            startDate as string,
            addDays(startDate as string, RECURRING_WINDOW_DAYS)
          ),
        ]
      : [startDate as string]
    : [];

  if (newSchedule) {
    updates.recurrence_frequency = isRecurring ? recurrence : null;
    updates.recurrence_anchor_date = isRecurring ? startDate : null;
    updates.recurrence_generated_through =
      isRecurring && newDates.length > 0 ? newDates[newDates.length - 1] : null;
    updates.job_type = isRecurring ? "RECURRING" : "ONE_OFF";
  }

  if (Object.keys(updates).length === 1) {
    // Only updated_at got set -- nothing the caller actually asked to
    // change, same "nothing to update" guard editJobberJob has.
    return { ok: false, error: "Nothing to update." };
  }

  const { error } = await supabaseServer
    .from("jobber_jobs")
    .update(updates)
    .eq("jobber_job_id", jobId)
    .eq("source", "native");

  if (error) {
    return { ok: false, error: error.message };
  }

  // A schedule change on a recurring job means the old future visits
  // (generated against the old cadence/anchor) are stale. Same
  // conceptual tradeoff Jobber's own jobEdit makes (this app has no
  // reliable way to know which not-yet-happened visits are "the same
  // occurrence, just moved" vs "should no longer exist"), so this clears
  // every not-yet-happened native visit for the job and lets the
  // generator (or the initial-batch logic below) repopulate from the new
  // schedule on its next run.
  if (newSchedule) {
    const nowIso = new Date().toISOString();

    await supabaseServer
      .from("jobber_visits")
      .delete()
      .eq("jobber_job_id", jobId)
      .eq("source", "native")
      .is("completed_at", null)
      .gt("start_at", nowIso);

    const { data: jobRow } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_client_id, customer_name, title, job_number")
      .eq("jobber_job_id", jobId)
      .maybeSingle();

    if (jobRow) {
      const visitRows = newDates.map((date, index) =>
        buildVisitRow({
          jobId,
          jobberClientId: jobRow.jobber_client_id,
          customerName: jobRow.customer_name,
          jobNumber: jobRow.job_number ?? "",
          title: jobRow.title ?? title ?? "Service",
          date,
          isLast: !isRecurring && index === newDates.length - 1,
        })
      );

      await supabaseServer.from("jobber_visits").insert(visitRows);
    }
  }

  return { ok: true, value: { jobId } };
}

export async function setNativeJobPrice(
  jobId: string,
  price: number
): Promise<MutationOutcome<null>> {
  const { error } = await supabaseServer
    .from("jobber_jobs")
    .update({ total: price, updated_at: new Date().toISOString() })
    .eq("jobber_job_id", jobId)
    .eq("source", "native");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, value: null };
}

// Same semantics as cancelJobberJob (lib/jobberJob.ts):
// COMPLETE_PAST_DESTROY_FUTURE -- past/completed visits stay exactly as
// they are, every not-yet-happened visit is removed, and the job itself
// stops generating new ones (job_status: 'archived' is the same status
// this app already filters out of schedule/my-day/crew-status for
// Jobber-cancelled jobs -- see migration 051 -- so reusing it here means
// zero changes needed to any of those filters for native jobs to be
// treated identically).
export async function cancelNativeJob(
  jobId: string
): Promise<MutationOutcome<null>> {
  const nowIso = new Date().toISOString();

  const { error: jobError } = await supabaseServer
    .from("jobber_jobs")
    .update({ job_status: "archived", updated_at: nowIso })
    .eq("jobber_job_id", jobId)
    .eq("source", "native");

  if (jobError) {
    return { ok: false, error: jobError.message };
  }

  const { error: visitError } = await supabaseServer
    .from("jobber_visits")
    .delete()
    .eq("jobber_job_id", jobId)
    .eq("source", "native")
    .is("completed_at", null)
    .gt("start_at", nowIso);

  if (visitError) {
    return { ok: false, error: visitError.message };
  }

  return { ok: true, value: null };
}

// Reopening alone does not regenerate a recurring schedule -- same
// documented limitation as reopenJobberJob, for the same reason: the
// future visits cancelNativeJob deleted are gone for good, so a real
// recurring plan needs editNativeJob (the "Update recurring schedule"
// toggle in ManageJobForm.tsx) afterward to set a fresh one. Flipping
// job_status back to 'upcoming' alone is enough to make the job visible
// again everywhere it was filtered out from.
export async function reopenNativeJob(
  jobId: string
): Promise<MutationOutcome<null>> {
  const { error } = await supabaseServer
    .from("jobber_jobs")
    .update({ job_status: "upcoming", updated_at: new Date().toISOString() })
    .eq("jobber_job_id", jobId)
    .eq("source", "native");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, value: null };
}

// Visit-level reschedule/skip/complete deliberately do NOT touch
// jobber_visits themselves -- unlike the job-level functions above, the
// calling action files (schedule/actions.ts's rescheduleVisit/skipVisit,
// my-day/actions.ts's completeVisit) already write the local mirror
// themselves after their Jobber-mutation call succeeds (that's true for
// EVERY visit, Jobber-sourced or native -- see those files' own header
// comments). So the native branch inside lib/jobberVisit.ts's exported
// functions just needs to skip the Jobber API call and report success --
// the existing local write in the action file does the rest, unchanged.
// No native-specific visit functions are needed here for that reason.
