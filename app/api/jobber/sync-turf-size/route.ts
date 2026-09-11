// Jobber Independence Roadmap (2026-09) -- permanently disabled (one of
// 5 satellite syncs disabled together in this pass, Ryan's call). This
// route only ever filled in turf_size_range/turf_size_sqft when BOTH
// were already blank locally (never overwrote a manually-entered value),
// so it was low-risk on its own -- disabled anyway for consistency with
// the other four satellite syncs, since Jobber is no longer a source of
// truth for anything on `customers` once a customer is migrated. See
// sync-customers/route.ts's header comment for the fuller cutover
// context (roadmap #9).
//
// Not on any cron schedule or CRON_PATHS entry (this was always
// manual-trigger-only), so there's no config cleanup needed beyond this
// file.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      disabled: true,
      message:
        "This sync was permanently disabled as part of the Jobber Independence cutover (2026-09) -- turf size is now natively owned by this app. See this file's header comment.",
    },
    { status: 410 }
  );
}
