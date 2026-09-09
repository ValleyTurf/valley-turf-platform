// Twilio inbound-SMS webhook -- configure this URL (see the header
// comment in lib/customerContacts.ts's findJobberClientIdByPhone for the
// matching logic it relies on) as the "A message comes in" webhook on
// the Twilio phone number this app already sends from
// (TWILIO_FROM_NUMBER), under Messaging Configuration in the Twilio
// console. Content-Type: application/x-www-form-urlencoded, HTTP POST.
//
// Same "verify the signature before trusting anything in the body"
// discipline as the Stripe/Resend webhooks (app/api/webhooks/stripe,
// app/api/webhooks/resend) -- Twilio's flavor is X-Twilio-Signature,
// computed as base64(HMAC-SHA1(authToken, url + sorted "key+value"
// concatenation of every POST param)). No twilio npm package installed
// for this (matches this app's existing pattern of calling Twilio via
// raw fetch for outbound sends rather than pulling in their SDK) --
// verified manually with Node's crypto.
//
// Every inbound text gets logged to contact_history (channel: "sms",
// direction: "inbound") the same shape inbound email replies already
// use, matched to a customer by phone number rather than a reply-routing
// address (texts don't carry anything like Resend's reply-to encoding).
// A text from an unrecognized number is intentionally NOT logged
// anywhere -- there's no customer record to attach it to, same
// "nothing useful to log this against" reasoning as
// app/api/webhooks/resend's handleInboundReply.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { headers } from "next/headers";
import { logContactHistory } from "@/lib/contactHistory";
import { findJobberClientIdByPhone } from "@/lib/customerContacts";

export const dynamic = "force-dynamic";

// Empty TwiML -- tells Twilio "received, no auto-reply." An empty 200
// with no body also works, but an explicit empty <Response/> is
// Twilio's documented convention for "nothing to say back."
const EMPTY_TWIML_RESPONSE = new NextResponse(
  `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  { status: 200, headers: { "Content-Type": "text/xml" } }
);

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

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error("Rejected Twilio webhook: TWILIO_AUTH_TOKEN is not set.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    console.error("Rejected Twilio webhook: missing X-Twilio-Signature header.");
    return NextResponse.json({ error: "Missing signature header." }, { status: 400 });
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Reconstructed from the forwarded host rather than request.url --
  // same reasoning as lib/baseUrl.ts -- so this matches the public URL
  // Twilio actually signed against regardless of how Vercel's internal
  // routing presents the request to this handler.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";
  const fullUrl = `${protocol}://${host}/api/webhooks/twilio`;

  if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
    console.error("Rejected Twilio webhook: signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const fromPhone = params.From;
  const body = params.Body;

  if (fromPhone && body) {
    const jobberClientId = await findJobberClientIdByPhone(fromPhone);

    if (jobberClientId) {
      await logContactHistory({
        jobberClientId,
        channel: "sms",
        direction: "inbound",
        summary: body.slice(0, 4000),
      });
    } else {
      console.error(`Inbound text from unrecognized number ${fromPhone}: no matching customer.`);
    }
  }

  return EMPTY_TWIML_RESPONSE;
}
