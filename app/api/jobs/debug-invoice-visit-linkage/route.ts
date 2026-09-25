// Read-only diagnostic (2026-09-25). Ryan's pushback on the previous fix:
// "Jobber has invoiced everything that is not native. There are not a lot
// of visits left this month. Those visits don't add up to $7,800 worth of
// work." That means the recurringBreakdown.notYetInvoicedTotal figure from
// debug-dashboard-numbers is itself wrong, not just mislabeled -- a real
// number of Jobber-sourced visits are sitting with jobber_invoice_id =
// null even though Jobber has already invoiced them.
//
// Leading hypothesis: app/api/jobber/sync-invoices/route.ts (added
// 2026-09-13, commit f63c83a, "fix invoice/visit sync gap") is a
// retroactive backfill that re-links jobber_visits.jobber_invoice_id for
// every visit an invoice covers, specifically because
// lib/jobberWebhookProcessor.ts's syncSingleInvoice only started doing
// this going forward from when it shipped. If that backfill sync has
// never been run (or hasn't been run since), any Jobber-sourced visit
// invoiced before 2026-09-13 -- or any invoice that arrived via a normal
// per-invoice webhook that for some reason didn't include a full
// visits() page -- would still show jobber_invoice_id = null locally
// despite genuinely being invoiced in Jobber.
//
// This checks three things: (1) jobber_sync_status for sync_type =
// 'invoices' -- has it ever run, and when; (2) for this month's
// "unbilled" (jobber_invoice_id null), non-native, non-archived visits,
// whether Jobber's own client already has an invoice on file that plausibly
// covers it (same client, issue_date on/after the visit's job creation,
// i.e. a real invoice this app already knows about but never linked back
// to the visit); (3) a native/jobber source split of the current
// "unbilled" pool, since Ryan's claim is specifically that only native
// visits should legitimately be unbilled.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHOENIX_TIME_ZONE = "America/Phoenix";

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

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  start_at: string | null;
  price_override: number | string | null;
  jobber_invoice_id: string | null;
  job_status: string | null;
  completed_at: string | null;
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  // --- 1: has the invoices backfill sync ever run? ----------------------
  const { data: syncStatus, error: syncStatusError } = await supabaseServer
    .from("jobber_sync_status")
    .select("*")
    .eq("sync_type", "invoices")
    .maybeSingle();

  const { data: recentSyncRuns, error: syncRunsError } = await supabaseServer
    .from("jobber_sync_runs")
    .select("id, sync_type, sync_mode, status, started_at, completed_at, records_received, records_saved, error_message")
    .eq("sync_type", "invoices")
    .order("started_at", { ascending: false })
    .limit(5);

  // --- 2 & 3: this month's unbilled, non-archived visits -----------------
  const { year, month } = getPhoenixDateParts();
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 7, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 7, 0, 0, 0));

  const rows: VisitRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, title, start_at, price_override, jobber_invoice_id, job_status, completed_at"
      )
      .gte("start_at", monthStart.toISOString())
      .lt("start_at", monthEnd.toISOString())
      .is("jobber_invoice_id", null)
      .or("job_status.is.null,job_status.neq.archived,completed_at.not.is.null")
      .order("start_at", { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as VisitRow[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }

  const jobIds = Array.from(
    new Set(rows.map((r) => r.jobber_job_id).filter((id): id is string => Boolean(id)))
  );

  const jobSources = new Map<string, string | null>();
  const jobTotals = new Map<string, number>();
  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const { data: jobs, error: jobsError } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, source, total")
      .in("jobber_job_id", batch);
    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });
    for (const row of (jobs ?? []) as { jobber_job_id: string; source: string | null; total: number | string | null }[]) {
      jobSources.set(row.jobber_job_id, row.source);
      jobTotals.set(row.jobber_job_id, toNumber(row.total));
    }
  }

  function resolveValue(v: VisitRow): number {
    if (v.price_override != null) return toNumber(v.price_override);
    if (!v.jobber_job_id) return 0;
    return jobTotals.get(v.jobber_job_id) ?? 0;
  }

  const bySource = { native: { count: 0, total: 0 }, jobber: { count: 0, total: 0 }, unknown: { count: 0, total: 0 } };
  for (const v of rows) {
    const source = v.jobber_job_id ? (jobSources.get(v.jobber_job_id) ?? null) : null;
    const bucket = source === "native" ? "native" : source === "jobber" ? "jobber" : "unknown";
    bySource[bucket].count += 1;
    bySource[bucket].total += resolveValue(v);
  }

  // For the Jobber-sourced unbilled visits specifically, check whether
  // this app already has ANY invoice on file for that same client dated
  // on/after the visit -- a plausible sign the invoice exists in
  // jobber_invoices but was simply never linked back to this visit row.
  const jobberSourcedUnbilled = rows.filter((v) => {
    const source = v.jobber_job_id ? jobSources.get(v.jobber_job_id) : null;
    return source === "jobber";
  });

  const clientIds = Array.from(
    new Set(jobberSourcedUnbilled.map((v) => v.jobber_client_id).filter((id): id is string => Boolean(id)))
  );

  let possibleUnlinkedMatches: Record<string, unknown>[] = [];
  if (clientIds.length > 0) {
    const { data: candidateInvoices, error: candidateError } = await supabaseServer
      .from("jobber_invoices")
      .select("jobber_invoice_id, jobber_client_id, invoice_number, status, total, issue_date")
      .in("jobber_client_id", clientIds)
      .order("issue_date", { ascending: false });
    if (candidateError) return NextResponse.json({ error: candidateError.message }, { status: 500 });

    const invoicesByClient = new Map<string, typeof candidateInvoices>();
    for (const inv of candidateInvoices ?? []) {
      const list = invoicesByClient.get(inv.jobber_client_id ?? "") ?? [];
      list.push(inv);
      invoicesByClient.set(inv.jobber_client_id ?? "", list);
    }

    possibleUnlinkedMatches = jobberSourcedUnbilled.slice(0, 40).map((v) => ({
      visitId: v.jobber_visit_id,
      customerName: v.customer_name,
      title: v.title,
      startAt: v.start_at,
      resolvedValue: resolveValue(v),
      clientInvoicesOnFile: (invoicesByClient.get(v.jobber_client_id ?? "") ?? []).slice(0, 5),
    }));
  }

  return NextResponse.json({
    success: true,
    invoicesSyncStatus: { data: syncStatus ?? null, error: syncStatusError?.message ?? null },
    invoicesSyncRecentRuns: { data: recentSyncRuns ?? [], error: syncRunsError?.message ?? null },
    unbilledThisMonthBySource: bySource,
    unbilledJobberSourcedSampleWithClientInvoices: possibleUnlinkedMatches,
  });
}
