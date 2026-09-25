// Follow-up to debug-unbilled-vs-actual-invoices (2026-09-25). That check
// came back almost empty -- only 1 of 40 customers had ANY row in the
// native `invoices` table at all, and that one case (Syna Daudfar) is its
// own separate bug (a void+repaid invoice whose paid replacement never
// re-set jobber_visits.jobber_invoice_id). But Ryan says all of these
// people have paid, so the money has to be showing up SOMEWHERE.
//
// New hypothesis: these jobs are source='native' (migration 067 moved
// their SCHEDULING to this app), but that doesn't necessarily mean their
// INVOICING moved too -- lib/invoicingMode.ts's native_invoicing_enabled
// flag governs that separately, and app/api/jobber/backfill-invoicing-mode
// exists specifically to bucket customers into "still invoiced via
// Jobber" vs "native invoicing." If a customer is still on Jobber
// invoicing, Ryan (or Jobber's own automatic invoicing) creates and
// collects the invoice directly in Jobber -- which this app's
// sync-invoices job WOULD pick up into jobber_invoices -- but Jobber's
// own GraphQL Invoice.visits() field can only return Visit objects
// Jobber itself knows about. Once a job's visits are generated locally
// by generateUpcomingNativeVisits instead of coming from Jobber, Jobber
// has no Visit record to return, so visits(first:50) comes back empty
// for that invoice and the invoice can never link back to our local
// jobber_visits row, no matter how many times the sync runs. The
// customer paid, Jobber knows it's paid, but our jobber_visits row stays
// permanently "unbilled."
//
// This checks native_invoicing_enabled for each of the 40 customers, and
// separately looks for ANY jobber_invoices row for that client near the
// visit's date, regardless of whether it's linked to any visit.
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

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  start_at: string | null;
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

  const { year, month } = getPhoenixDateParts();
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 7, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 7, 0, 0, 0));

  const rows: VisitRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, title, start_at, jobber_invoice_id, job_status, completed_at"
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
  const nativeJobIds = new Set<string>();
  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const { data: jobs, error: jobsError } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, source")
      .in("jobber_job_id", batch)
      .eq("source", "native");
    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });
    for (const row of (jobs ?? []) as { jobber_job_id: string }[]) {
      nativeJobIds.add(row.jobber_job_id);
    }
  }

  const nativeUnbilled = rows.filter((v) => v.jobber_job_id && nativeJobIds.has(v.jobber_job_id));
  const clientIds = Array.from(
    new Set(nativeUnbilled.map((v) => v.jobber_client_id).filter((id): id is string => Boolean(id)))
  );

  // invoicing_mode -- is this customer actually still invoiced via Jobber
  // despite their job living natively?
  let invoicingModeByClient = new Map<
    string,
    { native_invoicing_enabled: boolean | null; invoicing_mode_source: string | null }
  >();
  if (clientIds.length > 0) {
    const { data: modes, error: modesError } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, native_invoicing_enabled, invoicing_mode_source")
      .in("jobber_client_id", clientIds);
    if (modesError) return NextResponse.json({ error: modesError.message, step: "invoicing_mode" }, { status: 500 });
    for (const row of (modes ?? []) as {
      jobber_client_id: string;
      native_invoicing_enabled: boolean | null;
      invoicing_mode_source: string | null;
    }[]) {
      invoicingModeByClient.set(row.jobber_client_id, {
        native_invoicing_enabled: row.native_invoicing_enabled,
        invoicing_mode_source: row.invoicing_mode_source,
      });
    }
  }

  // ANY jobber_invoices row for that client -- regardless of visit link --
  // near this month, so a Jobber-side invoice that Jobber's own
  // visits(first:50) could never link back to still shows up here.
  let jobberInvoicesByClient = new Map<
    string,
    { jobber_invoice_id: string; invoice_number: string | null; status: string | null; total: number | string | null; issue_date: string | null }[]
  >();
  if (clientIds.length > 0) {
    const { data: invoices, error: invoicesError } = await supabaseServer
      .from("jobber_invoices")
      .select("jobber_invoice_id, jobber_client_id, invoice_number, status, total, issue_date")
      .in("jobber_client_id", clientIds)
      .order("issue_date", { ascending: false });
    if (invoicesError) return NextResponse.json({ error: invoicesError.message, step: "jobber_invoices" }, { status: 500 });
    for (const inv of (invoices ?? []) as {
      jobber_invoice_id: string;
      jobber_client_id: string | null;
      invoice_number: string | null;
      status: string | null;
      total: number | string | null;
      issue_date: string | null;
    }[]) {
      const key = inv.jobber_client_id ?? "";
      const list = jobberInvoicesByClient.get(key) ?? [];
      list.push(inv);
      jobberInvoicesByClient.set(key, list);
    }
  }

  const detail = nativeUnbilled.map((v) => ({
    visitId: v.jobber_visit_id,
    customerName: v.customer_name,
    title: v.title,
    startAt: v.start_at,
    invoicingMode: v.jobber_client_id ? (invoicingModeByClient.get(v.jobber_client_id) ?? null) : null,
    jobberInvoicesOnFileForClient: (v.jobber_client_id ? jobberInvoicesByClient.get(v.jobber_client_id) : null) ?? [],
  }));

  const stillOnJobberInvoicing = detail.filter((d) => d.invoicingMode?.native_invoicing_enabled === false);
  const hasAJobberInvoiceOnFile = detail.filter((d) => d.jobberInvoicesOnFileForClient.length > 0);

  return NextResponse.json({
    success: true,
    totalNativeUnbilled: nativeUnbilled.length,
    stillOnJobberInvoicingCount: stillOnJobberInvoicing.length,
    hasAJobberInvoiceOnFileCount: hasAJobberInvoiceOnFile.length,
    detail,
  });
}
