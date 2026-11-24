// Sends queued "save a card" migration invites (the "Send at 9am" button on
// /invoices/migration). Runs daily at 9:05am Phoenix; see
// lib/nativeMigrationSchedule.ts. Records each run like the other cron jobs
// so the scheduled-job watchdog (lib/cronWatch.ts) can tell it ran.
import { NextResponse } from "next/server";
import { processDueBatches } from "@/lib/nativeMigrationSchedule";
import {
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "migration-invites";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    syncRunId = await startSyncRun(SYNC_TYPE);

    const summary = await processDueBatches();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: summary.invitesSent + summary.invitesSkipped + summary.invitesFailed,
      recordsSaved: summary.invitesSent,
      pagesProcessed: summary.batchesSent,
      throttleRetries: 0,
      metadata: { ...summary },
    });

    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Scheduled migration invites failed:", error);
    const message =
      error instanceof Error ? error.message : "Scheduled migration invites failed.";
    if (syncRunId) await failSyncRun(SYNC_TYPE, syncRunId, message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
