// One-time backfill (2026-10-08). Ryan: "When I complete a job such as
// Clark Stokes today, if it is a one time job, can the job close out
// rather than staying as an open job? If it is recurring of course I
// would want it to stay open." completeVisit (my-day/actions.ts) now
// closes a native one-off job automatically going forward (see
// lib/nativeJobs.ts's closeOneOffJobIfComplete header comment for the
// full reasoning) -- this is the one-time sweep Ryan also asked for, to
// close out every native one-off job that already finished before that
// fix existed and is still sitting in every Open Jobs list today.
//
// Scans every native, one-off, not-yet-archived job and runs the exact
// same eligibility check closeOneOffJobIfComplete uses in real time
// (checkOneOffJobCloseEligibility), so this can never close a job the
// real-time path wouldn't also have closed. Dry-run by default
// (?apply=true to write), admin-gated, processes up to `limit` rows per
// run (default 200, max 1000, ?limit= to override) -- rerun after an
// apply to pick up any rows still remaining.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import {
  checkOneOffJobCloseEligibility,
  closeOneOffJobIfComplete,
} from "@/lib/nativeJobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type JobRow = {
  jobber_job_id: string;
  job_number: string | null;
  customer_name: string | null;
  job_status: string | null;
};

type ResultStatus = "closed" | "would_close" | "skipped" | "error";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "true";
  const limit = Math.min(
    1000,
    Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200)
  );

  const { data: rows, error: selectError } = await supabaseServer
    .from("jobber_jobs")
    .select("jobber_job_id, job_number, customer_name, job_status")
    .eq("source", "native")
    .eq("job_type", "ONE_OFF")
    .neq("job_status", "archived")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const candidates = (rows ?? []) as JobRow[];

  const results: {
    jobberJobId: string;
    jobNumber: string | null;
    customerName: string | null;
    status: ResultStatus;
    reason?: string;
    error?: string;
  }[] = [];

  for (const job of candidates) {
    try {
      if (apply) {
        const closeResult = await closeOneOffJobIfComplete(job.jobber_job_id);

        if (!closeResult.ok) {
          results.push({
            jobberJobId: job.jobber_job_id,
            jobNumber: job.job_number,
            customerName: job.customer_name,
            status: "error",
            error: closeResult.error,
          });
          continue;
        }

        results.push({
          jobberJobId: job.jobber_job_id,
          jobNumber: job.job_number,
          customerName: job.customer_name,
          status: closeResult.value.closed ? "closed" : "skipped",
          reason: closeResult.value.reason,
        });
      } else {
        const eligibility = await checkOneOffJobCloseEligibility(job.jobber_job_id);

        results.push({
          jobberJobId: job.jobber_job_id,
          jobNumber: job.job_number,
          customerName: job.customer_name,
          status: eligibility.eligible ? "would_close" : "skipped",
          reason: eligibility.eligible ? undefined : eligibility.reason,
        });
      }
    } catch (error) {
      results.push({
        jobberJobId: job.jobber_job_id,
        jobNumber: job.job_number,
        customerName: job.customer_name,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    success: true,
    apply,
    scanned: candidates.length,
    closed: results.filter((r) => r.status === "closed").length,
    wouldClose: results.filter((r) => r.status === "would_close").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}
