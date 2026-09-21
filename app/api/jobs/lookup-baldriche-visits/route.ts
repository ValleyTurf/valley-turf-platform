// One-time diagnostic (2026-09-22+). Tracking down why the schedule page
// shows "Monthly Maintenance Plan" for Alyssa Baldriche's regular
// maintenance months while her own customer profile's Upcoming Visits
// list shows "Maintenance - Monthly" for the same visits -- both pages
// read jobber_visits.title directly, so this pulls the raw rows (both a
// true past sample and a true upcoming sample, ordered/filtered
// correctly this time -- the earlier Katie Ray lookup ordered all rows
// by start_at descending with no completed_at filter, which surfaced her
// farthest-future rows instead of her actual past ones) plus her
// underlying job(s)' own title/job_type, so the mismatch can be found in
// the real data instead of guessed at.
//
// Read-only, admin-gated, manual-trigger only. Does not write anything.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BALDRICHE_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC85OTcyMjA3Mw==";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  const [pastResult, upcomingResult, jobsResult] = await Promise.all([
    supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, title, start_at, completed_at, source"
      )
      .eq("jobber_client_id", BALDRICHE_CLIENT_ID)
      .not("completed_at", "is", null)
      .order("start_at", { ascending: false })
      .limit(10),
    supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, title, start_at, completed_at, source"
      )
      .eq("jobber_client_id", BALDRICHE_CLIENT_ID)
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(10),
    supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, title, job_type, job_status, source")
      .eq("jobber_client_id", BALDRICHE_CLIENT_ID),
  ]);

  if (pastResult.error || upcomingResult.error || jobsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          pastResult.error?.message ||
          upcomingResult.error?.message ||
          jobsResult.error?.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    jobs: jobsResult.data ?? [],
    pastVisits: pastResult.data ?? [],
    upcomingVisits: upcomingResult.data ?? [],
  });
}
