export const dynamic = "force-dynamic";
export const revalidate = 0;

// Rebuilt 2026-09-25 per Ryan's ask: drop the Customers/Campaigns/scan
// counts that didn't earn their spot, make Outstanding and Leads expand
// in place (no new pages -- just who owes what and how much, no aging),
// combine the three scan counts into one tile, and add a Revenue
// Pipeline / Job Mix / Requests & Quotes picture of the business that
// wasn't here before. Approved as a Design-canvas mockup first
// (https://claude.ai/artifact/RmXa7rtrh5oej3n7vwhfXw) before this build.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency, formatNumber, formatPercent, toNumber } from "@/lib/format";
import { computeDisplayStatus, type QuoteStatus } from "@/lib/quotes";
import DashboardTopRow, {
  type LeadItem,
  type OutstandingInvoiceItem,
} from "@/app/components/dashboard/DashboardTopRow";

const PHOENIX_TIME_ZONE = "America/Phoenix";
const WEEK_BAR_MAX_HEIGHT = 140;

type DashboardData = {
  outstandingTotal: number;
  outstandingCount: number;
  outstandingInvoices: OutstandingInvoiceItem[];
  leadsThisMonth: LeadItem[];
  leadsThisMonthCount: number;
  leadsThisWeekCount: number;
  revenueThisMonth: number;
  revenueLastMonthToDate: number;
  newCustomersThisMonth: number;
  scansToday: number;
  scansWeek: number;
  scansMtd: number;
  scheduledTodayTotal: number;
  scheduledTodayCount: number;
  scheduledMonthTotal: number;
  scheduledMonthCount: number;
  oneOffJobCount: number;
  oneOffTotal: number;
  oneOffPercent: number;
  recurringVisitCount: number;
  recurringTotal: number;
  recurringPercent: number;
  avgJobValueOverall: number;
  avgJobValueOneOff: number;
  avgJobValueRecurring: number;
  weekBars: { label: string; rangeLabel: string; total: number; height: number }[];
  quotesThisWeekCount: number;
  quotesThisMonthCount: number;
  quotesThisMonthValue: number;
  quotesAwaitingResponse: number;
  quoteAcceptanceRate: number | null;
};

function getPhoenixDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 0),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
    day: Number(parts.find((part) => part.type === "day")?.value ?? 1),
  };
}

function getPhoenixStartOfDayUtc(date = new Date()): Date {
  const { year, month, day } = getPhoenixDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 7, 0, 0, 0));
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatLeadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRevenueComparison(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "No change" : "New";
  }

  const change = (current - previous) / previous;

  if (change > 0) return `↑ ${Math.round(change * 100)}%`;
  if (change < 0) return `↓ ${Math.round(Math.abs(change) * 100)}%`;

  return "No change";
}

// ---------------------------------------------------------------------
// Outstanding -- the whole outstanding_invoices view (customer + amount
// only; Ryan doesn't want days-past-due here), sorted largest first so
// the expand panel reads as a collection list.
// ---------------------------------------------------------------------
type OutstandingRow = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  outstanding_balance: number | string;
};

async function fetchOutstandingInvoices(): Promise<OutstandingRow[]> {
  const { data, error } = await supabaseServer
    .from("outstanding_invoices")
    .select("jobber_invoice_id, jobber_client_id, customer_name, invoice_number, outstanding_balance")
    .order("outstanding_balance", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as OutstandingRow[];
  if (rows.length === 0) return rows;

  // Tyson Lane (Ryan, first flagged 2026-09-20, still present 2026-09-25):
  // the outstanding_invoices view computes its balance from invoiced total
  // minus actual jobber_payments rows, never from the invoice's own status
  // column. debug-outstanding-check2 confirmed his $5 invoice has
  // jobber_invoices.status = "paid" but zero synced payment rows -- some
  // path in Jobber marked it paid without ever emitting a payment record
  // we captured, so the view has shown a phantom balance for it ever
  // since. jobber_invoices.status is the trustworthy source for "is this
  // actually paid"; cross-check against it here so any invoice Jobber
  // already considers paid can't get stuck showing as outstanding, no
  // matter what the view's own payment-sum math thinks.
  const invoiceIds = rows.map((row) => row.jobber_invoice_id);
  const { data: statusRows, error: statusError } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, status")
    .in("jobber_invoice_id", invoiceIds);
  if (statusError) throw statusError;

  const paidInvoiceIds = new Set(
    (statusRows ?? [])
      .filter((row: { status: string | null }) => row.status === "paid")
      .map((row: { jobber_invoice_id: string }) => row.jobber_invoice_id)
  );

  return rows.filter((row) => !paidInvoiceIds.has(row.jobber_invoice_id));
}

// ---------------------------------------------------------------------
// Leads created this month -- same set the KPI count is drawn from, so
// the number on the tile and the list in the panel never disagree.
// ---------------------------------------------------------------------
type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  city: string | null;
  created_at: string;
};

async function fetchLeadsSince(sinceIso: string): Promise<LeadRow[]> {
  const { data, error } = await supabaseServer
    .from("leads")
    .select("id, first_name, last_name, source, city, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as LeadRow[];
}

// This-month-to-date vs the same number of days into last month, so a
// snapshot taken on the 5th doesn't compare against a full prior month.
async function fetchMonthlyRevenue(): Promise<{
  thisMonth: number;
  lastMonthToDate: number;
}> {
  const { year, month, day } = getPhoenixDateParts();

  const thisMonthStart = formatDateInput(new Date(Date.UTC(year, month - 1, 1)));
  const today = formatDateInput(new Date(Date.UTC(year, month - 1, day)));
  const lastMonthStart = formatDateInput(new Date(Date.UTC(year, month - 2, 1)));
  const lastMonthSameDay = formatDateInput(new Date(Date.UTC(year, month - 2, day)));

  const [thisMonthResult, lastMonthResult] = await Promise.all([
    supabaseServer
      .from("invoice_financials")
      .select("invoice_total")
      .gte("issue_date", thisMonthStart)
      .lte("issue_date", today),
    supabaseServer
      .from("invoice_financials")
      .select("invoice_total")
      .gte("issue_date", lastMonthStart)
      .lte("issue_date", lastMonthSameDay),
  ]);

  if (thisMonthResult.error) throw thisMonthResult.error;
  if (lastMonthResult.error) throw lastMonthResult.error;

  const sum = (rows: { invoice_total: number | string }[] | null) =>
    (rows ?? []).reduce((total, row) => total + toNumber(row.invoice_total), 0);

  return {
    thisMonth: sum(thisMonthResult.data),
    lastMonthToDate: sum(lastMonthResult.data),
  };
}

// New customers this month -- customer_financials.first_invoice_date
// (their first real payment activity), not customers.created_at. That
// column got mass-backfilled to a single date when it was added and
// only reflects "when this app first synced them," not when they
// actually became a customer, so it's not a reliable "new" signal.
async function fetchNewCustomersThisMonth(): Promise<number> {
  const { year, month, day } = getPhoenixDateParts();
  const monthStart = formatDateInput(new Date(Date.UTC(year, month - 1, 1)));
  const today = formatDateInput(new Date(Date.UTC(year, month - 1, day)));

  const { data, error } = await supabaseServer
    .from("customer_financials")
    .select("jobber_client_id")
    .gte("first_invoice_date", monthStart)
    .lte("first_invoice_date", today);

  if (error) throw error;
  return (data ?? []).length;
}

// ---------------------------------------------------------------------
// Revenue Pipeline / Job Mix / weekly bars all come out of the same
// pass over this month's visits, so it's one query instead of four.
// ---------------------------------------------------------------------
type MonthVisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  start_at: string | null;
  price_override: number | string | null;
  jobber_invoice_id: string | null;
  invoice_dismissed_at: string | null;
};

async function fetchMonthVisits(monthStart: Date, monthEnd: Date): Promise<MonthVisitRow[]> {
  const rows: MonthVisitRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, start_at, price_override, jobber_invoice_id, invoice_dismissed_at"
      )
      .gte("start_at", monthStart.toISOString())
      .lt("start_at", monthEnd.toISOString())
      // Ashlye Carll (Ryan, 2026-09-25): "Scheduled Today" showed $230 for
      // a visit whose job had been archived in Jobber -- it was never
      // going to be invoiced, just an orphaned visit row left behind.
      // Every other page that reads jobber_visits for "what's actually
      // happening" (schedule, my-day, crew-status, customers/[id]) already
      // excludes archived jobs with this exact filter -- see
      // 051_add_job_status_to_visits.sql. This was the one place that
      // still read raw, unfiltered visits. Written as an .or() (not a
      // plain .neq()) so a visit not yet backfilled with a job_status at
      // all isn't silently dropped, and completed_at.not.is.null keeps a
      // one-off job's visit that legitimately finished before Jobber
      // auto-archived the job behind it.
      .or("job_status.is.null,job_status.neq.archived,completed_at.not.is.null")
      .order("start_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as MonthVisitRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

// jobber_jobs.total is the authoritative per-occurrence price for a job
// (the same column every other report/dashboard reads) -- deliberately
// NOT lib/jobberJob.ts's fetchJobDetails, which live-calls the Jobber
// API per Jobber-sourced job and would be far too slow across a whole
// month of jobs.
async function fetchJobTotals(jobIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (jobIds.length === 0) return map;

  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const { data, error } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, total")
      .in("jobber_job_id", batch);

    if (error) throw error;

    for (const row of (data ?? []) as { jobber_job_id: string; total: number | string | null }[]) {
      map.set(row.jobber_job_id, toNumber(row.total));
    }
  }

  return map;
}

async function fetchRecurringJobIds(jobIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (jobIds.length === 0) return set;

  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const { data, error } = await supabaseServer
      .from("job_service_category")
      .select("jobber_job_id")
      .in("jobber_job_id", batch)
      .eq("is_recurring_service", true);

    if (error) throw error;

    for (const row of (data ?? []) as { jobber_job_id: string }[]) {
      set.add(row.jobber_job_id);
    }
  }

  return set;
}

// Ryan (2026-09-25): "All of those people have paid, you are still missing
// things." Confirmed against real data -- 35 of the 40 visits flagged as
// "unbilled" belong to customers still on Jobber invoicing
// (customers.native_invoicing_enabled = false, migration 048), not native
// invoicing. Jobber bills and collects for those customers on its own
// schedule, completely independent of this app's per-visit jobber_visits
// row -- confirmed by migration 078's own header: for some of these exact
// customers (Darcy Wearing, Patricia Bach, Dawn Kamal, all three flagged
// here too) Jobber's own Invoice.visits connection links the invoice back
// to the WRONG visit, a Jobber-side data issue this app can't infer its
// way around. A visit whose customer isn't on native invoicing should
// never be counted as "unbilled" here -- jobber_invoice_id simply isn't a
// meaningful signal for them, and their real billing status already lives
// in jobber_invoices, synced separately. Defaults to false (excluded) for
// any customer never evaluated, matching the column's own db default.
async function fetchNativeInvoicingByClient(clientIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (clientIds.length === 0) return map;

  for (let i = 0; i < clientIds.length; i += 500) {
    const batch = clientIds.slice(i, i + 500);
    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, native_invoicing_enabled")
      .in("jobber_client_id", batch);

    if (error) throw error;

    for (const row of (data ?? []) as {
      jobber_client_id: string;
      native_invoicing_enabled: boolean | null;
    }[]) {
      map.set(row.jobber_client_id, row.native_invoicing_enabled === true);
    }
  }

  return map;
}

type QuoteRow = {
  status: string;
  price_total: number | string | null;
  expires_at: string | null;
  created_at: string;
};

async function fetchQuotesSince(sinceIso: string): Promise<QuoteRow[]> {
  const { data, error } = await supabaseServer
    .from("quotes")
    .select("status, price_total, expires_at, created_at")
    .gte("created_at", sinceIso);

  if (error) throw error;
  return (data ?? []) as QuoteRow[];
}

async function fetchQuotesAwaitingResponse(): Promise<number> {
  // "Awaiting response" is a current snapshot, not scoped to this month
  // -- a quote sent last month and still unanswered still counts.
  const { data, error } = await supabaseServer
    .from("quotes")
    .select("status, expires_at")
    .eq("status", "sent");

  if (error) throw error;

  const rows = (data ?? []) as { status: string; expires_at: string | null }[];
  return rows.filter(
    (row) => computeDisplayStatus(row.status as QuoteStatus, row.expires_at) === "sent"
  ).length;
}

async function getDashboardData(): Promise<DashboardData> {
  const phoenixTodayStart = getPhoenixStartOfDayUtc();
  const phoenixTodayEnd = new Date(phoenixTodayStart.getTime() + 24 * 60 * 60 * 1000);

  const phoenixWeekStart = new Date(phoenixTodayStart);
  phoenixWeekStart.setUTCDate(phoenixWeekStart.getUTCDate() - 7);

  const { year, month } = getPhoenixDateParts();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const phoenixMonthStart = new Date(Date.UTC(year, month - 1, 1, 7, 0, 0, 0));
  const phoenixMonthEnd = new Date(Date.UTC(year, month, 1, 7, 0, 0, 0));

  const [
    scansTodayResult,
    scansWeekResult,
    scansMtdResult,
    outstandingInvoices,
    leadsThisMonth,
    monthlyRevenue,
    newCustomersThisMonth,
    monthVisits,
    quotesThisMonth,
    quotesAwaitingResponse,
  ] = await Promise.all([
    supabaseServer
      .from("scans")
      .select("*", { count: "exact", head: true })
      .gte("scanned_at", phoenixTodayStart.toISOString()),
    supabaseServer
      .from("scans")
      .select("*", { count: "exact", head: true })
      .gte("scanned_at", phoenixWeekStart.toISOString()),
    supabaseServer
      .from("scans")
      .select("*", { count: "exact", head: true })
      .gte("scanned_at", phoenixMonthStart.toISOString()),
    fetchOutstandingInvoices(),
    fetchLeadsSince(phoenixMonthStart.toISOString()),
    fetchMonthlyRevenue(),
    fetchNewCustomersThisMonth(),
    fetchMonthVisits(phoenixMonthStart, phoenixMonthEnd),
    fetchQuotesSince(phoenixMonthStart.toISOString()),
    fetchQuotesAwaitingResponse(),
  ]);

  if (scansTodayResult.error) throw scansTodayResult.error;
  if (scansWeekResult.error) throw scansWeekResult.error;
  if (scansMtdResult.error) throw scansMtdResult.error;

  // --- Revenue Pipeline / Job Mix / weekly bars, one pass over the
  // month's visits -----------------------------------------------------
  const jobIds = Array.from(
    new Set(monthVisits.map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id)))
  );
  const clientIds = Array.from(
    new Set(monthVisits.map((v) => v.jobber_client_id).filter((id): id is string => Boolean(id)))
  );

  const [jobTotals, recurringJobIds, nativeInvoicingByClient] = await Promise.all([
    fetchJobTotals(jobIds),
    fetchRecurringJobIds(jobIds),
    fetchNativeInvoicingByClient(clientIds),
  ]);

  function resolveVisitValue(visit: MonthVisitRow): number {
    if (visit.price_override != null) return toNumber(visit.price_override);
    if (!visit.jobber_job_id) return 0;
    return jobTotals.get(visit.jobber_job_id) ?? 0;
  }

  let scheduledTodayTotal = 0;
  let scheduledTodayCount = 0;
  let scheduledMonthTotal = 0;
  let scheduledMonthCount = 0;
  let oneOffTotal = 0;
  let oneOffVisitCount = 0;
  const oneOffJobIds = new Set<string>();
  let recurringTotal = 0;
  let recurringVisitCount = 0;
  const weekTotals = [0, 0, 0, 0, 0];

  for (const visit of monthVisits) {
    const value = resolveVisitValue(visit);
    const isRecurring = visit.jobber_job_id ? recurringJobIds.has(visit.jobber_job_id) : false;

    if (isRecurring) {
      recurringTotal += value;
      recurringVisitCount += 1;
    } else {
      oneOffTotal += value;
      oneOffVisitCount += 1;
      if (visit.jobber_job_id) oneOffJobIds.add(visit.jobber_job_id);
    }

    // Only count a visit as "unbilled" when its customer is actually on
    // native invoicing -- see fetchNativeInvoicingByClient's header for
    // why jobber_invoice_id can't be trusted for anyone still on Jobber
    // invoicing. invoice_dismissed_at (migration 078) is staff manually
    // saying "this one's already invoiced and paid in Jobber, its link is
    // just wrong" -- same exclusion for the same underlying reason.
    const isNativelyInvoiced =
      visit.jobber_client_id != null && nativeInvoicingByClient.get(visit.jobber_client_id) === true;

    if (visit.jobber_invoice_id == null && visit.invoice_dismissed_at == null && isNativelyInvoiced) {
      scheduledMonthTotal += value;
      scheduledMonthCount += 1;

      if (visit.start_at) {
        const startDate = new Date(visit.start_at);
        if (startDate >= phoenixTodayStart && startDate < phoenixTodayEnd) {
          scheduledTodayTotal += value;
          scheduledTodayCount += 1;
        }
      }

      // Ryan (2026-09-25): "Scheduled job value by week is still showing
      // the inflated numbers." This bar chart summed EVERY visit's value
      // by week regardless of billing status -- the exact same bug that
      // inflated "Scheduled This Month" before the native-invoicing fix
      // above, just never carried over to this chart. It shares the
      // "Scheduled ..." name with that fixed tile, so it should share its
      // definition too: only visits that are actually unbilled pipeline
      // (native invoicing, not yet invoiced, not dismissed), same as
      // scheduledMonthTotal. This is deliberately narrower than Job Mix's
      // totals just above, which intentionally include every visit
      // regardless of billing status to show total work performed.
      if (visit.start_at) {
        const day = getPhoenixDateParts(new Date(visit.start_at)).day;
        const bucket = Math.min(4, Math.floor((day - 1) / 7));
        weekTotals[bucket] += value;
      }
    }
  }

  const totalVisitCount = monthVisits.length;
  const totalScheduledValue = oneOffTotal + recurringTotal;
  const avgJobValueOverall = totalVisitCount > 0 ? totalScheduledValue / totalVisitCount : 0;
  const avgJobValueOneOff = oneOffVisitCount > 0 ? oneOffTotal / oneOffVisitCount : 0;
  const avgJobValueRecurring = recurringVisitCount > 0 ? recurringTotal / recurringVisitCount : 0;

  // Same one-off-jobs-vs-recurring-visits basis the Job Mix bars already
  // use for their widths (Ryan, 2026-09-25: wants the split shown as an
  // actual percentage, not just implied by bar width).
  const jobMixTotalCount = oneOffJobCount + recurringVisitCount;
  const oneOffPercent = jobMixTotalCount > 0 ? Math.round((oneOffJobCount / jobMixTotalCount) * 100) : 0;
  const recurringPercent = jobMixTotalCount > 0 ? 100 - oneOffPercent : 0;

  const weekRanges: [number, number][] = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, 28],
    [29, daysInMonth],
  ];
  const maxWeekTotal = Math.max(...weekTotals, 1);
  const weekBars = weekRanges
    .map(([start, end], index) => ({
      label: `Wk ${index + 1}`,
      rangeLabel: start <= daysInMonth ? `${start}–${Math.min(end, daysInMonth)}` : "",
      total: weekTotals[index],
      height: Math.max(4, Math.round((weekTotals[index] / maxWeekTotal) * WEEK_BAR_MAX_HEIGHT)),
    }))
    .filter((week) => week.rangeLabel !== "");

  // --- Requests & Quotes ------------------------------------------------
  const quotesThisWeekCount = quotesThisMonth.filter(
    (quote) => new Date(quote.created_at) >= phoenixWeekStart
  ).length;
  const quotesThisMonthValue = quotesThisMonth.reduce(
    (sum, quote) => sum + toNumber(quote.price_total),
    0
  );

  const resolvedThisMonth = quotesThisMonth
    .map((quote) => computeDisplayStatus(quote.status as QuoteStatus, quote.expires_at))
    .filter((status) => status === "accepted" || status === "declined");
  const acceptedThisMonth = resolvedThisMonth.filter((status) => status === "accepted").length;
  const quoteAcceptanceRate =
    resolvedThisMonth.length > 0 ? acceptedThisMonth / resolvedThisMonth.length : null;

  const leadItems: LeadItem[] = leadsThisMonth.slice(0, 10).map((lead) => ({
    id: lead.id,
    name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Unnamed lead",
    source: [lead.source, lead.city].filter(Boolean).join(" · ") || "Unknown source",
    date: formatLeadDate(lead.created_at),
  }));

  const outstandingItems: OutstandingInvoiceItem[] = outstandingInvoices.map((invoice) => ({
    id: invoice.jobber_invoice_id,
    name: invoice.customer_name || "Unnamed Customer",
    amount: formatCurrency(invoice.outstanding_balance),
    invoiceNumber: invoice.invoice_number || "—",
    customerId: invoice.jobber_client_id,
  }));

  return {
    outstandingTotal: outstandingInvoices.reduce(
      (sum, row) => sum + toNumber(row.outstanding_balance),
      0
    ),
    outstandingCount: outstandingInvoices.length,
    outstandingInvoices: outstandingItems,
    leadsThisMonth: leadItems,
    leadsThisMonthCount: leadsThisMonth.length,
    leadsThisWeekCount: leadsThisMonth.filter(
      (lead) => new Date(lead.created_at) >= phoenixWeekStart
    ).length,
    revenueThisMonth: monthlyRevenue.thisMonth,
    revenueLastMonthToDate: monthlyRevenue.lastMonthToDate,
    newCustomersThisMonth,
    scansToday: scansTodayResult.count ?? 0,
    scansWeek: scansWeekResult.count ?? 0,
    scansMtd: scansMtdResult.count ?? 0,
    scheduledTodayTotal,
    scheduledTodayCount,
    scheduledMonthTotal,
    scheduledMonthCount,
    oneOffJobCount: oneOffJobIds.size,
    oneOffTotal,
    oneOffPercent,
    recurringVisitCount,
    recurringTotal,
    recurringPercent,
    avgJobValueOverall,
    avgJobValueOneOff,
    avgJobValueRecurring,
    weekBars,
    quotesThisWeekCount,
    quotesThisMonthCount: quotesThisMonth.length,
    quotesThisMonthValue,
    quotesAwaitingResponse,
    quoteAcceptanceRate,
  };
}

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  let errorMessage: string | null = null;

  try {
    data = await getDashboardData();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Dashboard data could not be loaded.";
  }

  if (!data || errorMessage) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl bg-white p-5 shadow sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Business Intelligence
            </p>

            <h1 className="mt-3 text-3xl font-bold">Dashboard could not be loaded</h1>

            <p className="mt-4 text-[#6b705c]">
              {errorMessage ?? "No dashboard data was returned."}
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
            >
              Back Home
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Business Intelligence
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Valley Turf Revival Dashboard
            </h1>

            <p className="mt-2 text-[#6b705c]">
              Live revenue, pipeline, and lead metrics.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/customers"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              View Customers
            </Link>

            <Link
              href="/"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Home
            </Link>
          </div>
        </header>

        <div className="mt-8 flex flex-col gap-6">
          <DashboardTopRow
            outstandingTotalLabel={formatCurrency(data.outstandingTotal)}
            outstandingCount={data.outstandingCount}
            outstandingInvoices={data.outstandingInvoices}
            leadsCount={data.leadsThisMonthCount}
            leadsList={data.leadsThisMonth}
            leadsMoreCount={Math.max(0, data.leadsThisMonthCount - data.leadsThisMonth.length)}
            revenueThisMonthLabel={formatCurrency(data.revenueThisMonth)}
            revenueComparisonLabel={formatRevenueComparison(
              data.revenueThisMonth,
              data.revenueLastMonthToDate
            )}
            newCustomersThisMonth={data.newCustomersThisMonth}
            scansToday={data.scansToday}
            scansWeek={data.scansWeek}
            scansMtd={data.scansMtd}
          />

          {/* Revenue Pipeline */}
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-bold">Revenue Pipeline</h2>
              <p className="text-sm text-[#6b705c]">
                Visits that haven&apos;t been invoiced yet — a mix of work already
                completed and visits still to come. Separate from Revenue above,
                which is already billed.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Scheduled Today
                </p>
                <h3 className="mt-3 text-3xl font-bold">
                  {formatCurrency(data.scheduledTodayTotal)}
                </h3>
                <p className="mt-2 text-sm text-[#6b705c]">
                  {formatNumber(data.scheduledTodayCount)} visit
                  {data.scheduledTodayCount === 1 ? "" : "s"} on today&apos;s calendar
                </p>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Unbilled This Month
                </p>
                <h3 className="mt-3 text-3xl font-bold">
                  {formatCurrency(data.scheduledMonthTotal)}
                </h3>
                <p className="mt-2 text-sm text-[#6b705c]">
                  {formatNumber(data.scheduledMonthCount)} visit
                  {data.scheduledMonthCount === 1 ? "" : "s"} not yet invoiced —
                  completed and upcoming combined
                </p>
              </div>
            </div>
          </section>

          {/* Job Mix */}
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-bold">Job Mix</h2>
              <p className="text-sm text-[#6b705c]">
                Recurring total is every recurring visit scheduled this month, invoiced
                or not — for what&apos;s actually been billed, see Revenue above.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="flex flex-col gap-5 rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  One-off vs. Recurring — this month
                </p>

                <div className="flex gap-6">
                  <div className="flex-1">
                    <p className="text-2xl font-bold">
                      {formatNumber(data.oneOffJobCount)}{" "}
                      <span className="text-base font-semibold text-[#9c7a20]">
                        ({data.oneOffPercent}%)
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[#6b705c]">
                      One-off jobs · {formatCurrency(data.oneOffTotal)}
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-[#ece8dc]">
                      <div
                        className="h-2 rounded-full bg-[#d4af37]"
                        style={{ width: `${data.oneOffPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-2xl font-bold">
                      {formatNumber(data.recurringVisitCount)}{" "}
                      <span className="text-base font-semibold text-[#174734]">
                        ({data.recurringPercent}%)
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[#6b705c]">
                      Recurring visits · {formatCurrency(data.recurringTotal)}
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-[#ece8dc]">
                      <div
                        className="h-2 rounded-full bg-[#174734]"
                        style={{ width: `${data.recurringPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-6 border-t border-[#ece8dc] pt-4">
                  <div className="flex-1">
                    <p className="text-xl font-bold">{formatCurrency(data.avgJobValueOverall)}</p>
                    <p className="mt-1 text-xs text-[#6b705c]">Avg job value, overall</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xl font-bold">{formatCurrency(data.avgJobValueOneOff)}</p>
                    <p className="mt-1 text-xs text-[#6b705c]">Avg, one-off</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xl font-bold">
                      {formatCurrency(data.avgJobValueRecurring)}
                    </p>
                    <p className="mt-1 text-xs text-[#6b705c]">Avg, recurring</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Unbilled Job Value by Week
                </p>
                <p className="mt-1 text-xs text-[#6b705c]">
                  Native-invoiced visits not yet billed — excludes anyone still on Jobber
                  invoicing.
                </p>

                <div className="mt-4 flex flex-1 items-end gap-3 px-1">
                  {data.weekBars.map((week) => (
                    <div key={week.label} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-xs font-bold text-[#174734]">
                        {formatCurrency(week.total)}
                      </span>
                      <div
                        className="w-full max-w-[34px] rounded-t-md rounded-b-sm bg-[#174734]"
                        style={{ height: `${week.height}px` }}
                      />
                      <span className="text-xs text-[#9c9587]">{week.rangeLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Requests & Quotes */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Requests &amp; Quotes</h2>

            <div className="grid gap-5 rounded-3xl bg-white p-6 shadow sm:grid-cols-4">
              <div className="sm:border-r sm:border-[#ece8dc] sm:pr-5">
                <p className="text-2xl font-bold">
                  {formatNumber(data.leadsThisWeekCount)}{" "}
                  <span className="text-sm font-semibold text-[#6b705c]">
                    / {formatNumber(data.leadsThisMonthCount)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#6b705c]">New leads — week / month</p>
              </div>

              <div className="sm:border-r sm:border-[#ece8dc] sm:pr-5">
                <p className="text-2xl font-bold">
                  {formatNumber(data.quotesThisWeekCount)}{" "}
                  <span className="text-sm font-semibold text-[#6b705c]">
                    / {formatNumber(data.quotesThisMonthCount)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#6b705c]">
                  New quotes — week / month · {formatCurrency(data.quotesThisMonthValue)}
                </p>
              </div>

              <div className="sm:border-r sm:border-[#ece8dc] sm:pr-5">
                <p className="text-2xl font-bold">{formatNumber(data.quotesAwaitingResponse)}</p>
                <p className="mt-1 text-xs text-[#6b705c]">Quotes awaiting response</p>
              </div>

              <div>
                <p className="text-2xl font-bold">
                  {data.quoteAcceptanceRate == null
                    ? "—"
                    : formatPercent(data.quoteAcceptanceRate, { decimals: 0 })}
                </p>
                <p className="mt-1 text-xs text-[#6b705c]">Quote acceptance rate</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
