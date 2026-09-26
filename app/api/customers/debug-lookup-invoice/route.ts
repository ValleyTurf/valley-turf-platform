// Ryan (2026-09-26): "Ryan Sawyer paid in our system, but had an
// outstanding invoice in Jobber for the same job. I have deleted the
// invoice in Jobber, but it is still showing as outstanding."
//
// dashboard/page.tsx's fetchOutstandingInvoices (fixed for Tyson Lane,
// 2026-09-25) already cross-checks jobber_invoices.status and excludes
// anything status === "paid" -- but that only catches "paid". If
// deleting an invoice in Jobber actually just voids/writes it off
// rather than hard-deleting it (Jobber's own INVOICE_DESTROY webhook
// vs. an INVOICE_UPDATE with a terminal status), the row could be
// sitting here with a status like "void" or "bad_debt" -- something
// that isn't "paid" but also isn't really collectible -- and slip
// straight through that same filter.
//
// This looks up every jobber_invoices row for a customer name (ILIKE,
// case-insensitive, partial match), plus its jobber_payments rows and
// the outstanding_invoices view's own row for the same invoice id, so
// the actual status string and why the view still counts it as
// outstanding are both visible instead of guessed at.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const customerName = request.nextUrl.searchParams.get("customer") ?? "Sawyer";

  const { data: invoices, error: invoicesError } = await supabaseServer
    .from("jobber_invoices")
    .select("*")
    .ilike("customer_name", `%${customerName}%`);

  if (invoicesError) {
    return NextResponse.json({ error: invoicesError.message, step: "jobber_invoices" }, { status: 500 });
  }

  const invoiceIds = (invoices ?? []).map((inv) => inv.jobber_invoice_id as string);

  const { data: payments, error: paymentsError } = invoiceIds.length
    ? await supabaseServer.from("jobber_payments").select("*").in("jobber_invoice_id", invoiceIds)
    : { data: [], error: null };

  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message, step: "jobber_payments" }, { status: 500 });
  }

  const { data: outstandingRows, error: outstandingError } = invoiceIds.length
    ? await supabaseServer
        .from("outstanding_invoices")
        .select("*")
        .in("jobber_invoice_id", invoiceIds)
    : { data: [], error: null };

  if (outstandingError) {
    return NextResponse.json({ error: outstandingError.message, step: "outstanding_invoices" }, { status: 500 });
  }

  const { data: visits, error: visitsError } = invoiceIds.length
    ? await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, jobber_invoice_id, invoice_dismissed_at, start_at")
        .in("jobber_invoice_id", invoiceIds)
    : { data: [], error: null };

  if (visitsError) {
    return NextResponse.json({ error: visitsError.message, step: "jobber_visits" }, { status: 500 });
  }

  // Also check whether ANY visit for this customer was un-linked from
  // one of these invoice ids in the past (handleDestroyedInvoice sets
  // jobber_invoice_id to null but never touches the invoice row itself
  // -- if a visit for this customer currently has a null invoice id,
  // that's consistent with the destroy webhook having already run).
  const { data: clientVisits, error: clientVisitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, customer_name, jobber_invoice_id, start_at")
    .ilike("customer_name", `%${customerName}%`);

  if (clientVisitsError) {
    return NextResponse.json({ error: clientVisitsError.message, step: "client_visits" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    searchedFor: customerName,
    jobberInvoices: invoices,
    jobberPayments: payments,
    outstandingInvoicesViewRows: outstandingRows,
    visitsLinkedToTheseInvoices: visits,
    allVisitsForThisCustomer: clientVisits,
  });
}
