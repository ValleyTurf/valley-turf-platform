import "server-only";
import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/baseUrl";

// TEMPORARY diagnostic route -- lets Ryan preview the real pre-visit
// reminder SMS on his own phone now that the Twilio A2P 10DLC campaign
// is approved. First pass called the shared sendVisitReminderSms
// directly, but that function only returns true/false and swallows the
// actual Twilio error -- {"sent":false} gave no way to tell "env vars
// missing" from "Twilio rejected the request" from "wrong phone format".
// This version makes the same Twilio call inline and returns the real
// status/response body so the failure is actually diagnosable. Delete
// this route (not just revert it) once Ryan's confirmed the message
// looks right -- same as every other one-off *-schema-check / -test
// diagnostic route in this repo.
export async function GET() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({
      sent: false,
      reason: "Missing Twilio env var(s)",
      hasAccountSid: Boolean(accountSid),
      hasAuthToken: Boolean(authToken),
      hasFromNumber: Boolean(fromNumber),
    });
  }

  const baseUrl = await getBaseUrl();

  const sampleDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

  const body = `Hi Ryan, we have your next turf cleaning with Valley Turf Revival scheduled for ${sampleDate}. Please confirm here: ${baseUrl}/confirm — or reply to this message if you need to reschedule. Before we arrive, please try to pick up any easily removable dog waste. Thank you!`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: "+15039995502",
          From: fromNumber,
          Body: body,
        }),
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json({
        sent: false,
        reason: "Twilio API rejected the request",
        status: response.status,
        twilioResponse: responseText,
        fromNumberUsed: fromNumber,
      });
    }

    return NextResponse.json({ sent: true, twilioResponse: responseText });
  } catch (error) {
    return NextResponse.json({
      sent: false,
      reason: "Fetch to Twilio threw",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
