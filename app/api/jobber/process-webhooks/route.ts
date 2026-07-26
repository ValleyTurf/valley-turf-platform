import { NextResponse } from "next/server";
import { processPendingWebhookEvents } from "@/lib/jobberWebhookProcessor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Auth for this route is handled by proxy.ts, same as the other Jobber
// sync routes: an authenticated admin session (the "Process Now" button
// on /settings/jobber) or Vercel Cron's automatic CRON_SECRET bearer
// token both work. This used to have its own separate JOBBER_SYNC_SECRET
// check here, but Vercel Cron only ever sends CRON_SECRET, so that check
// could never actually be satisfied by the cron trigger — see proxy.ts's
// CRON_PATHS for the fix.
export async function GET() {
  try {
    const result = await processPendingWebhookEvents();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Jobber webhook processor failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown webhook processor error occurred.",
      },
      { status: 500 }
    );
  }
}
