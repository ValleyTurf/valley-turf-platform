// Ryan (2026-09-27): "Why are all of Ludeman's visits going forward
// labled as Maintenance - Monthly. Should be Full - Monthly for Jan,
// Apr, July, Oct."
//
// Hypothesis, based on how native recurring jobs actually generate
// visits (lib/nativeJobs.ts): a visit's title is snapshotted from the
// JOB's single `title` column at generation time (buildVisitRow), and
// editNativeJob's title-sync block re-applies that same one title to
// every not-yet-completed visit whenever the job title is edited --
// there's no existing mechanism for a recurring job to alternate its
// visit title by month (the same architectural gap migration
// 085_add_visit_price_override.sql solved for PRICE on Durkin/
// Mariscal, just for the title/label instead). If that's right,
// Ludeman's job simply has one title ("... Maintenance - Monthly")
// and every generated visit inherited it -- there was never a
// mechanism to make the Jan/Apr/Jul/Oct occurrences say "Full -
// Monthly" instead.
//
// This pulls Ludeman's job row(s) and every visit (past + future) so
// that's confirmed against real data before proposing a fix.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const name = request.nextUrl.searchParams.get("name") ?? "Ludeman";

  const { data: visits, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, title, start_at, job_status, completed_at, price_override, source"
    )
    .ilike("customer_name", `%${name}%`)
    .order("start_at", { ascending: true });

  if (visitsError) {
    return NextResponse.json({ error: visitsError.message, step: "jobber_visits" }, { status: 500 });
  }

  const jobIds = Array.from(
    new Set((visits ?? []).map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id)))
  );

  const { data: jobs, error: jobsError } = jobIds.length
    ? await supabaseServer
        .from("jobber_jobs")
        .select(
          "jobber_job_id, jobber_client_id, title, total, source, job_type, job_status, recurrence_frequency, recurrence_anchor_date, recurrence_generated_through, updated_at"
        )
        .in("jobber_job_id", jobIds)
    : { data: [], error: null };

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message, step: "jobber_jobs" }, { status: 500 });
  }

  // 2026-09-27: added after finding that flip-all-full-months reported
  // 0 retitles needed for Mariscal even though several of her visits
  // (Oct/Nov 2026, May 2029, the final 2031-06-27 occurrence) still show
  // the job's flat "Monthly Maintenance Plan" title -- that route
  // matches visits to a customer purely by jobber_visits.jobber_client_id,
  // so a visit whose jobber_client_id is null or wrong would be silently
  // excluded from its scan without ever showing up as "skipped". Cross-
  // checking each visit's own jobber_client_id against its job's here to
  // confirm or rule that out before guessing further.
  const clientIdMismatches = (visits ?? [])
    .map((v) => {
      const job = (jobs ?? []).find((j) => j.jobber_job_id === v.jobber_job_id);
      return {
        jobber_visit_id: v.jobber_visit_id,
        title: v.title,
        start_at: v.start_at,
        visit_jobber_client_id: v.jobber_client_id,
        job_jobber_client_id: job?.jobber_client_id ?? null,
        matches: Boolean(job) && job?.jobber_client_id === v.jobber_client_id,
      };
    })
    .filter((row) => !row.matches);

  const { data: categories, error: categoriesError } = jobIds.length
    ? await supabaseServer
        .from("job_service_category")
        .select("jobber_job_id, service_category, job_type, is_recurring_service")
        .in("jobber_job_id", jobIds)
    : { data: [], error: null };

  if (categoriesError) {
    return NextResponse.json({ error: categoriesError.message, step: "job_service_category" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    searchedFor: name,
    jobs,
    jobServiceCategoryRows: categories,
    clientIdMismatches,
    visits,
  });
}
