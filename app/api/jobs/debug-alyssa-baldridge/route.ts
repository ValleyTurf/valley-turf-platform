// One-time diagnostic (2026-09-21). Ryan wants Alyssa Baldridge's
// recurring job set up to auto-flip Maintenance to Full on the correct
// months (roadmap item 19), starting with her as the first real case.
// Before building the "which months get Full" mechanism, this pulls her
// actual customer/job/recurrence/upcoming-visit rows so the job(s) to
// change can be identified by id rather than guessed at from the UI.
//
// v2 (same day): the exact "Alyssa"+"Baldridge" match returned zero
// rows, so this now casts a much wider net -- first/last name matched
// independently against "bald" and "alyssa" fragments, so a middle
// name, a typo on either side, or a full_name that isn't simply
// "First Last" still turns up. Also no longer requires BOTH fragments
// to hit, so a misspelled first or last name alone still surfaces a
// candidate to eyeball.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data: customers, error: customerError } = await supabaseServer
    .from("customers")
    .select(
      "jobber_client_id, full_name, first_name, last_name, turf_size_range"
    )
    .or(
      "full_name.ilike.%bald%,full_name.ilike.%alyssa%,first_name.ilike.%alyssa%,last_name.ilike.%bald%"
    );

  if (customerError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read customers: ${customerError.message}` },
      { status: 500 }
    );
  }

  const results = [];

  for (const customer of customers ?? []) {
    const clientId = customer.jobber_client_id;

    const [jobs, upcomingVisits, recentVisits] = await Promise.all([
      supabaseServer
        .from("jobber_jobs")
        .select(
          "jobber_job_id, title, job_status, job_type, source, total, recurrence_frequency, recurrence_anchor_date, recurrence_generated_through, jobber_line_items_snapshot"
        )
        .eq("jobber_client_id", clientId),
      supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_job_id, title, start_at, visit_status, job_status")
        .eq("jobber_client_id", clientId)
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(15),
      supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_job_id, title, start_at, completed_at")
        .eq("jobber_client_id", clientId)
        .lt("start_at", new Date().toISOString())
        .order("start_at", { ascending: false })
        .limit(6),
    ]);

    results.push({
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || customer.full_name,
      jobberClientId: clientId,
      turfSizeRange: customer.turf_size_range,
      jobs: jobs.data,
      jobsError: jobs.error?.message ?? null,
      upcomingVisits: upcomingVisits.data,
      upcomingVisitsError: upcomingVisits.error?.message ?? null,
      recentVisits: recentVisits.data,
      recentVisitsError: recentVisits.error?.message ?? null,
    });
  }

  return NextResponse.json({
    success: true,
    matchCount: (customers ?? []).length,
    results,
  });
}
