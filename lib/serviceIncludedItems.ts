// Pure helpers for the "What's Included" catalog (service_included_items,
// 082_add_quote_turf_size_and_included_items.sql) -- kept free of
// lib/supabase-server.ts, same isolation rule as lib/servicePricing.ts,
// which this deliberately mirrors closely.
//
// Items are keyed by service_name alone, not turf size -- the bullet
// list for "Full Cleaning" doesn't change between a 300 sq ft yard and
// a 2000 sq ft yard, only the price does (that's what service_pricing
// already covers).

export type IncludedItemRow = {
  serviceName: string;
  item: string;
  sortOrder: number;
};

function normalizeServiceName(name: string): string {
  return name.trim().toLowerCase();
}

// Case-insensitive lookup -- same reasoning as findPrice() in
// lib/servicePricing.ts: the New Quote form's service field and the
// pricing admin page's service names are both free text, so "full
// cleaning" typed on one screen has to match "Full Cleaning" typed on
// the other.
export function findIncludedItems(
  rows: IncludedItemRow[],
  serviceName: string
): string[] {
  const normalized = normalizeServiceName(serviceName);
  if (!normalized) return [];

  return rows
    .filter((row) => normalizeServiceName(row.serviceName) === normalized)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => row.item);
}

// Map<serviceName, item[]> -- the shape the pricing admin page's
// "What's Included" section renders one editable list per service
// from. Same "first spelling seen wins" display-casing convention as
// groupByService() in lib/servicePricing.ts.
export function groupIncludedItems(
  rows: IncludedItemRow[]
): Map<string, string[]> {
  const displayNameByKey = new Map<string, string>();
  const grouped = new Map<string, string[]>();

  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const row of sorted) {
    const key = normalizeServiceName(row.serviceName);
    if (!key) continue;

    if (!displayNameByKey.has(key)) {
      displayNameByKey.set(key, row.serviceName.trim());
    }

    const list = grouped.get(key) ?? [];
    list.push(row.item);
    grouped.set(key, list);
  }

  const result = new Map<string, string[]>();
  for (const [key, items] of grouped) {
    result.set(displayNameByKey.get(key) ?? key, items);
  }

  return result;
}
