// Tier 3 (Jobber Independence Roadmap) — review request send. Wired
// (runs daily on schedule) but inactive by default: lib/reviewRequests.ts's
// sendDueReviewRequests() is a no-op until Ryan sets
// review_request_settings.enabled = true and fills in a
// google_review_url from Settings. Same run-tracking shape as every
// other cron route in this app.
import { NextResponse } from "next/server";
import { sendDueReviewRequests } from "@/lib/reviewRequests";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "review-requests";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Review request send is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await sendDueReviewRequests();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: result.visitsConsidered,
      recordsSaved: result.requestsSent,
      pagesProcessed: result.enabled ? 1 : 0,
      throttleRetries: 0,
      metadata: { errors: result.errors, enabled: result.enabled },
    });

    return NextResponse.json({
      success: true,
      message: result.enabled
        ? "Review requests sent successfully."
        : "Review requests are not enabled — nothing sent.",
      ...result,
    });
  } catch (error) {
    console.error("Review request send failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred sending review requests.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
