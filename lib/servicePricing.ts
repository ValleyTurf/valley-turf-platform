// Pure helpers for the quote pricing calculator — kept free of
// lib/supabase-server.ts (same isolation rule as lib/quotes.ts /
// lib/permissionRules.ts) so this is trivially unit-testable and safe
// to import from a client component.
//
// Same preset range list as TurfSizeField.tsx's RANGE_OPTIONS and
// sync-turf-size's KNOWN_RANGE_OPTIONS — kept as a third literal copy
// rather than a shared import, per the same tradeoff sync-turf-size's
// comment already made explicit: one of those lives in a client
// component bundle, one is a server-only sync route, and duplicating a
// short constant list is simpler and safer than restructuring those
// boundaries just to share it.
export const TURF_SIZE_RANGES = [
  "<300",
  "300-500",
  "500-750",
  "750-1000",
  "1000-1250",
  "1250-1500",
  "1500-1750",
  "1750-2000",
  "2000-2250",
  "2250-2500",
  "2500-2750",
  "2750-3000",
  ">3000",
];

export type ServicePriceRow = {
  serviceName: string;
  turfSizeRange: string;
  price: number;
};

function normalizeServiceName(name: string): string {
  return name.trim().toLowerCase();
}

// Case-insensitive lookup — the New Quote form's service field and the
// pricing admin page's service names are both free text, so "Aeration"
// typed on one screen has to match "aeration" typed on the other.
export function findPrice(
  prices: ServicePriceRow[],
  serviceName: string,
  turfSizeRange: string
): number | null {
  const normalized = normalizeServiceName(serviceName);
  if (!normalized || !turfSizeRange) return null;

  const match = prices.find(
    (row) =>
      normalizeServiceName(row.serviceName) === normalized &&
      row.turfSizeRange === turfSizeRange
  );

  return match ? match.price : null;
}

// Map<serviceName, Map<turfSizeRange, price>> — the shape the pricing
// admin page renders one editable grid section per service from.
// Preserves the original (not lowercased) serviceName casing for
// display, keyed by the first spelling seen for that service.
export function groupByService(
  prices: ServicePriceRow[]
): Map<string, Map<string, number>> {
  const displayNameByKey = new Map<string, string>();
  const grouped = new Map<string, Map<string, number>>();

  for (const row of prices) {
    const key = normalizeServiceName(row.serviceName);
    if (!key) continue;

    if (!displayNameByKey.has(key)) {
      displayNameByKey.set(key, row.serviceName.trim());
    }

    const inner = grouped.get(key) ?? new Map<string, number>();
    inner.set(row.turfSizeRange, row.price);
    grouped.set(key, inner);
  }

  const result = new Map<string, Map<string, number>>();
  for (const [key, inner] of grouped) {
    result.set(displayNameByKey.get(key) ?? key, inner);
  }

  return result;
}

// Distinct service names for the New Quote form's service dropdown —
// sorted alphabetically, original casing preserved (first spelling
// seen wins, same as groupByService).
export function distinctServiceNames(prices: ServicePriceRow[]): string[] {
  return Array.from(groupByService(prices).keys()).sort((a, b) =>
    a.localeCompare(b)
  );
}
