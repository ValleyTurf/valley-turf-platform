// Native payment records + invoice status transitions (Tier 1, Stage 5).
// Written to exclusively by lib/stripeWebhookProcessor.ts's real
// handlers -- nothing else should mutate the payments table or flip an
// invoice to "paid" outside of a verified Stripe webhook event.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type PaymentStatus = "processing" | "succeeded" | "failed" | "refunded";

export type UpsertPaymentParams = {
  invoiceId: string | null;
  stripePaymentIntentId: string;
  stripeCheckoutSessionId?: string | null;
  stripeChargeId?: string | null;
  amount: number;
  method?: string | null;
  status: PaymentStatus;
  paidAt?: string | null;
  // Tier 1 Stage 6 -- the actual Stripe processing fee/net, fetched from
  // the Charge's balance_transaction (not available on the PaymentIntent
  // itself). Optional because most upsert callers (checkout.session.completed,
  // payment_intent.payment_failed) never have this -- only
  // handlePaymentIntentSucceeded in stripeWebhookProcessor.ts fetches and
  // passes it.
  feeAmount?: number | null;
  netAmount?: number | null;
};

// Upserts on stripe_payment_intent_id (the migration's unique
// constraint) -- Stripe delivers webhooks at-least-once, and the same
// PaymentIntent shows up across checkout.session.completed,
// payment_intent.succeeded, and potentially charge.refunded, so this is
// the one write path all three handlers share rather than each doing
// its own insert-or-update logic.
export async function upsertPaymentByIntentId(
  params: UpsertPaymentParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer.from("payments").upsert(
    {
      invoice_id: params.invoiceId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
      stripe_charge_id: params.stripeChargeId ?? null,
      amount: params.amount,
      method: params.method ?? null,
      status: params.status,
      paid_at: params.paidAt ?? null,
      updated_at: new Date().toISOString(),
      // Only included when the caller actually has fee data (Stage 6,
      // currently just handlePaymentIntentSucceeded). Omitting the keys
      // entirely -- rather than sending null -- means an upsert without
      // fee data (checkout.session.completed, payment_intent.payment_failed)
      // can't clobber a fee an earlier upsert already recorded for the
      // same PaymentIntent. Stripe doesn't guarantee event delivery order.
      ...(params.feeAmount !== undefined ? { fee_amount: params.feeAmount } : {}),
      ...(params.netAmount !== undefined ? { net_amount: params.netAmount } : {}),
    },
    { onConflict: "stripe_payment_intent_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// Stage 7: Revenue, Transactions, Job Costing Analytics, Dashboard, and
// Reactivation/Customer Intelligence all read jobber_invoices/jobber_payments
// (and the invoice_financials view built on top of them) -- none of them
// know the native invoices/payments tables exist. Rather than touch every
// one of those pages, a native invoice gets mirrored into jobber_invoices
// under a synthetic id ("native-<uuid>") that can never collide with a
// real Jobber invoice id, so every existing report keeps working
// unchanged. invoice_financials computes payment_status by summing
// jobber_payments joined on jobber_invoice_id -- confirmed via
// `select pg_get_viewdef('invoice_financials', true)` before building
// this -- so a mirror payment row is what actually flips a native
// invoice from "Unpaid" to "Paid" in every report, not the status column
// (that's written too, but only for anything that reads jobber_invoices
// directly rather than through the view).
function nativeMirrorInvoiceId(invoiceId: string): string {
  return `native-${invoiceId}`;
}

export async function mirrorNativeInvoiceInJobberTables(params: {
  invoiceId: string;
  jobberClientId: string;
  customerName: string | null;
  invoiceNumber: string;
  subject: string | null;
  status: "draft" | "sent" | "paid";
  issueDate: string;
  dueDate: string | null;
  total: number;
}): Promise<void> {
  const { error } = await supabaseServer.from("jobber_invoices").upsert(
    {
      jobber_invoice_id: nativeMirrorInvoiceId(params.invoiceId),
      jobber_client_id: params.jobberClientId,
      invoice_number: params.invoiceNumber,
      customer_name: params.customerName,
      subject: params.subject,
      status: params.status,
      issue_date: params.issueDate,
      due_date: params.dueDate,
      total: params.total,
      balance: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "jobber_invoice_id" }
  );

  if (error) {
    // Best-effort, matching the existing Jobber-invoice creation path's
    // own optimistic mirror write (app/(platform)/invoices/actions.ts) --
    // the real invoice already exists in the native tables regardless,
    // so a reporting mirror failure shouldn't fail the whole action.
    console.error(
      `Failed to mirror native invoice ${params.invoiceId} into jobber_invoices:`,
      error.message
    );
  }
}

// Called once a native invoice is actually paid (from markInvoicePaid
// below) -- writes the jobber_payments row invoice_financials needs to
// compute payment_status, and flips the mirror invoice's own status
// column too (cosmetic/defensive for anything reading jobber_invoices
// directly). jobber_payment_id is derived from the Stripe PaymentIntent
// id, which is itself unique, so a webhook retry for the same PI just
// re-upserts the same row -- harmless, same at-least-once-delivery
// reasoning as upsertPaymentByIntentId above.
//
// Known gap: a refund on a native invoice (handleChargeRefunded above)
// updates the native `payments` table but does not currently remove/
// adjust this mirror row -- Revenue/Transactions would keep showing a
// refunded native invoice as paid. Native invoices are new and refunds
// are rare/manual today; revisit if that turns out to matter.
async function mirrorNativeInvoicePayment(params: {
  invoiceId: string;
  jobberClientId: string;
  stripePaymentIntentId: string;
  amount: number;
  paidAt: string;
}): Promise<void> {
  const mirrorInvoiceId = nativeMirrorInvoiceId(params.invoiceId);

  const { error: paymentError } = await supabaseServer.from("jobber_payments").upsert(
    {
      jobber_payment_id: `native-payment-${params.stripePaymentIntentId}`,
      jobber_invoice_id: mirrorInvoiceId,
      jobber_client_id: params.jobberClientId,
      amount: params.amount,
      payment_date: params.paidAt.slice(0, 10),
      payment_method: "Stripe",
      adjustment_type: null,
      transaction_status: "succeeded",
      tip_amount: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "jobber_payment_id" }
  );

  if (paymentError) {
    console.error(
      `Failed to mirror payment for native invoice ${params.invoiceId}:`,
      paymentError.message
    );
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_invoices")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("jobber_invoice_id", mirrorInvoiceId);

  if (statusError) {
    console.error(
      `Failed to update mirror invoice status to paid for ${params.invoiceId}:`,
      statusError.message
    );
  }
}

// Flips an invoice to paid. Guards against downgrading a voided invoice
// (e.g. a stale/duplicate webhook arriving for an invoice that's since
// been voided) -- every other status is fair game to move to paid,
// including re-marking an already-paid invoice paid again (harmless).
//
// amount/stripePaymentIntentId are used only for the jobber_payments
// mirror write below -- the native `payments` row itself is already
// written by upsertPaymentByIntentId before this is called (see both
// call sites in lib/stripeWebhookProcessor.ts).
export async function markInvoicePaid(params: {
  invoiceId: string;
  paidAt: string;
  amount: number;
  stripePaymentIntentId: string;
}): Promise<void> {
  const { invoiceId, paidAt, amount, stripePaymentIntentId } = params;

  const { data: invoiceRow, error } = await supabaseServer
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId)
    .neq("status", "void")
    .select("id, jobber_client_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark invoice ${invoiceId} paid: ${error.message}`);
  }

  // No row means either the invoice was void (guarded above -- correct
  // to skip) or doesn't exist. Either way there's nothing to mirror.
  if (invoiceRow?.jobber_client_id) {
    await mirrorNativeInvoicePayment({
      invoiceId,
      jobberClientId: invoiceRow.jobber_client_id,
      stripePaymentIntentId,
      amount,
      paidAt,
    });
  }
}

// Looks up an invoice by the Checkout Session id stored on it
// (invoices.stripe_checkout_session_id, set when the session is
// created -- see app/(platform)/invoice-test/actions.ts). Used as a
// fallback when a Stripe event's metadata.invoice_id is missing for
// some reason.
export async function findInvoiceIdByCheckoutSessionId(
  checkoutSessionId: string
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("invoices")
    .select("id")
    .eq("stripe_checkout_session_id", checkoutSessionId)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve invoice by checkout session id:", error);
    return null;
  }

  return data?.id ?? null;
}

// Looks up the invoice a PaymentIntent is already linked to via an
// existing payments row (written by an earlier event for the same PI --
// e.g. checkout.session.completed processed before payment_intent.succeeded).
export async function findInvoiceIdByPaymentIntentId(
  paymentIntentId: string
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("payments")
    .select("invoice_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve invoice by payment intent id:", error);
    return null;
  }

  return data?.invoice_id ?? null;
}

export type UpsertPayoutParams = {
  stripePayoutId: string;
  status: string;
  amount: number;
  currency?: string | null;
  arrivalDate?: string | null;
  automatic?: boolean;
};

// Upserts on stripe_payout_id (migration 045's unique constraint) --
// same at-least-once-delivery reasoning as upsertPaymentByIntentId.
// Stripe sends payout.paid/payout.failed independently, so a payout row
// can land here more than once as its status changes.
export async function upsertStripePayout(
  params: UpsertPayoutParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer.from("stripe_payouts").upsert(
    {
      stripe_payout_id: params.stripePayoutId,
      status: params.status,
      amount: params.amount,
      currency: params.currency ?? null,
      arrival_date: params.arrivalDate ?? null,
      automatic: params.automatic ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_payout_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
