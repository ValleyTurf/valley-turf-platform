// One-time diagnostic (2026-09-20). Ryan: Tyson Lane still shows an
// outstanding-invoice indicator even after he deleted the invoice, and
// the amount hasn't gone away anywhere in the CRM. Likely explanation,
// pending confirmation against his real rows: lib/jobberWebhookProcessor.ts's
// handleDestroyedInvoice (the INVOICE_DESTROY handler) deliberately
// keeps the jobber_invoices mirror row when an invoice is deleted in
// Jobber -- its own comment says "Historical invoice data was retained"
// -- and only un-links any visit that pointed to it. It never touches
// the row's status, so a deleted invoice that was "sent"/unpaid at the
// time it got deleted stays "sent"/unpaid forever, and every view built
// on top of jobber_invoices (customer_financials.outstanding_balance,
// the outstanding_invoices view, Revenue's outstanding list) keeps
// counting it. If instead this was a NATIVE invoice Tyson tried to
// delete through our own app, the mechanism (and the fix) would be
// different -- this pulls his actual rows from both invoices (native)
// and jobber_invoices (the unified mirror) plus customer_financials to
// tell those two cases apart before anything gets changed.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const nameQuery = request.nextUrl.searchParams.get("name") ?? "Lane";

  const { data: customers, error: customerError } = await supabaseServer
    .from("customers")
    .select("id, jobber_client_id, first_name, last_name")
    .ilike("last_name", `%${nameQuery}%`);

  if (customerError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read customers: ${customerError.message}` },
      { status: 500 }
    );
  }

  const results = [];

  for (const customer of customers ?? []) {
    const clientId = customer.jobber_client_id;

    const [financials, jobberInvoices, nativeInvoices, visitsLinked] =
      await Promise.all([
        supabaseServer
          .from("customer_financials")
          .select(
            "jobber_client_id, invoice_count, lifetime_invoiced, lifetime_collected, outstanding_balance"
          )
          .eq("jobber_client_id", clientId)
          .maybeSingle(),
        supabaseServer
          .from("jobber_invoices")
          .select(
            "jobber_invoice_id, invoice_number, status, total, issue_date, due_date, jobber_client_id"
          )
          .eq("jobber_client_id", clientId),
        supabaseServer
          .from("invoices")
          .select("id, status, total, issue_date, due_date, jobber_client_id")
          .eq("jobber_client_id", clientId),
        supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, jobber_invoice_id, title, start_at")
          .eq("jobber_client_id", clientId)
          .not("jobber_invoice_id", "is", null),
      ]);

    results.push({
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      jobberClientId: clientId,
      customerFinancials: financials.data,
      customerFinancialsError: financials.error?.message ?? null,
      jobberInvoicesMirrorRows: jobberInvoices.data,
      jobberInvoicesError: jobberInvoices.error?.message ?? null,
      nativeInvoicesTableRows: nativeInvoices.data,
      nativeInvoicesError: nativeInvoices.error?.message ?? null,
      visitsStillLinkedToAnInvoice: visitsLinked.data,
    });
  }

  return NextResponse.json({ success: true, nameQueried: nameQuery, results });
}
