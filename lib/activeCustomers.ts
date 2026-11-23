// "Active" customer = on a recurring service, or invoiced in roughly the
// last six months. Shared by the invoicing routing page and the native
// migration page so both agree on who is worth looking at.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export const ACTIVE_WINDOW_DAYS = 182; // ~6 months

type RecurringRow = { jobber_client_id: string | null };
type InvoiceDateRow = { jobber_client_id: string | null; issue_date: string | null };

// Paginated range loop (a plain .select() caps at Supabase's 1000 rows).
export async function fetchRecurringClientIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("job_service_category")
      .select("jobber_client_id")
      .eq("is_recurring_service", true)
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed reading job_service_category: ${error.message}`);

    const batch = (data ?? []) as RecurringRow[];
    for (const row of batch) {
      if (row.jobber_client_id) ids.add(row.jobber_client_id);
    }

    if (batch.length < pageSize) break;
  }

  return ids;
}

// Most recent invoice issue_date per client, a stand-in for "last service".
export async function fetchLastInvoiceDateByClient(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select("jobber_client_id, issue_date")
      .not("jobber_client_id", "is", null)
      .not("issue_date", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed reading invoice_financials: ${error.message}`);

    const batch = (data ?? []) as InvoiceDateRow[];
    for (const row of batch) {
      if (!row.jobber_client_id || !row.issue_date) continue;
      const existing = map.get(row.jobber_client_id);
      if (!existing || row.issue_date > existing) {
        map.set(row.jobber_client_id, row.issue_date);
      }
    }

    if (batch.length < pageSize) break;
  }

  return map;
}

export function daysSince(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}
