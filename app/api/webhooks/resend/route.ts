// Resend webhook receiver -- feeds email delivered/opened events back
// into contact_history (lib/contactHistory.ts) so the Customer page can
// show whether a sent email was actually opened. See migration
// 056_add_contact_history.sql's header comment for the "why".
//
// Resend signs webhooks the same way Svix does (Resend's webhook
// infrastructure IS Svix under the hood) -- HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{body}", keyed by the base64 portion of
// the whsec_... signing secret from the Resend dashboard. No svix
// package installed for this (matches this app's existing pattern of
// calling Resend/Twilio via raw fetch rather than pulling in SDKs) --
// verified manually with Node's crypto, same timing-safe-compare
// discipline as any other webhook signature check.
//
// Unlike the Stripe webhook (app/api/webhooks/stripe/route.ts), this
// doesn't queue into a table first -- each event is a single, idempotent
// column update (markEmailDelivered/markEmailOpened both guard with
// `.is(..., null)`), so there's no batch of follow-up work worth
// deferring to a queue processor.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { markEmailDelivered, markEmailOpened } from "@/lib/contactHistory";

export const dynamic = "force-dynamic";

type ResendWebhookEvent = {
  type: string;
  data: {
    email_id?: string;
  };
};

function verifySignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): boolean {
  // Resend's signing secret is "whsec_" + base64(raw key bytes) -- strip
  // the prefix before decoding, same convention Svix docs describe.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  const expectedSignature = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // svix-signature can carry multiple space-separated "v1,<sig>" values
  // (e.g. during a secret rotation) -- valid if any of them match.
  const candidates = svixSignature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((sig): sig is string => Boolean(sig));

  return candidates.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "base64");
    const expectedBuffer = Buffer.from(expectedSignature, "base64");

    return (
      candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error("Rejected Resend webhook: RESEND_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("Rejected Resend webhook: missing svix headers.");
    return NextResponse.json({ error: "Missing signature headers." }, { status: 400 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
    console.error("Rejected Resend webhook: signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: ResendWebhookEvent;

  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("Rejected Resend webhook: invalid JSON body.");
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const emailId = event.data?.email_id;

  if (emailId) {
    if (event.type === "email.delivered") {
      await markEmailDelivered(emailId);
    } else if (event.type === "email.opened") {
      await markEmailOpened(emailId);
    }
    // Other event types (sent, bounced, complained, clicked, etc.) are
    // intentionally ignored for now -- only delivered/opened feed the
    // Customer page's contact history today.
  }

  return NextResponse.json({ received: true });
}
