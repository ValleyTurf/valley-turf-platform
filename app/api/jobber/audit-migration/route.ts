// Manual-trigger only (Jobber Independence Roadmap, #8 — the full
// one-time migration audit). NOT wired into vercel.json or proxy.ts's
// CRON_PATHS on purpose, same as sync-job-notes/backfill-invoicing-mode —
// this is a deliberate one-time tool Ryan runs by hand from a browser
// (or curl), not an ongoing sync.
//
// GET (no query params): read-only. Reports Jobber vs. local counts for
// customers/jobs/visits, lists what's missing locally, flags jobs with
// more than one Jobber line item, and previews which recurring jobs'
// cadence can/can't be confidently inferred from existing visit spacing.
// Nothing is written. Review this first.
//
// GET ?apply=true: gap-fills anything found in Jobber but missing
// locally, backfills customers.created_at and jobber_jobs.instructions
// from Jobber's real values, and snapshots each job's Jobber line items
// into jobber_line_items_snapshot (migration 068 — run that migration
// before using ?apply=true, or the snapshot writes fail individually and
// show up in jobs.lineItemsSnapshotErrors while everything else still
// completes). See lib/jobberMigrationAudit.ts's header comment for the
// full intended run order, and migration 067's header comment for what
// comes after this.
import { NextResponse } from "next/server";
import { runJobberMigrationAudit } from "@/lib/jobberMigrationAudit";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_TYPE = "migration_audit";

export async function GET(request: Request) {
  const apply = new URL(request.url).searchParams.get("apply") === "true";

  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "A migration audit is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const result = await runJobberMigrationAudit({ apply });

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived:
        result.customers.jobberCount + result.jobs.jobberCount + result.visits.jobberCount,
      recordsSaved:
        result.customers.gapFilled + result.jobs.gapFilled + result.visits.gapFilled,
      pagesProcessed: 0,
      throttleRetries: 0,
      metadata: { apply, warnings: result.warnings },
    });

    return NextResponse.json({
      success: true,
      message: apply
        ? "Migration audit complete — gaps filled, created_at/instructions backfilled, line items snapshotted where possible."
        : "Migration audit complete (read-only — nothing was written). Re-run with ?apply=true once this looks right.",
      ...result,
    });
  } catch (error) {
    console.error("Jobber migration audit failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "An unknown migration audit error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
