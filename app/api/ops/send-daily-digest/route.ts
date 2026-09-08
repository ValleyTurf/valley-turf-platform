// Daily ops digest -- cron entry point. See lib/dailyDigest.ts's header
// comment for the actual logic; this route just wraps it with the same
// run-tracking shape every other cron route in this app uses (e.g.
// app/api/invoices/send-overdue-reminders/route.ts).
import { NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/dailyDigest";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "daily-digest";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Daily digest send is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await sendDailyDigest();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: 1,
      recordsSaved: result.sent ? result.recipients : 0,
      pagesProcessed: 1,
      throttleRetries: 0,
      metadata: result.sent ? {} : { reason: result.reason },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Daily digest send failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred sending the daily digest.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
