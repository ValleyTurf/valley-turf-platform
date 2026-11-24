// Hourly watchdog for the other scheduled jobs (lib/cronWatch.ts). Records
// its own run like every other job so System Health can show it is alive.
import { NextResponse } from "next/server";
import { runWatchdog } from "@/lib/cronWatch";
import {
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "job-watchdog";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    syncRunId = await startSyncRun(SYNC_TYPE);

    const summary = await runWatchdog();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: summary.checked,
      recordsSaved: summary.opened + summary.resolved,
      pagesProcessed: 1,
      throttleRetries: 0,
      metadata: { ...summary },
    });

    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Scheduled job check failed:", error);
    const message = error instanceof Error ? error.message : "Scheduled job check failed.";
    if (syncRunId) await failSyncRun(SYNC_TYPE, syncRunId, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
