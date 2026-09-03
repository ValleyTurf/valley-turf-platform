// Tier 2 Stage 3 (Jobber Independence Roadmap) — keeps every active
// native recurring job topped up with RECURRING_WINDOW_DAYS of future
// visits. This is this app's own replacement for the recurring-visit
// generation Jobber used to do automatically the moment a job's
// scheduling.recurrence was set — see lib/nativeJobs.ts's
// generateUpcomingNativeVisits() for the actual generation logic, and
// migration 054's header comment for why native jobs live in the same
// jobber_jobs/jobber_visits tables as everything else instead of a
// parallel schema.
//
// Reuses lib/jobberSyncTracking.ts's run-tracking helpers even though
// this isn't a Jobber sync at all — same "don't let two runs overlap,
// record start/complete/fail" shape as every sync-*.ts route, and the
// existing /health dashboard already knows how to render any sync_type
// row, so this shows up there for free.
import { NextResponse } from "next/server";
import { generateUpcomingNativeVisits } from "@/lib/nativeJobs";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "native-recurring-visits";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Recurring visit generation is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await generateUpcomingNativeVisits();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: result.jobsProcessed,
      recordsSaved: result.visitsCreated,
      pagesProcessed: 1,
      throttleRetries: 0,
      metadata: { errors: result.errors },
    });

    return NextResponse.json({
      success: true,
      message: "Native recurring visits generated successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Native recurring visit generation failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred generating recurring visits.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
