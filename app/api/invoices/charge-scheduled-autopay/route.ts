// Scheduled autopay charges -- daily cron entry point (migration 105).
// Two jobs, each documented in its own file: pay-ahead customers'
// month-ahead invoices (lib/autopayPrepay.ts), then invoices held for N
// days after sending (lib/autopaySchedule.ts). This route just wraps
// them with the same run-tracking shape every other cron route in this
// app uses. Runs before the overdue-reminder cron on
// purpose, so an invoice charged this morning is already off that
// cron's list.
import { NextResponse } from "next/server";
import { chargeDueScheduledInvoices } from "@/lib/autopaySchedule";
import { chargeMonthAheadCustomers } from "@/lib/autopayPrepay";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
// Each month-ahead customer is an invoice, a PDF, a card charge and a
// receipt -- a few seconds apiece, all on the same morning for everyone
// who pays on the 1st. A run that's cut off is finished by the next one
// (see lib/autopayPrepay.ts), but give it room to finish the first time.
export const maxDuration = 300;

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

    const monthAhead = await chargeMonthAheadCustomers();
    const held = await chargeDueScheduledInvoices();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: monthAhead.customersDue + held.invoicesConsidered,
      recordsSaved: monthAhead.charged + held.charged,
      pagesProcessed: monthAhead.invoicesCreated,
      throttleRetries: 0,
      metadata: {
        failed: monthAhead.failed + held.failed,
        errors: [...monthAhead.errors, ...held.errors],
      },
    });

    return NextResponse.json({ success: true, monthAhead, held });
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
