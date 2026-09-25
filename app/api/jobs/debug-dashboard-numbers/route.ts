// Read-only diagnostic (2026-09-25). Ryan flagged three things on the
// rebuilt Dashboard right after it deployed:
//   1. "Scheduled Today" shows $230 for one visit -- which visit, and
//      is that price right?
//   2. Job Mix's "Recurring visits" total ($11,549) doesn't match
//      Revenue This Month ($8k and change) -- are we pulling the right
//      data? (Hypothesis, unverified here: Job Mix sums the WHOLE
//      month's scheduled recurring visits, including days that haven't
//      happened yet and visits not invoiced yet, while Revenue This
//      Month only counts what's actually been invoiced so far --
//      apples to oranges, not necessarily a bug. This route breaks the
//      $11,549 down by invoiced/not and past/future so that can be
//      confirmed instead of assumed.)
//   3. Tyson Lane's outstanding invoice was supposedly suppressed in an
//      earlier session but still shows in the new Outstanding panel --
//      is there an exclusion mechanism that got missed, or was it never
//      actually implemented? (supabase/migrations has no
//      exclude-from-outstanding column anywhere -- 078's
//      invoice_dismissed_at is for the separate "dismiss from the
//      Create Invoices queue" flow, a different thing.)
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

function getPhoenixStartOfDayUtc(date = new Date()): Date {
  const { year, month, day } = getPhoenixDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 7, 0, 0, 0));
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
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const phoenixTodayStart = getPhoenixStartOfDayUtc();
  const phoenixTodayEnd = new Date(phoenixTodayStart.getTime() + 24 * 60 * 60 * 1000);
  const { year, month } = getPhoenixDateParts();
  const phoenixMonthStart = new Date(Date.UTC(year, month - 1, 1, 7, 0, 0, 0));
  const phoenixMonthEnd = new Date(Date.UTC(year, month, 1, 7, 0, 0, 0));

  // --- 1 & 2: this month's visits, same set the dashboard sums -------
  const rows: VisitRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, title, start_at, price_override, jobber_invoice_id"
      )
      .gte("start_at", phoenixMonthStart.toISOString())
      .lt("start_at", phoenixMonthEnd.toISOString())
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

  const jobTotals = new Map<string, number>();
  const jobStatuses = new Map<string, string | null>();
  const recurringJobIds = new Set<string>();

  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const [{ data: jobs, error: jobsError }, { data: cats, error: catsError }] = await Promise.all([
      supabaseServer.from("jobber_jobs").select("jobber_job_id, total, job_status").in("jobber_job_id", batch),
      supabaseServer
        .from("job_service_category")
        .select("jobber_job_id")
        .in("jobber_job_id", batch)
        .eq("is_recurring_service", true),
    ]);
    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });
    if (catsError) return NextResponse.json({ error: catsError.message }, { status: 500 });
    for (const row of (jobs ?? []) as {
      jobber_job_id: string;
      total: number | string | null;
      job_status: string | null;
    }[]) {
      jobTotals.set(row.jobber_job_id, toNumber(row.total));
      jobStatuses.set(row.jobber_job_id, row.job_status);
    }
    for (const row of (cats ?? []) as { jobber_job_id: string }[]) {
      recurringJobIds.add(row.jobber_job_id);
    }
  }

  function resolveValue(v: VisitRow): number {
    if (v.price_override != null) return toNumber(v.price_override);
    if (!v.jobber_job_id) return 0;
    return jobTotals.get(v.jobber_job_id) ?? 0;
  }

  const todayUnbilled = rows
    .filter((v) => {
      if (v.jobber_invoice_id != null || !v.start_at) return false;
      const d = new Date(v.start_at);
      return d >= phoenixTodayStart && d < phoenixTodayEnd;
    })
    .map((v) => ({
      jobberVisitId: v.jobber_visit_id,
      customerName: v.customer_name,
      title: v.title,
      startAt: v.start_at,
      jobberJobId: v.jobber_job_id,
      priceOverride: v.price_override,
      jobTotal: v.jobber_job_id ? (jobTotals.get(v.jobber_job_id) ?? null) : null,
      resolvedValue: resolveValue(v),
      jobStatus: v.jobber_job_id ? (jobStatuses.get(v.jobber_job_id) ?? null) : null,
    }));

  const recurringVisits = rows.filter((v) => v.jobber_job_id && recurringJobIds.has(v.jobber_job_id));
  const recurringBreakdown = {
    totalAllRecurring: recurringVisits.reduce((s, v) => s + resolveValue(v), 0),
    countAllRecurring: recurringVisits.length,
    invoicedTotal: recurringVisits
      .filter((v) => v.jobber_invoice_id != null)
      .reduce((s, v) => s + resolveValue(v), 0),
    invoicedCount: recurringVisits.filter((v) => v.jobber_invoice_id != null).length,
    notYetInvoicedTotal: recurringVisits
      .filter((v) => v.jobber_invoice_id == null)
      .reduce((s, v) => s + resolveValue(v), 0),
    notYetInvoicedCount: recurringVisits.filter((v) => v.jobber_invoice_id == null).length,
    pastOrTodayTotal: recurringVisits
      .filter((v) => v.start_at && new Date(v.start_at) < phoenixTodayEnd)
      .reduce((s, v) => s + resolveValue(v), 0),
    pastOrTodayCount: recurringVisits.filter((v) => v.start_at && new Date(v.start_at) < phoenixTodayEnd)
      .length,
    futureTotal: recurringVisits
      .filter((v) => v.start_at && new Date(v.start_at) >= phoenixTodayEnd)
      .reduce((s, v) => s + resolveValue(v), 0),
    futureCount: recurringVisits.filter((v) => v.start_at && new Date(v.start_at) >= phoenixTodayEnd)
      .length,
    sample: recurringVisits.slice(0, 25).map((v) => ({
      customerName: v.customer_name,
      title: v.title,
      startAt: v.start_at,
      invoiced: v.jobber_invoice_id != null,
      resolvedValue: resolveValue(v),
    })),
  };

  // --- 3: Tyson Lane -----------------------------------------------------
  const { data: tysonCustomers, error: tysonCustomersError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, first_name, last_name")
    .or("full_name.ilike.%tyson%,last_name.ilike.%lane%");
  if (tysonCustomersError)
    return NextResponse.json({ error: tysonCustomersError.message }, { status: 500 });

  const tysonClientIds = (tysonCustomers ?? []).map(
    (c: { jobber_client_id: string }) => c.jobber_client_id
  );

  const [outstandingRows, jobberInvoiceRows, jobberPaymentRows] = await Promise.all([
    tysonClientIds.length > 0
      ? supabaseServer.from("outstanding_invoices").select("*").in("jobber_client_id", tysonClientIds)
      : Promise.resolve({ data: [], error: null }),
    tysonClientIds.length > 0
      ? supabaseServer
          .from("jobber_invoices")
          .select("jobber_invoice_id, jobber_client_id, invoice_number, status, total")
          .in("jobber_client_id", tysonClientIds)
      : Promise.resolve({ data: [], error: null }),
    tysonClientIds.length > 0
      ? supabaseServer
          .from("jobber_payments")
          .select("jobber_payment_id, jobber_invoice_id, jobber_client_id, amount, payment_date")
          .in("jobber_client_id", tysonClientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return NextResponse.json({
    success: true,
    scheduledTodayUnbilled: todayUnbilled,
    recurringBreakdown,
    tysonLane: {
      customers: tysonCustomers ?? [],
      outstandingInvoicesViewRows: outstandingRows.data ?? [],
      outstandingInvoicesViewError: outstandingRows.error?.message ?? null,
      jobberInvoiceRows: jobberInvoiceRows.data ?? [],
      jobberInvoiceRowsError: jobberInvoiceRows.error?.message ?? null,
      jobberPaymentRows: jobberPaymentRows.data ?? [],
      jobberPaymentRowsError: jobberPaymentRows.error?.message ?? null,
    },
  });
}
