// Twilio posts here when a caller finishes leaving a voicemail (the
// <Record action> from app/api/webhooks/twilio-voice). Saves it to the
// customer's Contact History (or Unknown senders for a caller we do not
// know) and pushes a notification. Signature verified like the other
// Twilio webhooks.
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyTwilioSignature } from "@/lib/twilioSignature";
import { findJobberClientIdByPhone } from "@/lib/customerContacts";
import { getCustomerDisplayName, getUnreadMessageCount, logContactHistory } from "@/lib/contactHistory";
import { logUnknownContact } from "@/lib/unknownContacts";
import { sendPush } from "@/lib/webPush";
import { formatVoicemailLength, isUsableRecording, isValidRecordingSid } from "@/lib/voicemailLogic";

export const dynamic = "force-dynamic";

function twiml(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
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
  const fullUrl = `${protocol}://${host}/api/webhooks/twilio-voicemail`;

  if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
    console.error("Rejected Twilio voicemail webhook: signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const goodbye = twiml("<Response><Say>Thank you. Goodbye.</Say><Hangup/></Response>");
  const fromPhone = params.From;
  const recordingSid = params.RecordingSid;

  // A hang-up with no message is already covered by the missed-call log.
  if (!fromPhone || !isValidRecordingSid(recordingSid) || !isUsableRecording(params.RecordingDuration)) {
    return goodbye;
  }

  const length = formatVoicemailLength(params.RecordingDuration);
  const summary = `Voicemail -- ${length}`;
  const jobberClientId = await findJobberClientIdByPhone(fromPhone);
  const callerName = await getCustomerDisplayName(jobberClientId);

  if (jobberClientId) {
    await logContactHistory({
      jobberClientId,
      channel: "call",
      direction: "inbound",
      subject: "Voicemail",
      summary,
      relatedType: "voicemail",
      relatedId: recordingSid,
    });
  } else {
    await logUnknownContact({ channel: "call", phone: fromPhone, summary, recordingSid });
  }

  await sendPush("missed_call", {
    title: `Voicemail from ${callerName ?? fromPhone}`,
    body: `${length} -- tap to listen`,
    // Lands on the Calls & voicemails tab, where it can be played.
    url: "/messages?view=calls",
    badgeCount: await getUnreadMessageCount().catch(() => 0),
  });

  return goodbye;
}
