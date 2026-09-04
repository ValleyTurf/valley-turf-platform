// Routes a customer's email reply back to the right Customer page --
// shared by lib/notifications.ts (which sets reply_to on every
// customer-facing send) and app/api/webhooks/resend/route.ts (which
// decodes it back out of an inbound email.received event).
//
// Resend's inbound webhook payload gives you the raw addresses an email
// was sent to, but nothing that reliably ties it back to a specific
// customer -- there's no guaranteed, documented "this is a reply to
// email X" field. Rather than parse In-Reply-To/References headers
// (undocumented shape, and not every mail client sets them the same
// way), this app plus-addresses every outbound reply-to with the
// customer's own jobber_client_id baked right into the mailbox name:
// replies+<client id>@RESEND_REPLY_DOMAIN. Whatever a customer's mail
// client does with threading, the one thing guaranteed to survive a
// reply is the address they're replying TO -- so decoding that address
// is what actually identifies the customer, deterministically, no
// header-sniffing required.
//
// Embedded directly, NOT re-encoded -- jobber_client_id is already
// Jobber's own base64-encoded GraphQL global id (e.g. base64 of
// "gid://Jobber/Client/12345678"), and every character standard base64
// can produce (A-Z a-z 0-9 + / =) is valid, unquoted RFC 5322 local-part
// text. An earlier version of this file hex-encoded the id "to be
// safe," which quietly doubled its length and pushed the local part
// (the part before the @) past email's 64-octet limit for anything but
// the shortest ids -- that's exactly the 422 "Invalid 'reply_to' field"
// Resend threw in production the first time this shipped. Using the id
// as-is keeps the address well under that limit and is exactly as
// reversible.
import "server-only";

const REPLY_LOCAL_PART = "replies";

// RFC 5321's hard limit on the part of an address before the @ sign.
const MAX_LOCAL_PART_LENGTH = 64;

// Defensively cleaned up rather than used raw -- a domain env var is a
// very easy place to accidentally paste in a stray "https://" prefix,
// trailing slash, surrounding quotes, or trailing whitespace, and any
// of those turns the resulting reply_to address into something Resend's
// API will reject outright with a 422 ("Invalid 'reply_to' field").
function replyDomain(): string | null {
  const raw = process.env.RESEND_REPLY_DOMAIN;

  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  return cleaned || null;
}

// Returns undefined (not null) so callers can spread it straight into a
// JSON.stringify'd request body -- Resend's send API simply omits
// reply_to when the key is undefined, so a customer with no jobberClientId
// (or before Ryan finishes the receiving-domain DNS setup) just gets a
// normal email with no reply routing, rather than a broken address.
export function replyToAddressFor(
  jobberClientId: string | null
): string | undefined {
  const domain = replyDomain();

  if (!jobberClientId || !domain) {
    return undefined;
  }

  // "@" is the one character that would break parsing the address back
  // apart -- never expected in a base64 id, but checked rather than
  // assumed. Same for the overall length: rather than assume every
  // jobber_client_id fits, this falls back to no reply routing at all
  // for that one send instead of handing Resend an address it'll 422 on.
  const localPart = `${REPLY_LOCAL_PART}+${jobberClientId}`;

  if (jobberClientId.includes("@") || localPart.length > MAX_LOCAL_PART_LENGTH) {
    console.error(
      `Skipping reply_to for jobberClientId "${jobberClientId}" -- local part would be ${localPart.length} chars (max ${MAX_LOCAL_PART_LENGTH}) or contains "@".`
    );
    return undefined;
  }

  // Wrapped with a display name so a customer hitting Reply sees "Valley
  // Turf Revival" rather than the raw replies+<id>@... address -- the
  // encoded address only needs to be machine-readable (for
  // decodeClientIdFromReplyAddress below), never human-facing. Mail
  // clients populate the reply's To field from this display name, same
  // as they do for the From header (see fromHeader() in
  // lib/notifications.ts).
  return `Valley Turf Revival <${localPart}@${domain}>`;
}

// Given one recipient address from an inbound email.received webhook's
// `to` array, returns the jobber_client_id it was addressed to, or null
// if this address isn't one of our reply-routing addresses at all (e.g.
// someone emailed a different address on the receiving domain, or the
// webhook fired for something unrelated).
export function decodeClientIdFromReplyAddress(
  address: string
): string | null {
  const domain = replyDomain();

  if (!domain) {
    return null;
  }

  const pattern = new RegExp(
    `^${REPLY_LOCAL_PART}\\+(.+)@${domain.replace(/\./g, "\\.")}$`,
    "i"
  );

  const match = address.trim().match(pattern);

  return match ? match[1] : null;
}
