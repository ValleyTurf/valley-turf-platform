// Follow-up to debug-native-unbilled-detail (2026-09-25). Ryan: "All of
// those people have paid, you are still missing things." That means the
// 40 visits flagged as "unbilled" (jobber_visits.jobber_invoice_id IS
// NULL) are wrong for at least some of these customers -- real invoices
// exist and are paid, but this app isn't seeing the link.
//
// createNativeInvoiceForVisit (app/(platform)/invoices/actions.ts:160-197)
// does correctly set jobber_visits.jobber_invoice_id = `native-${invoice.id}`
// on the specific visit row passed to it at invoice-creation time. So if
// a customer's invoice IS paid but their CURRENT visit row still shows
// null, the leading suspect is visit regeneration: lib/nativeJobs.ts's
// generateUpcomingNativeVisits creates the next occurrence's visit row
// ahead of time. If a job ever gets its visit row recreated/replaced for
// the same calendar occurrence (reschedule, resync, etc.), the invoice
// that was created against the OLD visit id stays correctly linked to
// that old id, while the surviving/current visit row for that same date
// is a fresh one that was never invoiced -- looks unbilled here, but the
// work was already paid for under a since-orphaned visit id.
//
// This checks, for every one of this month's "unbilled" native visits,
// whether that customer has ANY invoice on file (native `invoices` table
// -- the real source of truth, not just the jobber_invoices mirror) near
// the visit's date, and what its status/paid_at is -- regardless of
// which visit id it's linked to.
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

  // Only jobs actually native (matches the prior finding: 0 jobber-sourced
  // visits are unbilled right now) -- filter by jobber_jobs.source to be
  // safe rather than assume.
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

  // The REAL native invoices table (lib/invoices.ts), not just its
  // jobber_invoices mirror -- this is the source of truth for status and
  // paid_at.
  let invoicesByClient = new Map<
    string,
    { id: string; invoice_number: string | null; status: string | null; total: number | string | null; issue_date: string | null; paid_at: string | null; created_at: string | null }[]
  >();
  if (clientIds.length > 0) {
    const { data: invoices, error: invoicesError } = await supabaseServer
      .from("invoices")
      .select("id, jobber_client_id, invoice_number, status, total, issue_date, paid_at, created_at")
      .in("jobber_client_id", clientIds)
      .order("created_at", { ascending: false });
    if (invoicesError) return NextResponse.json({ error: invoicesError.message }, { status: 500 });

    for (const inv of invoices ?? []) {
      const key = (inv as { jobber_client_id: string | null }).jobber_client_id ?? "";
      const list = invoicesByClient.get(key) ?? [];
      list.push(inv as never);
      invoicesByClient.set(key, list);
    }
  }

  // Also check invoice_line_items directly for this exact visit id, in
  // case the invoice link exists at the line-item level but the
  // jobber_visits.jobber_invoice_id write silently failed/was skipped.
  const visitIds = nativeUnbilled.map((v) => v.jobber_visit_id);
  let lineItemsByVisit = new Map<string, { invoice_id: string }[]>();
  if (visitIds.length > 0) {
    const { data: lineItems, error: lineItemsError } = await supabaseServer
      .from("invoice_line_items")
      .select("invoice_id, jobber_visit_id")
      .in("jobber_visit_id", visitIds);
    if (lineItemsError) return NextResponse.json({ error: lineItemsError.message }, { status: 500 });
    for (const li of (lineItems ?? []) as { invoice_id: string; jobber_visit_id: string | null }[]) {
      if (!li.jobber_visit_id) continue;
      const list = lineItemsByVisit.get(li.jobber_visit_id) ?? [];
      list.push({ invoice_id: li.invoice_id });
      lineItemsByVisit.set(li.jobber_visit_id, list);
    }
  }

  const detail = nativeUnbilled.map((v) => ({
    visitId: v.jobber_visit_id,
    jobberJobId: v.jobber_job_id,
    customerName: v.customer_name,
    title: v.title,
    startAt: v.start_at,
    completedAt: v.completed_at,
    lineItemInvoiceIdsForThisVisit: (lineItemsByVisit.get(v.jobber_visit_id) ?? []).map((li) => li.invoice_id),
    clientInvoicesOnFile: (invoicesByClient.get(v.jobber_client_id ?? "") ?? []).slice(0, 6),
  }));

  const customersWithAPaidInvoiceOnFile = detail.filter((d) =>
    d.clientInvoicesOnFile.some((inv) => inv.status === "paid" || inv.paid_at != null)
  );

  return NextResponse.json({
    success: true,
    nativeUnbilledVisitCount: nativeUnbilled.length,
    detail,
    customersWithAPaidInvoiceOnFileButThisVisitUnlinked: customersWithAPaidInvoiceOnFile,
  });
}
