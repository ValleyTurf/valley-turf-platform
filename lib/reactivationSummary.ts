import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import {
  daysBetweenDateStrings,
  hasWonBackSince,
  isActiveWorkflowStatus,
  isDueToday,
  isOverdue,
  isReactivationCandidate,
  isUpcoming,
  normalizeReactivationStatus,
  type ReactivationStatus,
} from "@/lib/reactivation";

// Same "fetch everything, compute the pipeline, report the top-line
// numbers" logic app/(platform)/reactivation/page.tsx already runs --
// pulled out here so the AI Copilot and the Command Center dashboard can
// get the same headline stats (candidates / contacted / scheduled /
// data-confirmed win-back rate) without duplicating that page's fetch +
// filter logic a second time. The page itself keeps its own copy for now
// since it additionally needs the full per-customer bucket breakdown and
// follow-up lists this summary doesn't -- see that page's comments for
// why the candidate rule and win-back check work the way they do.

export type ReactivationPipelineSummary = {
  totalInPipeline: number;
  candidates: number;
  contacted: number;
  followUps: number;
  scheduled: number;
  everContacted: number;
  wonBack: number;
  winBackRate: number;
  overdueFollowUps: number;
  dueTodayFollowUps: number;
  upcomingFollowUps: number;
};

type CustomerRow = {
  id: string;
  jobber_client_id: string | null;
  reactivation_status: string | null;
  reactivation_last_contacted_at: string | null;
  reactivation_next_follow_up_at: string | null;
};

type InvoiceRow = {
  jobber_client_id: string | null;
  issue_date: string | null;
};

type RecurringServiceRow = {
  jobber_client_id: string | null;
  is_recurring_service: boolean | null;
};

async function fetchAllCustomers(): Promise<CustomerRow[]> {
  const rows: CustomerRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select(
        "id, jobber_client_id, reactivation_status, reactivation_last_contacted_at, reactivation_next_follow_up_at"
      )
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as CustomerRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchAllInvoices(): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select("jobber_client_id, issue_date")
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as InvoiceRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchRecurringClientIds(): Promise<Set<string>> {
  const rows: RecurringServiceRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("job_service_category")
      .select("jobber_client_id, is_recurring_service")
      .eq("is_recurring_service", true)
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as RecurringServiceRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return new Set(
    rows
      .filter((row) => row.is_recurring_service && row.jobber_client_id)
      .map((row) => row.jobber_client_id as string)
  );
}

async function fetchExcludedClientIds(): Promise<Set<string>> {
  const { data, error } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .select("jobber_client_id")
    .eq("exclusion_type", "reactivation");

  if (error) throw error;

  return new Set((data ?? []).map((row) => row.jobber_client_id as string));
}

export async function getReactivationPipelineSummary(): Promise<ReactivationPipelineSummary> {
  const [allCustomers, invoices, recurringClientIds, excludedClientIds] =
    await Promise.all([
      fetchAllCustomers(),
      fetchAllInvoices(),
      fetchRecurringClientIds(),
      fetchExcludedClientIds(),
    ]);

  const invoicesByClient = new Map<string, string[]>();
  for (const invoice of invoices) {
    if (!invoice.jobber_client_id || !invoice.issue_date) continue;
    const existing = invoicesByClient.get(invoice.jobber_client_id) ?? [];
    existing.push(invoice.issue_date);
    invoicesByClient.set(invoice.jobber_client_id, existing);
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  let totalInPipeline = 0;
  let candidates = 0;
  let contacted = 0;
  let followUps = 0;
  let scheduled = 0;
  let everContacted = 0;
  let wonBack = 0;
  let overdueFollowUps = 0;
  let dueTodayFollowUps = 0;
  let upcomingFollowUps = 0;

  for (const customer of allCustomers) {
    const clientId = customer.jobber_client_id;
    if (!clientId) continue;
    if (recurringClientIds.has(clientId)) continue;
    if (excludedClientIds.has(clientId)) continue;

    const status: ReactivationStatus = normalizeReactivationStatus(
      customer.reactivation_status
    );
    if (status === "removed") continue;

    const invoiceDates = invoicesByClient.get(clientId) ?? [];
    const latestInvoiceDate =
      invoiceDates.length > 0
        ? invoiceDates.reduce((a, b) => (a > b ? a : b))
        : null;
    const daysSinceLastInvoice = latestInvoiceDate
      ? daysBetweenDateStrings(latestInvoiceDate, today)
      : null;

    const inPipeline =
      isReactivationCandidate({
        invoiceCount: invoiceDates.length,
        daysSinceLastInvoice,
        isRecurring: false,
        isExcluded: false,
      }) || isActiveWorkflowStatus(status);

    if (!inPipeline) continue;

    totalInPipeline += 1;
    if (status === "candidate") candidates += 1;
    if (status === "contacted_email" || status === "contacted_text") {
      contacted += 1;
    }
    if (status === "follow_up_3mo" || status === "follow_up_6mo") {
      followUps += 1;
    }
    if (status === "scheduled") scheduled += 1;

    if (customer.reactivation_last_contacted_at !== null) {
      everContacted += 1;
      if (hasWonBackSince(customer.reactivation_last_contacted_at, invoiceDates)) {
        wonBack += 1;
      }
    }

    const nextFollowUpAt = customer.reactivation_next_follow_up_at;
    if (isOverdue(nextFollowUpAt, now)) overdueFollowUps += 1;
    if (isDueToday(nextFollowUpAt, now)) dueTodayFollowUps += 1;
    if (isUpcoming(nextFollowUpAt, now)) upcomingFollowUps += 1;
  }

  return {
    totalInPipeline,
    candidates,
    contacted,
    followUps,
    scheduled,
    everContacted,
    wonBack,
    winBackRate: everContacted > 0 ? wonBack / everContacted : 0,
    overdueFollowUps,
    dueTodayFollowUps,
    upcomingFollowUps,
  };
}
