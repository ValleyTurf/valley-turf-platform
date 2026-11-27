// Pure logic for the Leads pipeline: works out where each lead stands
// from its manual status plus whatever quotes exist for it. Nothing here
// touches the database, so it's usable from client components and is
// unit-tested. The stored leads.status only ever holds the manual states
// (new / contacted / lost / needs_info); everything past "contacted" is
// DERIVED from quotes so it can never drift out of date.
import { computeDisplayStatus, isQuoteStatus, type QuoteStatus } from "@/lib/quotes";

export type LeadQuoteInfo = {
  status: string | null;
  expires_at: string | null;
  sent_at: string | null;
  created_at: string | null;
};

export type LeadStageKey =
  | "won"
  | "quote_sent"
  | "quote_expired"
  | "quote_declined"
  | "quote_drafted"
  | "cant_quote"
  | "lost"
  | "contacted"
  | "new";

export type LeadStage = {
  key: LeadStageKey;
  label: string;
  className: string;
  detail: string | null;
};

// Order shown in the filter chips (left to right = early to late).
export const LEAD_STAGE_ORDER: LeadStageKey[] = [
  "new",
  "contacted",
  "cant_quote",
  "quote_drafted",
  "quote_sent",
  "quote_expired",
  "quote_declined",
  "won",
  "lost",
];

const STAGE_META: Record<LeadStageKey, { label: string; className: string }> = {
  new: { label: "New", className: "bg-[#d4af37]/20 text-[#9c7a20]" },
  contacted: { label: "Contacted", className: "bg-sky-100 text-sky-800" },
  cant_quote: {
    label: "Can't Quote - Need Info",
    className: "bg-orange-100 text-orange-800",
  },
  quote_drafted: { label: "Quote Drafted", className: "bg-[#f0eee6] text-[#6b705c]" },
  quote_sent: { label: "Quote Sent", className: "bg-indigo-100 text-indigo-800" },
  quote_expired: { label: "Quote Expired", className: "bg-amber-100 text-amber-800" },
  quote_declined: { label: "Quote Declined", className: "bg-red-100 text-red-700" },
  won: { label: "Won", className: "bg-[#174734] text-white" },
  lost: { label: "Lost", className: "bg-red-100 text-red-700" },
};

export function stageLabel(key: LeadStageKey): string {
  return STAGE_META[key].label;
}

export function daysBetween(fromIso: string | null, now: Date): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

function agoText(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function latestBy(
  quotes: LeadQuoteInfo[],
  pick: (q: LeadQuoteInfo) => string | null
): LeadQuoteInfo | null {
  let best: LeadQuoteInfo | null = null;
  let bestTime = -Infinity;
  for (const quote of quotes) {
    const iso = pick(quote) ?? quote.created_at;
    const time = iso ? new Date(iso).getTime() : 0;
    if (!best || time >= bestTime) {
      best = quote;
      bestTime = time;
    }
  }
  return best;
}

function build(key: LeadStageKey, detail: string | null): LeadStage {
  return { key, ...STAGE_META[key], detail };
}

export function deriveLeadStage(
  rawStatus: string | null,
  quotes: LeadQuoteInfo[],
  now: Date = new Date()
): LeadStage {
  const manual = (rawStatus || "new").toLowerCase();

  const withDisplay = quotes
    .filter((q) => isQuoteStatus(q.status))
    .map((q) => ({
      quote: q,
      display: computeDisplayStatus(q.status as QuoteStatus, q.expires_at, now),
    }));

  const of = (status: QuoteStatus) =>
    withDisplay.filter((x) => x.display === status).map((x) => x.quote);

  const accepted = of("accepted");
  if (accepted.length > 0) {
    return build("won", "Quote accepted");
  }
  if (manual === "converted" || manual === "won") {
    return build("won", null);
  }
  if (manual === "lost" || manual === "dead") {
    return build("lost", null);
  }

  const sent = of("sent");
  if (sent.length > 0) {
    const latest = latestBy(sent, (q) => q.sent_at);
    const days = daysBetween(latest?.sent_at ?? latest?.created_at ?? null, now);
    const ago = agoText(days);
    return build("quote_sent", ago ? `Sent ${ago}, no response yet` : "No response yet");
  }

  if (manual === "needs_info") {
    return build("cant_quote", "Not enough info to send a quote");
  }

  const declined = of("declined");
  if (declined.length > 0) {
    return build("quote_declined", null);
  }

  const expired = of("expired");
  if (expired.length > 0) {
    return build("quote_expired", "Follow up or send a new quote");
  }

  if (of("draft").length > 0) {
    return build("quote_drafted", "Draft not sent yet");
  }

  if (manual === "contacted") {
    return build("contacted", null);
  }

  return build("new", null);
}

// True when a lead is waiting on staff to do something (drives the
// "needs attention" count): brand new, or a quote that's gone cold.
export function leadNeedsAttention(stage: LeadStage): boolean {
  return (
    stage.key === "new" ||
    stage.key === "quote_drafted" ||
    stage.key === "quote_expired"
  );
}
