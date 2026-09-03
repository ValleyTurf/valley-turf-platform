// Tier 3 (Jobber Independence Roadmap) — daily pre-visit reminder send.
// See lib/visitReminders.ts's header comment for the actual logic; this
// route is just the cron entry point, following the exact same
// run-tracking shape as app/api/jobs/generate-recurring-visits/route.ts.
import { NextResponse } from "next/server";
import { sendDueVisitReminders } from "@/lib/visitReminders";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "visit-reminders";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Visit reminder send is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await sendDueVisitReminders();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: result.visitsConsidered,
      recordsSaved: result.remindersSent,
      pagesProcessed: result.rulesProcessed,
      throttleRetries: 0,
      metadata: { errors: result.errors },
    });

    return NextResponse.json({
      success: true,
      message: "Visit reminders sent successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Visit reminder send failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred sending visit reminders.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
