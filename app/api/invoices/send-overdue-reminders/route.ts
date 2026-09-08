// Overdue invoice payment reminders -- daily cron entry point. See
// lib/invoiceReminders.ts's header comment for the actual logic; this
// route just wraps it with the same run-tracking shape every other cron
// route in this app uses (app/api/visits/send-reminders/route.ts, etc.).
import { NextResponse } from "next/server";
import { sendDueInvoiceReminders } from "@/lib/invoiceReminders";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";

const SYNC_TYPE = "invoice-overdue-reminders";

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Overdue invoice reminder send is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await sendDueInvoiceReminders();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: result.invoicesConsidered,
      recordsSaved: result.remindersSent,
      pagesProcessed: result.rulesProcessed,
      throttleRetries: 0,
      metadata: { errors: result.errors },
    });

    return NextResponse.json({
      success: true,
      message: "Overdue invoice reminders sent successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Overdue invoice reminder send failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred sending overdue invoice reminders.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
