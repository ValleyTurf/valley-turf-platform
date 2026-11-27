// Pure helpers for mail that reaches the CRM from Gmail rather than from
// a CRM-sent reply: customer emails forwarded by a Gmail filter, and the
// emails Ryan sends from Gmail with the CRM inbox address on BCC. No
// database or env access here, so it is unit-tested.

export const GMAIL_FORWARD_CONFIRMATION_SENDER = "forwarding-noreply@google.com";

// "Ryan <Ryan@Gmail.com>" -> "ryan@gmail.com". Returns null when there is
// no usable address in the text.
export function extractEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const bracket = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = (bracket ? bracket[1] : raw).trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

// Comma/space separated list (the GMAIL_OWN_ADDRESSES setting) -> clean
// lowercase addresses.
export function parseAddressList(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .split(/[\s,;]+/)
    .map((part) => extractEmail(part))
    .filter((part): part is string => Boolean(part));
}

const AUTOMATED_LOCAL_PARTS =
  /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce[s]?|notifications?|alerts?|newsletter|marketing)([+._-].*)?$/;

// Robots (receipts, newsletters, bounces) should not clutter Customer
// Connections. The one exception is Gmail's own forwarding confirmation,
// which carries the code Ryan needs to finish setting up the forward.
export function isAutomatedSender(email: string | null): boolean {
  if (!email) return false;
  if (email === GMAIL_FORWARD_CONFIRMATION_SENDER) return false;

  const local = email.split("@")[0] ?? "";
  return AUTOMATED_LOCAL_PARTS.test(local);
}

export type ForwardedMailClassification =
  | { kind: "ignore"; reason: string }
  | {
      kind: "mail";
      direction: "inbound" | "outbound";
      counterpart: string | null;
    };

export function classifyForwardedMail(params: {
  from: string | null | undefined;
  to: string[] | null | undefined;
  ownAddresses: string[];
}): ForwardedMailClassification {
  const from = extractEmail(params.from);
  const own = new Set(params.ownAddresses);

  // Sent from one of Ryan's own addresses (BCC'd to the CRM): the
  // customer is whoever it was addressed to.
  if (from && own.has(from)) {
    const recipients = (params.to ?? [])
      .map((address) => extractEmail(address))
      .filter((address): address is string => Boolean(address))
      .filter((address) => !own.has(address));

    const counterpart = recipients.find((address) => !isAutomatedSender(address));

    return {
      kind: "mail",
      direction: "outbound",
      counterpart: counterpart ?? null,
    };
  }

  if (isAutomatedSender(from)) {
    return { kind: "ignore", reason: "automated sender" };
  }

  return { kind: "mail", direction: "inbound", counterpart: from };
}
