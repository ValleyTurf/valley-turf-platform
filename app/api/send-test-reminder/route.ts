import "server-only";
import { NextResponse } from "next/server";
import { sendVisitReminderSms } from "@/lib/notifications";
import { getBaseUrl } from "@/lib/baseUrl";

// TEMPORARY diagnostic route -- lets Ryan preview the real pre-visit
// reminder SMS on his own phone now that the Twilio A2P 10DLC campaign
// is approved. Calls the exact same function the 4-day/2-day cron uses
// (lib/visitReminders.ts), with sample data and jobberClientId: null so
// nothing gets logged against a real customer's contact history. Delete
// this route once Ryan's confirmed the message looks right -- same
// pattern as the deleted /stripe-test, /invoice-test, and *-schema-check
// diagnostic routes.
//
// No PUBLIC_PATHS entry -- proxy.ts requires a valid staff session for
// any route not explicitly listed there, so this already only runs for
// someone already logged into the CRM.
export async function GET() {
  const baseUrl = await getBaseUrl();

  const sampleDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

  const sent = await sendVisitReminderSms(
    "+15039995502",
    "Ryan",
    sampleDate,
    `${baseUrl}/confirm`,
    null
  );

  return NextResponse.json({ sent });
}
