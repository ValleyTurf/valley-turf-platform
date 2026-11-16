// Loads customers and finds likely duplicates (ROADMAP third top-10 list
// #8). Matching rules are in lib/duplicateCustomersLogic.ts; the merge
// itself is the merge_customers SQL function (migration 114).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  findDuplicatePairs,
  suggestKeeper,
  type ActivityCounts,
  type DupCustomer,
  type DupPair,
} from "@/lib/duplicateCustomersLogic";

const PAGE_SIZE = 1000;
const MAX_PAIRS_SHOWN = 60;

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  city: string | null;
  native_invoicing_enabled: boolean | null;
};

export type DuplicateReview = {
  pairs: (DupPair & { suggested: "a" | "b" })[];
  totalPairs: number;
  activity: Map<string, ActivityCounts>;
  stillOnJobber: Set<string>;
};

async function loadAllCustomers(): Promise<CustomerRow[]> {
  const rows: CustomerRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select(
        "jobber_client_id, full_name, email, phone, address_line_1, city, native_invoicing_enabled"
      )
      .order("jobber_client_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Couldn't read customers: ${error.message}`);

    const batch = (data ?? []) as CustomerRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function countByClient(
  table: "jobber_invoices" | "jobber_jobs",
  ids: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await supabaseServer
      .from(table)
      .select("jobber_client_id")
      .in("jobber_client_id", chunk)
      .limit(5000);

    for (const row of data ?? []) {
      const id = row.jobber_client_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return counts;
}

export async function loadDuplicateReview(): Promise<DuplicateReview> {
  const [customers, dismissals] = await Promise.all([
    loadAllCustomers(),
    supabaseServer.from("customer_duplicate_dismissals").select("pair_key"),
  ]);

  const dismissed = new Set((dismissals.data ?? []).map((row) => row.pair_key as string));

  const dupCustomers: DupCustomer[] = customers.map((row) => ({
    id: row.jobber_client_id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line_1,
    city: row.city,
  }));

  const allPairs = findDuplicatePairs(dupCustomers, dismissed);
  const shown = allPairs.slice(0, MAX_PAIRS_SHOWN);

  const ids = Array.from(new Set(shown.flatMap((pair) => [pair.a.id, pair.b.id])));

  const [invoiceCounts, jobCounts] = await Promise.all([
    countByClient("jobber_invoices", ids),
    countByClient("jobber_jobs", ids),
  ]);

  const activity = new Map<string, ActivityCounts>(
    ids.map((id) => [
      id,
      { invoices: invoiceCounts.get(id) ?? 0, jobs: jobCounts.get(id) ?? 0 },
    ])
  );

  const stillOnJobber = new Set(
    customers
      .filter((row) => row.native_invoicing_enabled === false)
      .map((row) => row.jobber_client_id)
  );

  return {
    pairs: shown.map((pair) => ({
      ...pair,
      suggested: suggestKeeper(pair.a, pair.b, activity),
    })),
    totalPairs: allPairs.length,
    activity,
    stillOnJobber,
  };
}
