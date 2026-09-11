// Jobber Independence Roadmap (2026-09) -- permanently disabled (one of
// 5 satellite syncs disabled together in this pass, Ryan's call). This
// route only ever wrote to its own dedicated tables (jobber_job_notes /
// jobber_job_notes_sync_state), never touching customers/jobber_jobs/
// jobber_visits directly, so it was never destructive -- disabled anyway
// because there's nothing left to pull: with Jobber no longer being
// written to for jobs, no new notes are ever going to show up there to
// backfill. See sync-customers/route.ts's header comment for the fuller
// cutover context (roadmap #9).
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
        "This sync was permanently disabled as part of the Jobber Independence cutover (2026-09) -- Jobber is no longer written to for jobs, so there are no new notes left to pull. See this file's header comment.",
    },
    { status: 410 }
  );
}
