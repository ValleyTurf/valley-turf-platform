// Weekly automatic data backup -- cron entry point. Builds the ZIP, saves
// it to the private "backups" bucket (newest 8 kept), and emails the
// digest recipients a 7-day download link. A failure also emails them, so
// a backup that silently stops running gets noticed.
import { NextResponse } from "next/server";
import { buildBackup, storeBackup } from "@/lib/backup";
import { sendBackupEmail } from "@/lib/notifications";
import { supabaseServer } from "@/lib/supabase-server";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_TYPE = "weekly-backup";

async function recipients(): Promise<string[]> {
  const { data } = await supabaseServer
    .from("daily_digest_settings")
    .select("recipient_emails")
    .eq("id", 1)
    .maybeSingle();

  return ((data?.recipient_emails ?? []) as string[]).filter(Boolean);
}

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "Weekly backup is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const built = await buildBackup();
    const stored = await storeBackup(built);

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: built.summary.rows,
      recordsSaved: built.summary.rows,
      pagesProcessed: built.summary.tables,
      throttleRetries: 0,
      metadata: {
        fileName: stored.fileName,
        bytes: stored.bytes,
        tables: built.summary.tables,
        failedTables: built.summary.failedTables,
        deletedOld: stored.deletedOld,
      },
    });

    for (const to of await recipients()) {
      await sendBackupEmail(to, {
        ok: true,
        fileName: stored.fileName,
        bytes: stored.bytes,
        tables: built.summary.tables,
        rows: built.summary.rows,
        failedTables: built.summary.failedTables,
        downloadUrl: stored.downloadUrl,
      });
    }

    return NextResponse.json({
      success: true,
      fileName: stored.fileName,
      bytes: stored.bytes,
      tables: built.summary.tables,
      rows: built.summary.rows,
      failedTables: built.summary.failedTables,
    });
  } catch (error) {
    console.error("Weekly backup failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown backup error.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    try {
      for (const to of await recipients()) {
        await sendBackupEmail(to, { ok: false, error: errorMessage });
      }
    } catch (emailError) {
      console.error("Backup failure email failed:", emailError);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
