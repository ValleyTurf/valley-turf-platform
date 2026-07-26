// Pure helpers for native quotes — kept free of lib/supabase-server.ts
// (same isolation rule as lib/permissionRules.ts/lib/importGraph.ts) so
// this is usable from anywhere, client or server, without dragging in a
// DB client, and so the logic here is trivially unit-testable.

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export const QUOTE_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
];

export function isQuoteStatus(value: string | null | undefined): value is QuoteStatus {
  return QUOTE_STATUSES.includes(value as QuoteStatus);
}

// The stored `status` column only ever changes via an explicit action
// (mark sent, accept, decline) — nothing flips it to "expired" on its
// own. This computes what should actually be SHOWN, so a "sent" quote
// past its expires_at reads as "Expired" everywhere in the UI without
// a cron job or trigger needing to rewrite the row. Draft/accepted/
// declined/already-expired quotes are left alone: a quote that was
// already accepted before expiring should still show as accepted.
export function computeDisplayStatus(
  status: QuoteStatus,
  expiresAt: string | null,
  now: Date = new Date()
): QuoteStatus {
  if (status !== "sent" || !expiresAt) {
    return status;
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return status;
  }

  return expiry.getTime() < now.getTime() ? "expired" : status;
}

export function canEditQuote(status: QuoteStatus): boolean {
  return status === "draft";
}

// A quote can only be manually marked Sent from Draft, and
// Accepted/Declined from Sent (including a since-expired Sent quote —
// nothing stops someone from still honoring an expired quote by hand).
// Draft/accepted/declined are terminal-ish from the internal status
// buttons; re-opening one is a delete-and-recreate, not an edit.
export function allowedStatusTransitions(status: QuoteStatus): QuoteStatus[] {
  if (status === "draft") return ["sent"];
  if (status === "sent" || status === "expired") return ["accepted", "declined"];
  return [];
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export function quoteStatusLabel(status: QuoteStatus): string {
  return STATUS_LABELS[status];
}

// Compact, URL-safe token for the public /q/[token] share link —
// deliberately not the quote's id/quote_number, so neither is exposed
// in a link that might get forwarded around.
export function generatePublicToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
