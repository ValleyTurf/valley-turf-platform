// Follow-up to debug-outstanding-check (2026-09-20). That confirmed
// Tyson Lane's only invoice (Z2lkOi8vSm9iYmVyL0ludm9pY2UvMTEzNjQ2MDk3,
// $5, Feb 2025) is STILL present in jobber_invoices with status "paid"
// -- not voided, not gone -- and customer_financials shows
// lifetime_collected: 0 / outstanding_balance: 5 for him despite that
// "paid" status. That $0 collected is the real puzzle: it means
// outstanding_balance isn't reading the invoice's own status column at
// all, it's computed from actual recorded payments (invoiced minus
// collected), and no jobber_payments row exists tying back to this
// invoice/client. This checks three things directly instead of
// guessing further: (1) whether ANY jobber_payments row references this
// invoice or client at all, (2) whether Ryan's delete-in-Jobber attempt
// is stuck in the webhook queue (jobber_webhook_events) rather than
// having been processed yet, and (3) whether that queue has any error
// message recorded for it.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYSON_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC84MDIwMzgwNg==";
const TYSON_INVOICE_ID = "Z2lkOi8vSm9iYmVyL0ludm9pY2UvMTEzNjQ2MDk3";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const [paymentsByClient, paymentsByInvoice, webhookEvents, outstandingViewRow] =
    await Promise.all([
      supabaseServer
        .from("jobber_payments")
        .select("id, jobber_invoice_id, jobber_client_id, amount, payment_date")
        .eq("jobber_client_id", TYSON_CLIENT_ID),
      supabaseServer
        .from("jobber_payments")
        .select("id, jobber_invoice_id, jobber_client_id, amount, payment_date")
        .eq("jobber_invoice_id", TYSON_INVOICE_ID),
      supabaseServer
        .from("jobber_webhook_events")
        .select("id, topic, jobber_item_id, status, error_message, created_at, processed_at")
        .eq("jobber_item_id", TYSON_INVOICE_ID)
        .order("created_at", { ascending: false }),
      supabaseServer
        .from("outstanding_invoices")
        .select("*")
        .eq("jobber_client_id", TYSON_CLIENT_ID),
    ]);

  return NextResponse.json({
    success: true,
    paymentsByClient: {
      data: paymentsByClient.data,
      error: paymentsByClient.error?.message ?? null,
    },
    paymentsByInvoice: {
      data: paymentsByInvoice.data,
      error: paymentsByInvoice.error?.message ?? null,
    },
    webhookEventsForThisInvoice: {
      data: webhookEvents.data,
      error: webhookEvents.error?.message ?? null,
    },
    outstandingInvoicesViewRowsForTyson: {
      data: outstandingViewRow.data,
      error: outstandingViewRow.error?.message ?? null,
    },
  });
}
