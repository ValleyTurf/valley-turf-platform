// Ryan (2026-09-30): "Patrick Durkin paid today, but I didn't get an
// email stating he paid. Why?"
//
// sendPaymentReceivedAlertEmail (lib/notifications.ts) -- the staff
// "Payment received" email -- is only ever called from ONE place:
// notifyStaffOfPayment() in lib/stripeWebhookProcessor.ts, itself only
// reached from handlePaymentIntentSucceeded. That means it fires for
// exactly one kind of payment: a real Stripe charge through this app's
// own Pay Now / autopay flow. It does NOT fire for either of the other
// two ways an invoice can end up "paid" in this system:
//
//   1. Staff clicking Mark Paid (Cash/Check) on a native invoice --
//      recordManualInvoicePayment (lib/payments.ts) is explicit and
//      deliberate about this: "Never sends anything -- no email, no
//      SMS, no receipt of any kind." That comment was written for "don't
//      notify the customer" (Debbie Edwards, 2026-09-20), but as written
//      it also skips Ryan's own staff alert -- there's no separate check.
//   2. A payment recorded directly in Jobber (Jobber's own processor, or
//      manually marked paid there) -- jobberWebhookProcessor.ts's
//      INVOICE_UPDATE handler mirrors the status change into
//      jobber_invoices, but never calls any notification function at
//      all. sendPaymentReceivedAlertEmail isn't imported there.
//
// This looks up Durkin's invoice(s) across both the native (invoices/
// payments) and Jobber-mirrored (jobber_invoices/jobber_payments) tables
// and reports which of the three paths actually happened, so the answer
// is evidence instead of a guess.
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

  const customerName = request.nextUrl.searchParams.get("customer") ?? "Durkin";

  const { data: nativeInvoices, error: nativeInvoicesError } = await supabaseServer
    .from("invoices")
    .select(
      "id, invoice_number, customer_name, jobber_client_id, status, total, due_date, paid_at, created_at, updated_at"
    )
    .ilike("customer_name", `%${customerName}%`);

  if (nativeInvoicesError) {
    return NextResponse.json(
      { error: nativeInvoicesError.message, step: "invoices" },
      { status: 500 }
    );
  }

  const nativeInvoiceIds = (nativeInvoices ?? []).map((inv) => inv.id as string);

  const { data: nativePayments, error: nativePaymentsError } = nativeInvoiceIds.length
    ? await supabaseServer
        .from("payments")
        .select(
          "id, invoice_id, stripe_payment_intent_id, stripe_checkout_session_id, amount, method, status, paid_at, created_at, updated_at"
        )
        .in("invoice_id", nativeInvoiceIds)
    : { data: [], error: null };

  if (nativePaymentsError) {
    return NextResponse.json(
      { error: nativePaymentsError.message, step: "payments" },
      { status: 500 }
    );
  }

  const { data: jobberInvoices, error: jobberInvoicesError } = await supabaseServer
    .from("jobber_invoices")
    .select("*")
    .ilike("customer_name", `%${customerName}%`);

  if (jobberInvoicesError) {
    return NextResponse.json(
      { error: jobberInvoicesError.message, step: "jobber_invoices" },
      { status: 500 }
    );
  }

  const jobberInvoiceIds = (jobberInvoices ?? []).map(
    (inv) => inv.jobber_invoice_id as string
  );

  const { data: jobberPayments, error: jobberPaymentsError } = jobberInvoiceIds.length
    ? await supabaseServer
        .from("jobber_payments")
        .select("*")
        .in("jobber_invoice_id", jobberInvoiceIds)
    : { data: [], error: null };

  if (jobberPaymentsError) {
    return NextResponse.json(
      { error: jobberPaymentsError.message, step: "jobber_payments" },
      { status: 500 }
    );
  }

  // For any real (non-synthetic) Stripe payment intent, check whether
  // its webhook event actually made it into the processing queue and
  // how it resolved -- catches "the payment happened but the webhook
  // never reached us / errored out" as a fourth possibility.
  const realPaymentIntentIds = (nativePayments ?? [])
    .map((p) => p.stripe_payment_intent_id as string)
    .filter((id) => id && !id.startsWith("manual-"));

  // stripe_webhook_events doesn't have a payment_intent_id column of its
  // own (the id is only inside the JSON payload), so this just pulls
  // recent payment-relevant events for a human to eyeball against the
  // payment intent id(s) found above, rather than trying to filter on
  // payload contents.
  const since = new Date();
  since.setDate(since.getDate() - 2);

  const { data: recentPaymentEvents, error: recentPaymentEventsError } =
    await supabaseServer
      .from("stripe_webhook_events")
      .select("id, type, status, attempts, last_error, payload, created_at, updated_at")
      .in("type", [
        "checkout.session.completed",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
      ])
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

  if (recentPaymentEventsError) {
    return NextResponse.json(
      { error: recentPaymentEventsError.message, step: "stripe_webhook_events" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    searchedFor: customerName,
    nativeInvoices,
    nativePayments,
    realStripePaymentIntentIds: realPaymentIntentIds,
    jobberInvoices,
    jobberPayments,
    recentStripeWebhookEvents_last2Days: recentPaymentEvents,
    howToRead: {
      manualCashCheckPayment:
        "A payments row with stripe_payment_intent_id starting 'manual-' means staff clicked Mark Paid -- by design, no alert email is ever sent for this.",
      realStripePayment:
        "A payments row with a real 'pi_...' id means it went through Stripe -- check recentStripeWebhookEvents_last2Days for that same window to see if the event processed cleanly (status 'processed') or errored (status 'failed', see last_error).",
      jobberOnlyPayment:
        "If nativeInvoices/nativePayments are empty but jobberInvoices shows a 'paid' status, the payment was recorded directly in Jobber -- this app has no notification path for that at all today.",
    },
  });
}
