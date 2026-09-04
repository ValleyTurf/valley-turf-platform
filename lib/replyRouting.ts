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
// replies+<hex-encoded client id>@RESEND_REPLY_DOMAIN. Whatever a
// customer's mail client does with threading, the one thing guaranteed
// to survive a reply is the address they're replying TO -- so decoding
// that address is what actually identifies the customer, deterministically,
// no header-sniffing required.
//
// Hex-encoded (not the raw client id) so the local-part only ever
// contains [0-9a-f] -- Jobber's opaque base64-style IDs can contain
// characters like +, /, = that are technically legal in an email
// local-part but risk being mishandled by some mail server somewhere.
import "server-only";

const REPLY_LOCAL_PART = "replies";

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

  const tag = Buffer.from(jobberClientId, "utf8").toString("hex");

  return `${REPLY_LOCAL_PART}+${tag}@${domain}`;
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
    `^${REPLY_LOCAL_PART}\\+([0-9a-f]+)@${domain.replace(/\./g, "\\.")}$`,
    "i"
  );

  const match = address.trim().match(pattern);

  if (!match) {
    return null;
  }

  try {
    const decoded = Buffer.from(match[1], "hex").toString("utf8");
    return decoded || null;
  } catch {
    return null;
  }
}
