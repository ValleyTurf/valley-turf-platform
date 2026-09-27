// Ryan (2026-09-27): "On the recurring services tab, there are at
// least 2 people that have canceled service but are still showing as
// recurring. Brittany Pratz and Steven Hensley. Is this up to date?"
//
// recurring-services/page.tsx pulls jobber_visits for any job in
// job_service_category with job_type ILIKE '%recur%', filtered only by
// date range -- it has NO job_status filter at all. Every other page
// that reads jobber_visits for "what's actually happening" (schedule,
// my-day, crew-status, customers/[id], and now dashboard) excludes
// archived jobs; this page never picked up that convention. Two
// distinct things could explain what Ryan's seeing:
//  1. The job WAS archived/cancelled in Jobber (job_status reflects
//     it), but this page shows it anyway because it never filters on
//     job_status -- a real gap in this page specifically.
//  2. The job was never marked archived/cancelled locally at all --
//     meaning the cancellation in Jobber hasn't synced here yet, a
//     staleness/sync problem rather than a missing filter.
//
// This looks up every jobber_visits + jobber_jobs row for these two
// customer names so which of the two it is is visible instead of
// guessed at.
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

  const namesParam = request.nextUrl.searchParams.get("names");
  const names = namesParam
    ? namesParam.split(",").map((n) => n.trim())
    : ["Pratz", "Hensley"];

  const results: Record<string, unknown> = {};

  for (const name of names) {
    const { data: visits, error: visitsError } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, title, start_at, job_status, completed_at, jobber_invoice_id"
      )
      .ilike("customer_name", `%${name}%`)
      .order("start_at", { ascending: true });

    if (visitsError) {
      results[name] = { error: visitsError.message, step: "jobber_visits" };
      continue;
    }

    const jobIds = Array.from(
      new Set((visits ?? []).map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id)))
    );

    const { data: jobs, error: jobsError } = jobIds.length
      ? await supabaseServer
          .from("jobber_jobs")
          .select("jobber_job_id, title, total, source, updated_at")
          .in("jobber_job_id", jobIds)
      : { data: [], error: null };

    if (jobsError) {
      results[name] = { error: jobsError.message, step: "jobber_jobs" };
      continue;
    }

    const { data: categories, error: categoriesError } = jobIds.length
      ? await supabaseServer
          .from("job_service_category")
          .select("jobber_job_id, service_category, job_type, is_recurring_service")
          .in("jobber_job_id", jobIds)
      : { data: [], error: null };

    if (categoriesError) {
      results[name] = { error: categoriesError.message, step: "job_service_category" };
      continue;
    }

    results[name] = {
      visits,
      jobs,
      jobServiceCategoryRows: categories,
    };
  }

  return NextResponse.json({ success: true, searchedFor: names, results });
}
