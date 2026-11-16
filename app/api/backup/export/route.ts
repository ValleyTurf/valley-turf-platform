// On-demand data backup: an admin-only download of a ZIP containing one
// CSV per table for everything that would actually be lost if Supabase
// disappeared. Uses the same builder (and table list) as the automatic
// weekly backup -- see lib/backup.ts and lib/backupTables.ts for what is
// included and what is deliberately left out.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { buildBackup } from "@/lib/backup";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  try {
    const { zip, fileName } = await buildBackup();

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(zip.length),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Backup export failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
