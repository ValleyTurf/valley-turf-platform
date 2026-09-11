// Twilio inbound-VOICE webhook -- configure this URL as the "A call
// comes in" webhook on this app's Twilio number, under Voice
// Configuration in the Twilio console (Webhook, HTTP POST). Deliberately
// a separate route from app/api/webhooks/twilio/route.ts: Twilio's
// Messaging and Voice configs are independent settings on the same
// phone number, and the two payload shapes barely overlap (a voice POST
// has no Body; a message POST never has CallSid/DialCallStatus), so
// keeping them apart is simpler than branching one handler on payload
// shape.
//
// Same "verify the signature before trusting anything in the body"
// discipline as the SMS webhook and the Stripe/Resend ones.
//
// Two-phase design, one route: Twilio hits this URL twice per call.
//   1. The call first comes in -- no DialCallStatus param yet. We answer
//      with TwiML that forwards the call to ALERT_PHONE (the same
//      number lib/notifications.ts already texts/calls for low-rating
//      and new-lead alerts), via a <Dial> whose own action= points back
//      at this exact URL.
//   2. When that <Dial> resolves (answered, no answer, busy, failed),
//      Twilio POSTs here again -- this time WITH DialCallStatus. That's
//      the only point we actually know the outcome, so that's where the
//      one contact_history/unknown_contacts row gets written, already
//      carrying the full picture (answered + duration, or missed +
//      why) instead of needing a separate update afterward.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { headers } from "next/headers";
import { logContactHistory } from "@/lib/contactHistory";
import { findJobberClientIdByPhone } from "@/lib/customerContacts";
import { logUnknownContact } from "@/lib/unknownContacts";

export const dynamic = "force-dynamic";

// Same env var (and same fallback) lib/notifications.ts already uses to
// reach Ryan directly for low-rating/new-lead alerts -- one "where do
// urgent things reach a real person" number for the whole app rather
// than a second, parallel setting just for call forwarding.
const ALERT_PHONE = process.env.ALERT_PHONE || "+14803314596";

function verifyTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;

  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  const expectedBuffer = Buffer.from(expected, "base64");
  const providedBuffer = Buffer.from(signature, "base64");

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// One-line summary for the Contact History / Unknown Senders row --
// mirrors the "Incoming Call" / notes shape the existing manual call-log
// form on the Customer page already writes (app/(platform)/customers/
// [id]/actions.ts), just filled in automatically instead of typed by
// staff after the fact.
function describeDialOutcome(
  status: string | undefined,
  durationSeconds: string | undefined
): string {
  switch (status) {
    case "completed": {
      const seconds = Number(durationSeconds ?? 0);
      const minutes = Math.floor(seconds / 60);
      const remaining = seconds % 60;
      const duration =
        minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
      return `Answered -- ${duration}`;
    }
    case "no-answer":
      return "Missed -- no answer";
    case "busy":
      return "Missed -- line busy";
    case "failed":
    case "canceled":
      return "Missed -- call couldn't connect";
    default:
      return "Call ended";
  }
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error("Rejected Twilio voice webhook: TWILIO_AUTH_TOKEN is not set.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    console.error("Rejected Twilio voice webhook: missing X-Twilio-Signature header.");
    return NextResponse.json({ error: "Missing signature header." }, { status: 400 });
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Reconstructed from the forwarded host rather than request.url, same
  // reasoning as lib/baseUrl.ts and the SMS webhook -- matches the
  // public URL Twilio actually signed against regardless of how Vercel's
  // internal routing presents the request to this handler. Also reused
  // below as the <Dial action=...> target, so the completion callback
  // lands on this exact same route.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";
  const fullUrl = `${protocol}://${host}/api/webhooks/twilio-voice`;

  if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
    console.error("Rejected Twilio voice webhook: signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const fromPhone = params.From;

  // Phase 2: the <Dial> below has already finished -- DialCallStatus is
  // only ever present on this completion callback, never on the initial
  // incoming-call POST. Log the outcome and close the call out; there's
  // nothing left to say back to Twilio.
  if (params.DialCallStatus) {
    const outcome = describeDialOutcome(
      params.DialCallStatus,
      params.DialCallDuration
    );

    if (fromPhone) {
      const jobberClientId = await findJobberClientIdByPhone(fromPhone);

      if (jobberClientId) {
        await logContactHistory({
          jobberClientId,
          channel: "call",
          direction: "inbound",
          subject: "Incoming Call",
          summary: outcome,
        });
      } else {
        // Same "don't drop it" treatment ROADMAP.md "Next up" #1 already
        // gave unrecognized texts/emails -- a cold prospect calling in
        // now shows up in the same Unknown Senders review queue instead
        // of vanishing the moment nobody picks up.
        await logUnknownContact({
          channel: "call",
          phone: fromPhone,
          summary: outcome,
        });
      }
    }

    return twimlResponse("<Response></Response>");
  }

  // Phase 1: a fresh incoming call -- forward it straight to Ryan's
  // cell. Caller ID on the forwarded leg is Twilio's default (the
  // Twilio number itself, not the original caller's number) -- same as
  // the quick TwiML Bin forward this replaces, so nothing changes about
  // what shows up on the phone.
  return twimlResponse(
    `<Response><Dial action="${fullUrl}" method="POST">${ALERT_PHONE}</Dial></Response>`
  );
}
