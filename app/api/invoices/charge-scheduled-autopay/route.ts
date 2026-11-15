// Scheduled autopay charges -- daily cron entry point (migration 105).
// See lib/autopaySchedule.ts's header comment for the actual logic;
// this route just wraps it with the same run-tracking shape every other
// cron route in this app uses. Runs before the overdue-reminder cron on
// purpose, so an invoice charged this morning is already off that
// cron's list.
import { NextResponse } from "next/server";
import { chargeDueScheduledInvoices } from "@/lib/autopaySchedule";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNC_TYPE = "autopay-scheduled-charges";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    // Matters more here than for most crons: this one moves money, so
    // two overlapping runs must not both walk the same invoice list.
    // (Stripe's idempotency key in lib/autopay.ts is the second guard.)
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Scheduled autopay charging is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await chargeDueScheduledInvoices();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: result.invoicesConsidered,
      recordsSaved: result.charged,
      pagesProcessed: result.customersOnASchedule,
      throttleRetries: 0,
      metadata: { failed: result.failed, errors: result.errors },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Scheduled autopay charging failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred charging scheduled autopay invoices.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
