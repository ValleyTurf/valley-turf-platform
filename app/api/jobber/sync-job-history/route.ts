// Jobber Independence Roadmap (2026-09) -- permanently disabled (one of
// 5 satellite syncs disabled together in this pass, Ryan's call). This
// route used to compute first_job_at/last_job_at/total_jobs/
// total_completed_jobs onto `customers` purely from Jobber's own job
// list -- the highest-risk of the five satellite syncs to leave running,
// since it would have rolled a migrated customer's job history stats
// back to whatever Jobber still shows instead of this app's own
// (now-authoritative) job records. See sync-customers/route.ts's header
// comment for the fuller cutover context (roadmap #9).
//
// Not on any cron schedule or CRON_PATHS entry (this was always
// manual-trigger-only), so there's no config cleanup needed beyond this
// file.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      disabled: true,
      message:
        "This sync was permanently disabled as part of the Jobber Independence cutover (2026-09) -- job history is now derived from this app's own natively-owned job records. See this file's header comment.",
    },
    { status: 410 }
  );
}
