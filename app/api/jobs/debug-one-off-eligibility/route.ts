// Temporary diagnostic (2026-10-08) -- NOT meant to stay long-term, same
// spirit as app/api/jobber/debug-quote-schema/route.ts. Ryan flagged two
// false positives in the one-off-job auto-close dry run
// (/api/jobs/backfill-close-completed-one-off): Gavin Anderson's job
// (#1293, zero visits ever scheduled) and Alexis Lytle's job (#1295, a
// real future visit that should have kept it open, and possibly a
// recurring job mis-stored as job_type='ONE_OFF'). Both known bugs in
// checkOneOffJobCloseEligibility (lib/nativeJobs.ts) are now fixed, but
// rather than guess whether Lytle's job_type is genuinely wrong in the
// database, this route surfaces the actual stored row plus every visit
// under it, so that can be confirmed from real data instead of assumed.
//
// Admin-gated, read-only -- never writes anything.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { checkOneOffJobCloseEligibility } from "@/lib/nativeJobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const jobNumber = url.searchParams.get("jobNumber");

  if (!jobId && !jobNumber) {
    return NextResponse.json(
      { error: "Pass ?jobId=<jobber_job_id> or ?jobNumber=<job_number>." },
      { status: 400 }
    );
  }

  let query = supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, job_number, customer_name, job_type, job_status, source, recurrence_frequency, recurrence_anchor_date, recurrence_generated_through, recurrence_cancelled_at, created_at, updated_at"
    );

  query = jobId ? query.eq("jobber_job_id", jobId) : query.eq("job_number", jobNumber);

  const { data: job, error: jobError } = await query.maybeSingle();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "No job found matching that id/number." }, { status: 404 });
  }

  const { data: visits, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, source, start_at, end_at, completed_at, visit_status, job_status")
    .eq("jobber_job_id", job.jobber_job_id)
    .order("start_at", { ascending: true });

  if (visitsError) {
    return NextResponse.json({ error: visitsError.message }, { status: 500 });
  }

  const eligibility = await checkOneOffJobCloseEligibility(job.jobber_job_id);

  return NextResponse.json({
    job,
    visits: visits ?? [],
    visitSourceBreakdown: (visits ?? []).reduce<Record<string, number>>((acc, v) => {
      const key = v.source ?? "(null)";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    eligibility,
  });
}
