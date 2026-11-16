// Pure logic for finding customers who are probably the same person
// entered twice (lib/duplicateCustomers.ts loads the data). Pairs, not
// groups, so a merge is always a clear "keep this one, fold that one in".

export type DupCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
};

export type DupReason = "phone" | "email" | "name_address";

export type DupPair = {
  a: DupCustomer;
  b: DupCustomer;
  reasons: DupReason[];
  // "high": same name and address, or two matching details. "possible":
  // one shared detail with different names (spouses, a property
  // manager's office line).
  confidence: "high" | "possible";
  key: string;
};

export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export function normalizeName(value: string | null | undefined): string | null {
  const name = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.length >= 3 ? name : null;
}

const STREET_WORDS: Record<string, string> = {
  street: "st",
  avenue: "ave",
  drive: "dr",
  road: "rd",
  lane: "ln",
  court: "ct",
  circle: "cir",
  boulevard: "blvd",
  place: "pl",
  way: "way",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

export function normalizeAddress(value: string | null | undefined): string | null {
  const words = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STREET_WORDS[word] ?? word);
  const text = words.join(" ");
  return text.length >= 5 && /\d/.test(text) ? text : null;
}

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

// A phone or email shared by this many customers or more is a business
// line or a placeholder, not a duplicate signal.
const MAX_BUCKET = 6;

export function findDuplicatePairs(
  customers: DupCustomer[],
  dismissedKeys: Set<string>
): DupPair[] {
  const buckets = new Map<string, { reason: DupReason; ids: string[] }>();
  const byId = new Map(customers.map((c) => [c.id, c]));

  function add(reason: DupReason, value: string | null, id: string) {
    if (!value) return;
    const bucketKey = `${reason}:${value}`;
    const bucket = buckets.get(bucketKey) ?? { reason, ids: [] };
    bucket.ids.push(id);
    buckets.set(bucketKey, bucket);
  }

  for (const customer of customers) {
    add("phone", normalizePhone(customer.phone), customer.id);
    add("email", normalizeEmail(customer.email), customer.id);

    const name = normalizeName(customer.name);
    const address = normalizeAddress(customer.addressLine1);
    if (name && address) add("name_address", `${name}@${address}`, customer.id);
  }

  const reasonsByPair = new Map<string, Set<DupReason>>();

  for (const bucket of buckets.values()) {
    if (bucket.ids.length < 2 || bucket.ids.length > MAX_BUCKET) continue;

    for (let i = 0; i < bucket.ids.length; i++) {
      for (let j = i + 1; j < bucket.ids.length; j++) {
        const key = pairKey(bucket.ids[i], bucket.ids[j]);
        const set = reasonsByPair.get(key) ?? new Set<DupReason>();
        set.add(bucket.reason);
        reasonsByPair.set(key, set);
      }
    }
  }

  const pairs: DupPair[] = [];

  for (const [key, reasonSet] of reasonsByPair) {
    if (dismissedKeys.has(key)) continue;

    const [idA, idB] = key.split("|");
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (!a || !b) continue;

    const reasons = Array.from(reasonSet);
    const sameName =
      normalizeName(a.name) !== null && normalizeName(a.name) === normalizeName(b.name);
    const high = reasons.includes("name_address") || reasons.length >= 2 || sameName;

    pairs.push({
      a,
      b,
      reasons,
      confidence: high ? "high" : "possible",
      key,
    });
  }

  pairs.sort((x, y) => {
    if (x.confidence !== y.confidence) return x.confidence === "high" ? -1 : 1;
    if (x.reasons.length !== y.reasons.length) return y.reasons.length - x.reasons.length;
    return (x.a.name ?? "").localeCompare(y.a.name ?? "");
  });

  return pairs;
}

export function describeReasons(reasons: DupReason[]): string {
  const labels: Record<DupReason, string> = {
    phone: "same phone",
    email: "same email",
    name_address: "same name and address",
  };
  return reasons.map((r) => labels[r]).join(", ");
}

export type ActivityCounts = { invoices: number; jobs: number };

// Which of the two to keep by default: the one with more history, then
// the one that already has contact details, then the lower id.
export function suggestKeeper(
  a: DupCustomer,
  b: DupCustomer,
  activity: Map<string, ActivityCounts>
): "a" | "b" {
  const score = (c: DupCustomer) => {
    const counts = activity.get(c.id);
    return (counts?.invoices ?? 0) * 2 + (counts?.jobs ?? 0);
  };

  if (score(a) !== score(b)) return score(a) > score(b) ? "a" : "b";

  const detail = (c: DupCustomer) =>
    (c.email ? 1 : 0) + (c.phone ? 1 : 0) + (c.addressLine1 ? 1 : 0);

  if (detail(a) !== detail(b)) return detail(a) > detail(b) ? "a" : "b";

  return a.id <= b.id ? "a" : "b";
}
