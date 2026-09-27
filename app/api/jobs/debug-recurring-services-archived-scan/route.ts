// Ryan (2026-09-27): "Did you check and make sure there are no others
// that this happened to as well?" -- after fixing recurring-services
// page.tsx to exclude archived jobs (Brittany Pratz / Steven Hensley),
// this scans for every OTHER customer in the same situation: a job
// classified recurring (job_type ILIKE '%recur%', same query the page
// uses) whose upcoming visits are ALL job_status = "archived" -- i.e.
// customers who would have shown up as "still recurring" before the
// fix, and who the fix now correctly drops.
//
// Scans a wide forward window (today through +12 months) rather than
// just the page's default range, so nothing near-term is missed.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type JobCategoryRow = { jobber_job_id: string; service_category: string | null };
type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  customer_name: string | null;
  start_at: string | null;
  job_status: string | null;
  completed_at: string | null;
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const now = new Date();
  const rangeStart = now.toISOString();
  const rangeEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const { data: jobsData, error: jobsError } = await supabaseServer
    .from("job_service_category")
    .select("jobber_job_id, service_category")
    .ilike("job_type", "%recur%");

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message, step: "job_service_category" }, { status: 500 });
  }

  const recurringJobIds = ((jobsData ?? []) as JobCategoryRow[]).map((j) => j.jobber_job_id);

  const { data: visitsData, error: visitsError } =
    recurringJobIds.length > 0
      ? await supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, jobber_job_id, customer_name, start_at, job_status, completed_at")
          .in("jobber_job_id", recurringJobIds)
          .gte("start_at", rangeStart)
          .lte("start_at", rangeEnd)
          .order("start_at", { ascending: true })
      : { data: [] as VisitRow[], error: null };

  if (visitsError) {
    return NextResponse.json({ error: visitsError.message, step: "jobber_visits" }, { status: 500 });
  }

  const visits = (visitsData ?? []) as VisitRow[];

  // Group upcoming visits by job id, and by customer name.
  const byJob = new Map<string, VisitRow[]>();
  for (const v of visits) {
    if (!v.jobber_job_id) continue;
    const list = byJob.get(v.jobber_job_id) ?? [];
    list.push(v);
    byJob.set(v.jobber_job_id, list);
  }

  const wouldDisappearEntirely: {
    jobber_job_id: string;
    customer_name: string | null;
    upcomingVisitCount: number;
    allArchived: boolean;
    sampleStartAt: string | null;
  }[] = [];

  const mixedStatus: {
    jobber_job_id: string;
    customer_name: string | null;
    archivedCount: number;
    nonArchivedCount: number;
  }[] = [];

  for (const [jobId, jobVisits] of byJob.entries()) {
    const archived = jobVisits.filter((v) => v.job_status === "archived" && !v.completed_at);
    const nonArchived = jobVisits.filter((v) => !(v.job_status === "archived" && !v.completed_at));

    if (archived.length > 0 && nonArchived.length === 0) {
      wouldDisappearEntirely.push({
        jobber_job_id: jobId,
        customer_name: jobVisits[0]?.customer_name ?? null,
        upcomingVisitCount: jobVisits.length,
        allArchived: true,
        sampleStartAt: jobVisits[0]?.start_at ?? null,
      });
    } else if (archived.length > 0 && nonArchived.length > 0) {
      mixedStatus.push({
        jobber_job_id: jobId,
        customer_name: jobVisits[0]?.customer_name ?? null,
        archivedCount: archived.length,
        nonArchivedCount: nonArchived.length,
      });
    }
  }

  return NextResponse.json({
    success: true,
    scanWindow: { rangeStart, rangeEnd },
    totalRecurringJobsScanned: recurringJobIds.length,
    totalUpcomingVisitsScanned: visits.length,
    jobsThatWouldDisappearEntirely: wouldDisappearEntirely,
    jobsWithMixedStatus: mixedStatus,
  });
}
