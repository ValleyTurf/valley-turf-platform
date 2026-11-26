// Second half of a CRM click-to-call (lib/outboundCall.ts). Twilio requests
// this once the staff member picks up their phone, and we answer with TwiML
// that dials the customer showing the business number. It is hit a second
// time when that dial finishes, which is where the outcome is written to
// the customer's Contact History. The signature is verified and the
// destination comes from the signed URL, so this cannot be used to dial
// arbitrary numbers.
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyTwilioSignature } from "@/lib/twilioSignature";
import { logContactHistory } from "@/lib/contactHistory";
import { bridgeTwiml, describeOutboundOutcome, isE164 } from "@/lib/outboundCallLogic";

export const dynamic = "force-dynamic";

function twiml(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const callerId = process.env.TWILIO_FROM_NUMBER;

  if (!authToken || !callerId) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature header." }, { status: 400 });
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";
  const fullUrl = `${protocol}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
    console.error("Rejected Twilio outbound voice webhook: signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const to = request.nextUrl.searchParams.get("to");
  const clientId = request.nextUrl.searchParams.get("client");

  // Second request: the customer leg has ended.
  if (params.DialCallStatus) {
    if (clientId) {
      await logContactHistory({
        jobberClientId: clientId,
        channel: "call",
        direction: "outbound",
        subject: "Outgoing Call",
        summary: describeOutboundOutcome(params.DialCallStatus, params.DialCallDuration),
      });
    }

    return twiml("<Response></Response>");
  }

  if (!isE164(to)) {
    return twiml("<Response><Say>Sorry, this call could not be connected.</Say></Response>");
  }

  return twiml(bridgeTwiml({ callerId, to, actionUrl: fullUrl }));
}
