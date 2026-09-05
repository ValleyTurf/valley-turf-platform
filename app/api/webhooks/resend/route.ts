// Resend webhook receiver -- feeds email delivered/opened events back
// into contact_history (lib/contactHistory.ts) so the Customer page can
// show whether a sent email was actually opened, and feeds inbound
// customer replies back in too (see the "email.received" branch below
// and lib/replyRouting.ts for how a reply gets matched to a customer).
// See migration 056_add_contact_history.sql's header comment for the
// "why" behind the table itself.
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
// `.is(..., null)`) or a single insert (the inbound-reply branch), so
// there's no batch of follow-up work worth deferring to a queue
// processor.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { logContactHistory, markEmailDelivered, markEmailOpened } from "@/lib/contactHistory";
import { decodeClientIdFromReplyAddress } from "@/lib/replyRouting";

export const dynamic = "force-dynamic";

type ResendWebhookEvent = {
  type: string;
  data: {
    email_id?: string;
    to?: string[];
    subject?: string;
  };
};

type ResendReceivedEmail = {
  subject?: string;
  text?: string | null;
  html?: string | null;
};

// A customer's reply carries no subject/body in the webhook payload
// itself -- Resend only tells you an inbound email arrived and hands
// you an id, so the actual content is a separate follow-up call to the
// Receiving API. See lib/replyRouting.ts's header comment for why
// matching this to a customer doesn't rely on that content at all
// (it's keyed off which reply-routing address the customer replied to,
// not anything about the message itself).
async function fetchReceivedEmailContent(
  emailId: string,
  apiKey: string
): Promise<ResendReceivedEmail | null> {
  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!response.ok) {
      console.error(
        "Couldn't fetch received email content:",
        response.status,
        await response.text()
      );
      return null;
    }

    return (await response.json()) as ResendReceivedEmail;
  } catch (error) {
    console.error("Error fetching received email content:", error);
    return null;
  }
}

// Strips tags for the rare reply that has HTML but no plain-text part --
// good enough for a Contact History summary line, not meant to be a
// faithful render. Block-level boundaries become newlines (rather than
// collapsing everything to single spaces) specifically so
// stripQuotedReplyText below still has line breaks to work with.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Mail clients prepend the entire quoted thread below a reply (e.g.
// "On Fri, Sep 4 ... wrote: > ..."). Since every earlier message in the
// conversation already has its own separate Contact History entry,
// keeping the quoted copy here would just duplicate what's already
// shown in an older entry a few rows down -- so only the text before
// the quote marker (what the customer actually typed this time) is kept.
//
// The "On <date> ... wrote:" citation is searched for ANYWHERE in the
// text, not just as a standalone line -- an earlier version of this
// required it to be the entire line by itself, which silently never
// matched in production because Gmail ran it directly onto the end of
// the customer's typed reply with no line break in between ("Did you
// get my last message? On Fri, Sep 4, 2026 ... wrote:"). The other
// markers (">" quote lines, Outlook's separators) are still checked
// per-line, since those genuinely only ever start a line.
//
// "s" (dotAll) flag is required here too -- plain-text emails commonly
// hard-wrap around 76-78 characters, and this citation line easily runs
// past that (it wrapped mid-phrase, right before the email address, in
// the exact production reply that exposed this: "...Valley Turf
// Revival \n<invoices@...> wrote:"). Without dotAll, "." never matches
// the newline the wrap introduced, so the whole pattern silently failed
// on any citation long enough to wrap -- which is most of them, since
// they always include a full name and email address.
function stripQuotedReplyText(text: string): string {
  const boundaryPattern = new RegExp(
    [
      String.raw`\bOn\s.{5,160}?\bwrote:`, // "On Fri, Sep 4, 2026 at 4:36 PM ... wrote:" -- anywhere in the text, spanning wrapped lines
      String.raw`^[ \t]*>`, // a line beginning with the ">" quote marker
      String.raw`^-{2,}\s*Original Message\s*-{2,}\s*$`, // Outlook-style separator
      String.raw`^From:\s.+`, // Outlook-style quoted headers block
    ].join("|"),
    "ims"
  );

  const match = text.match(boundaryPattern);

  return match && typeof match.index === "number"
    ? text.slice(0, match.index).trim()
    : text.trim();
}

async function handleInboundReply(
  emailId: string,
  toAddresses: string[],
  fallbackSubject: string | undefined,
  apiKey: string
): Promise<void> {
  const jobberClientId = toAddresses
    .map((address) => decodeClientIdFromReplyAddress(address))
    .find((decoded): decoded is string => Boolean(decoded));

  if (!jobberClientId) {
    // Not addressed to one of our reply-routing addresses -- e.g.
    // RESEND_REPLY_DOMAIN isn't configured yet, or this is some other
    // mail that landed on the receiving domain. Nothing to attribute
    // this to, so there's nowhere useful to log it.
    return;
  }

  const content = await fetchReceivedEmailContent(emailId, apiKey);
  const rawBody =
    content?.text?.trim() || (content?.html ? stripHtml(content.html) : null);

  // Falls back to the un-stripped body on the off chance a reply is
  // somehow ALL quote with nothing new typed -- better to show the
  // quoted content than an empty "(No message body.)" in that edge case.
  const summary = rawBody
    ? stripQuotedReplyText(rawBody) || rawBody
    : "(No message body.)";

  await logContactHistory({
    jobberClientId,
    channel: "email",
    direction: "inbound",
    subject: content?.subject || fallbackSubject || "Reply from customer",
    summary: summary.slice(0, 4000),
  });
}

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
    } else if (event.type === "email.received") {
      const apiKey = process.env.RESEND_API_KEY;

      if (apiKey) {
        await handleInboundReply(emailId, event.data.to ?? [], event.data.subject, apiKey);
      } else {
        console.error("Cannot fetch inbound reply content: RESEND_API_KEY is not set.");
      }
    }
    // Other event types (sent, bounced, complained, clicked, etc.) are
    // intentionally ignored for now.
  }

  return NextResponse.json({ received: true });
}
