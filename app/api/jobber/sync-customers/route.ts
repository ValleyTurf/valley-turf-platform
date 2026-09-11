// Jobber Independence Roadmap (2026-09) -- permanently disabled. Ryan
// confirmed crews and staff use this app exclusively now, not Jobber's
// own app/web UI, so this app stopped treating Jobber as the source of
// truth for customers (roadmap #9). This route used to pull every
// Jobber client and unconditionally upsert it into `customers` --
// running that after 067_migrate_jobber_to_native.sql relabeled the
// whole customer base source='native' would have silently overwritten
// locally-edited fields (address, contact info, notes, etc.) with
// Jobber's stale snapshot, since the old upsert had no source filter at
// all. Disabling this route entirely, rather than adding a guard, is
// the deliberate fix -- there is no legitimate reason for it to run
// again.
//
// Removed from vercel.json's cron schedule and proxy.ts's CRON_PATHS in
// the same change that disabled this route.
//
// For a genuine one-off need to pull a single customer from Jobber
// (e.g. investigating a data discrepancy), use the migration audit tool
// instead (lib/jobberMigrationAudit.ts / GET /api/jobber/audit-migration)
// or lib/jobberWebhookProcessor.ts's syncSingleCustomer directly -- both
// already guard on source='native' so they can't clobber a migrated
// customer.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      disabled: true,
      message:
        "This sync was permanently disabled as part of the Jobber Independence cutover (2026-09) -- customers are now natively owned by this app. See this file's header comment.",
    },
    { status: 410 }
  );
}
