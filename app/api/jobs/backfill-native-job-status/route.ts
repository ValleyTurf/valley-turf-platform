// Superseded (2026-10-08) -- do not use. This backfill wrote
// job_status: "completed" on a one-off native job, but no Open Jobs
// filter anywhere in the app (jobs/page.tsx, customers/[id]/page.tsx,
// dashboard/page.tsx, schedule/page.tsx, my-day/page.tsx,
// crew-status/page.tsx, recurring-services/page.tsx) ever excluded that
// value -- only "archived" was ever excluded. So this never actually
// closed a job out of any Open Jobs list, which is exactly why Ryan was
// still seeing finished one-off jobs sitting open months after this
// route was written (2026-10-08: "When I complete a job such as Clark
// Stokes today, if it is a one time job, can the job close out rather
// than staying as an open job?").
//
// Replaced by app/api/jobs/backfill-close-completed-one-off/route.ts
// (and lib/nativeJobs.ts's closeOneOffJobIfComplete, wired into
// completeVisit in my-day/actions.ts), which reuse job_status =
// "archived" instead -- the one value every one of those filters
// already excludes, confirmed with Ryan before building it.
//
// Left in place as an inert stub rather than deleted outright (this
// session's device-bridge shell can't delete files in a connected
// folder without a separate permission prompt) -- it was never linked
// from any UI, so nothing breaks by it just explaining itself and
// refusing to run.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Superseded -- use /api/jobs/backfill-close-completed-one-off instead. See this file's header comment for why.",
    },
    { status: 410 }
  );
}
