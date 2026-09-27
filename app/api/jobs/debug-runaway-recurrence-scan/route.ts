// Found while investigating Ludeman's visit-title question (Ryan,
// 2026-09-27): Ludeman's recurring job has recurrence_anchor_date AND
// recurrence_generated_through both sitting at "2030-10-17", with 49
// already-generated monthly visit rows stretching that far out --
// four years beyond RECURRING_WINDOW_DAYS (90 days), the window
// lib/nativeJobs.ts's generator is supposed to keep jobs topped up to.
//
// This checks whether that's isolated to Ludeman's job or a wider
// pattern: every native recurring job whose recurrence_generated_through
// (or anchor_date, if generated_through is null) is more than 1 year
// past today.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: jobs, error } = await supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, customer_name, title, source, job_type, job_status, recurrence_frequency, recurrence_anchor_date, recurrence_generated_through, updated_at"
    )
    .eq("source", "native")
    .not("recurrence_frequency", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message, step: "jobber_jobs" }, { status: 500 });
  }

  const flagged = (jobs ?? []).filter((job) => {
    const cursor = job.recurrence_generated_through ?? job.recurrence_anchor_date;
    return typeof cursor === "string" && cursor > oneYearFromNow;
  });

  // For each flagged job, count how many future visit rows actually
  // exist and how far out the furthest one is -- confirms whether the
  // runaway cursor also means runaway visit rows, or just a stale
  // cursor with normal visit counts.
  const details = await Promise.all(
    flagged.map(async (job) => {
      const { count } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id", { count: "exact", head: true })
        .eq("jobber_job_id", job.jobber_job_id)
        .is("completed_at", null);

      const { data: furthest } = await supabaseServer
        .from("jobber_visits")
        .select("start_at")
        .eq("jobber_job_id", job.jobber_job_id)
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...job,
        upcomingVisitCount: count ?? 0,
        furthestVisitStartAt: furthest?.start_at ?? null,
      };
    })
  );

  return NextResponse.json({
    success: true,
    totalNativeRecurringJobsScanned: (jobs ?? []).length,
    thresholdDate: oneYearFromNow,
    flaggedJobs: details,
  });
}
