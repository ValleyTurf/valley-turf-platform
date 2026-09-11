// Jobber Independence Roadmap (2026-09) -- permanently disabled (one of
// 5 satellite syncs disabled together in this pass, Ryan's call). This
// route used to upsert latitude/longitude/geo_status onto `customers`
// from Jobber's property data -- with nothing this app can no longer get
// elsewhere (this app's own address fields are now authoritative for a
// migrated customer), leaving it running would risk rolling a manually
// corrected address's coordinates back to Jobber's stale copy. See
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
        "This sync was permanently disabled as part of the Jobber Independence cutover (2026-09) -- customer addresses/coordinates are now natively owned by this app. See this file's header comment.",
    },
    { status: 410 }
  );
}
