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

// Good/Better/Best tiered pricing (035_add_quote_tiers.sql) — a quote is
// either 'flat' (the original single price_total/description) or
// 'tiered' (2-3 quote_tiers rows, no price_total until one is accepted).
export type PricingMode = "flat" | "tiered";

export type TierKey = "good" | "better" | "best";

export const TIER_KEYS: TierKey[] = ["good", "better", "best"];

export const DEFAULT_TIER_NAMES: Record<TierKey, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

export type QuoteTier = {
  id: string;
  quote_id: string;
  tier_key: TierKey;
  name: string;
  price: number | string;
  features: string[];
  is_featured: boolean;
  display_order: number;
};

export function isPricingMode(
  value: string | null | undefined
): value is PricingMode {
  return value === "flat" || value === "tiered";
}

export function isTierKey(value: string | null | undefined): value is TierKey {
  return TIER_KEYS.includes(value as TierKey);
}

// quote_tiers has no reliable ordering guarantee from a plain select, so
// every place that renders tiers sorts through this first — by
// display_order (set at creation to match the good/better/best input
// order), falling back to the fixed tier_key order for older rows.
export function sortTiers<T extends { display_order: number; tier_key: TierKey }>(
  tiers: T[]
): T[] {
  return [...tiers].sort((a, b) => {
    if (a.display_order !== b.display_order) {
      return a.display_order - b.display_order;
    }
    return TIER_KEYS.indexOf(a.tier_key) - TIER_KEYS.indexOf(b.tier_key);
  });
}
