// Twilio delivery-status callback for customer texts (the StatusCallback
// sent with every message by lib/twilioSend.ts). Twilio POSTs here as a
// message goes queued -> sent -> delivered, or to failed / undelivered
// with an ErrorCode. Same signature discipline as the inbound text
// webhook next door.
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyTwilioSignature } from "@/lib/twilioSignature";
import { applyTextStatus } from "@/lib/twilioDelivery";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error("Rejected Twilio status webhook: TWILIO_AUTH_TOKEN is not set.");
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
  const fullUrl = `${protocol}://${host}/api/webhooks/twilio-status`;

  if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
    console.error("Rejected Twilio status webhook: signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const sid = params.MessageSid || params.SmsSid;
  const status = (params.MessageStatus || params.SmsStatus || "").toLowerCase();

  if (sid && status) {
    // Awaited: a serverless function is frozen once the response goes
    // out, which would cut off the email fallback mid-send.
    await applyTextStatus({
      sid,
      status,
      errorCode: params.ErrorCode || null,
    });
  }

  return new NextResponse(null, { status: 204 });
}
