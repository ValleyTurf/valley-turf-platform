// Pure logic for "how fast do we turn a new lead into a sent quote, and
// does speed change how often we win?" Clock time, not business hours:
// the timer runs from the moment the lead came in to the moment its
// first quote went out, nights and weekends included, because that is
// what the customer experiences. No database access, so it is tested.

export type QuoteTimingInput = {
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

// When the first quote actually went out for a lead. Drafts never count.
// Quotes sent before sent_at was recorded fall back to their created_at.
export function firstQuoteSentAt(quotes: QuoteTimingInput[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;

  for (const quote of quotes) {
    if (!quote.status || quote.status === "draft") continue;

    const iso = quote.sent_at ?? quote.created_at;
    if (!iso) continue;

    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) continue;

    if (best === null || time < best) {
      best = time;
      bestIso = iso;
    }
  }

  return bestIso;
}

export function elapsedMinutes(fromIso: string, toIso: string | Date): number | null {
  const from = new Date(fromIso).getTime();
  const to = (toIso instanceof Date ? toIso : new Date(toIso)).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  return Math.max(0, Math.round((to - from) / 60_000));
}

// 25 -> "25 min", 200 -> "3 h 20 min", 3000 -> "2 d 2 h".
export function formatDuration(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;

  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }

  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

export type SpeedBucketKey = "under_1h" | "1_to_4h" | "4_to_24h" | "over_24h";

export const SPEED_BUCKETS: { key: SpeedBucketKey; label: string; upToMinutes: number }[] = [
  { key: "under_1h", label: "Under 1 hour", upToMinutes: 60 },
  { key: "1_to_4h", label: "1 to 4 hours", upToMinutes: 4 * 60 },
  { key: "4_to_24h", label: "4 to 24 hours", upToMinutes: 24 * 60 },
  { key: "over_24h", label: "Over 24 hours", upToMinutes: Infinity },
];

export function speedBucket(minutes: number): SpeedBucketKey {
  for (const bucket of SPEED_BUCKETS) {
    if (minutes < bucket.upToMinutes) return bucket.key;
  }
  return "over_24h";
}

export type SpeedLead = {
  createdAt: string;
  firstQuoteSentAt: string | null;
  accepted: boolean;
  // True when the lead is still owed a quote (not lost, not "can't quote").
  waiting: boolean;
};

export type QuoteSpeedSummary = {
  quotedCount: number;
  medianMinutes: number | null;
  within1hPercent: number | null;
  within24hPercent: number | null;
  buckets: {
    key: SpeedBucketKey;
    label: string;
    quoted: number;
    accepted: number;
    closeRatePercent: number | null;
    smallSample: boolean;
  }[];
  waitingCount: number;
  waitingOver24h: number;
  oldestWaitingMinutes: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export function summarizeQuoteSpeed(
  leads: SpeedLead[],
  now: Date = new Date()
): QuoteSpeedSummary {
  const minutesList: number[] = [];
  const bucketCounts = new Map<SpeedBucketKey, { quoted: number; accepted: number }>();

  for (const bucket of SPEED_BUCKETS) {
    bucketCounts.set(bucket.key, { quoted: 0, accepted: 0 });
  }

  let waitingCount = 0;
  let waitingOver24h = 0;
  let oldestWaiting: number | null = null;

  for (const lead of leads) {
    if (lead.firstQuoteSentAt) {
      const minutes = elapsedMinutes(lead.createdAt, lead.firstQuoteSentAt);
      if (minutes === null) continue;

      minutesList.push(minutes);
      const entry = bucketCounts.get(speedBucket(minutes))!;
      entry.quoted += 1;
      if (lead.accepted) entry.accepted += 1;
    } else if (lead.waiting) {
      const minutes = elapsedMinutes(lead.createdAt, now);
      if (minutes === null) continue;

      waitingCount += 1;
      if (minutes >= 24 * 60) waitingOver24h += 1;
      if (oldestWaiting === null || minutes > oldestWaiting) oldestWaiting = minutes;
    }
  }

  return {
    quotedCount: minutesList.length,
    medianMinutes: median(minutesList),
    within1hPercent: percent(minutesList.filter((m) => m < 60).length, minutesList.length),
    within24hPercent: percent(
      minutesList.filter((m) => m < 24 * 60).length,
      minutesList.length
    ),
    buckets: SPEED_BUCKETS.map((bucket) => {
      const entry = bucketCounts.get(bucket.key)!;
      return {
        key: bucket.key,
        label: bucket.label,
        quoted: entry.quoted,
        accepted: entry.accepted,
        closeRatePercent: percent(entry.accepted, entry.quoted),
        smallSample: entry.quoted < 5,
      };
    }),
    waitingCount,
    waitingOver24h,
    oldestWaitingMinutes: oldestWaiting,
  };
}
