// Quote follow-up nudges -- daily cron entry point. See
// lib/quoteFollowups.ts's header comment for the actual logic; this
// route just wraps it with the same run-tracking shape every other cron
// route in this app uses.
import { NextResponse } from "next/server";
import { sendDueQuoteFollowups } from "@/lib/quoteFollowups";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "quote-followups";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Quote follow-up send is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await sendDueQuoteFollowups();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: result.quotesConsidered,
      recordsSaved: result.followupsSent,
      pagesProcessed: result.rulesProcessed,
      throttleRetries: 0,
      metadata: { errors: result.errors },
    });

    return NextResponse.json({
      success: true,
      message: "Quote follow-ups sent successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Quote follow-up send failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred sending quote follow-ups.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
