// Native payment records + invoice status transitions (Tier 1, Stage 5).
// Written to almost exclusively by lib/stripeWebhookProcessor.ts's real
// handlers -- nothing else should mutate the payments table or flip an
// invoice to "paid" outside of a verified Stripe webhook event, with one
// deliberate exception: recordManualInvoicePayment below, for a
// staff-recorded cash/check payment that never touches Stripe at all
// (Ryan, 2026-09-20 -- Debbie Edwards paid in cash on a draft invoice).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { pushPaymentToQuickbooks } from "@/lib/quickbooks";

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
  tipAmount: number;
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
      // Was hardcoded to 0 -- markInvoicePaid now derives the actual tip
      // (checkout total minus the invoice's billed total) and passes it
      // through, so it shows up on the customer card and in the
      // timecards tip attribution (lib/tips.ts filters on tip_amount > 0).
      tip_amount: params.tipAmount,
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
//
// Returns the derived tip amount so callers (lib/stripeWebhookProcessor.ts)
// can pass it into the payment-received alert and the receipt email/SMS --
// Stripe never tracks a tip as its own figure (see app/pay/[token]/TipSelector.tsx
// and lib/stripeCheckout.ts), it's just folded into the Checkout Session's
// total, so the only way to recover it is (amount actually captured) minus
// (the invoice's own billed total).
export async function markInvoicePaid(params: {
  invoiceId: string;
  paidAt: string;
  amount: number;
  stripePaymentIntentId: string;
}): Promise<{ tipAmount: number }> {
  const { invoiceId, paidAt, amount, stripePaymentIntentId } = params;

  const { data: invoiceRow, error } = await supabaseServer
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId)
    .neq("status", "void")
    .select("id, jobber_client_id, quickbooks_invoice_id, total")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark invoice ${invoiceId} paid: ${error.message}`);
  }

  const tipAmount =
    invoiceRow?.total != null
      ? Math.max(0, Math.round((amount - Number(invoiceRow.total)) * 100) / 100)
      : 0;

  // No row means either the invoice was void (guarded above -- correct
  // to skip) or doesn't exist. Either way there's nothing to mirror.
  if (invoiceRow?.jobber_client_id) {
    await mirrorNativeInvoicePayment({
      invoiceId,
      jobberClientId: invoiceRow.jobber_client_id,
      stripePaymentIntentId,
      amount,
      tipAmount,
      paidAt,
    });
  }

  // Stage 8: record the payment against the QuickBooks invoice pushed
  // at creation time (lib/quickbooks.ts, called from
  // app/(platform)/invoices/actions.ts). Only possible if that earlier
  // push actually succeeded -- if it didn't, quickbooks_invoice_id is
  // null and there's nothing to link a payment to yet. Best-effort,
  // same as the jobber_payments mirror above -- never throws.
  if (invoiceRow?.jobber_client_id && invoiceRow.quickbooks_invoice_id) {
    const qbResult = await pushPaymentToQuickbooks({
      jobberClientId: invoiceRow.jobber_client_id,
      quickbooksInvoiceId: invoiceRow.quickbooks_invoice_id,
      amount,
      paidDate: paidAt.slice(0, 10),
    });

    if (qbResult.ok) {
      await supabaseServer
        .from("invoices")
        .update({ quickbooks_payment_id: qbResult.quickbooksPaymentId, quickbooks_push_error: null })
        .eq("id", invoiceId);
    } else {
      console.error(`QuickBooks payment push failed for invoice ${invoiceId}:`, qbResult.error);
      await supabaseServer
        .from("invoices")
        .update({ quickbooks_push_error: qbResult.error })
        .eq("id", invoiceId);
    }
  }

  return { tipAmount };
}

// Staff-recorded cash/check payment -- a customer who pays in person
// never generates a Stripe event, so without this a draft/sent native
// invoice would just sit there forever with no way to reflect that it's
// actually been collected. Deliberately separate from markInvoicePaid
// above (not a thin wrapper around it) so that function's own "only a
// verified Stripe webhook calls this" comment stays true, and so this
// path never needs a real stripePaymentIntentId.
//
// Mirrors markInvoicePaid's bookkeeping as closely as it can without
// Stripe involved: same invoice-status flip, same jobber_payments/
// jobber_invoices mirror writes (so Revenue/Transactions/Job Costing
// Analytics see it exactly like any other paid invoice), same
// QuickBooks payment push. No tip -- there's nothing to derive a tip
// from without a Checkout Session total, and cash tips aren't tracked
// here today.
//
// Never sends anything -- no email, no SMS, no receipt of any kind.
// That's implicit (this function only touches the database), but
// worth stating since it's the whole point of this path existing:
// Ryan's explicit ask was to mark a cash payment paid *without*
// notifying the customer.
export async function recordManualInvoicePayment(params: {
  invoiceId: string;
  paidAt: string;
  amount: number;
  // Free text, same as payments.method for a Stripe payment -- "Cash",
  // "Check", etc. Not a controlled vocabulary.
  method: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { invoiceId, paidAt, amount, method } = params;

  const { data: invoiceRow, error } = await supabaseServer
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId)
    .neq("status", "void")
    .select("id, jobber_client_id, quickbooks_invoice_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!invoiceRow) {
    return {
      ok: false,
      error: "Invoice not found, or it's already been voided.",
    };
  }

  // Synthetic id standing in for a real Stripe PaymentIntent id --
  // payments.stripe_payment_intent_id is NOT NULL + unique (migration
  // 044), same reasoning as the "native-"/"native-payment-" synthetic
  // ids used elsewhere for records with no real Jobber/Stripe
  // counterpart. Keyed on the invoice id, so re-marking the same
  // invoice paid updates this same row instead of creating a duplicate.
  const syntheticId = `manual-${invoiceId}`;

  const { error: paymentError } = await supabaseServer.from("payments").upsert(
    {
      invoice_id: invoiceId,
      stripe_payment_intent_id: syntheticId,
      amount,
      method,
      status: "succeeded",
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_payment_intent_id" }
  );

  if (paymentError) {
    console.error(
      `Failed to record manual payment for invoice ${invoiceId}:`,
      paymentError.message
    );
  }

  if (invoiceRow.jobber_client_id) {
    const mirrorInvoiceId = nativeMirrorInvoiceId(invoiceId);

    const { error: mirrorPaymentError } = await supabaseServer
      .from("jobber_payments")
      .upsert(
        {
          jobber_payment_id: `native-payment-${syntheticId}`,
          jobber_invoice_id: mirrorInvoiceId,
          jobber_client_id: invoiceRow.jobber_client_id,
          amount,
          payment_date: paidAt.slice(0, 10),
          payment_method: method,
          adjustment_type: null,
          transaction_status: "succeeded",
          tip_amount: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "jobber_payment_id" }
      );

    if (mirrorPaymentError) {
      console.error(
        `Failed to mirror manual payment for invoice ${invoiceId}:`,
        mirrorPaymentError.message
      );
    }

    const { error: statusError } = await supabaseServer
      .from("jobber_invoices")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("jobber_invoice_id", mirrorInvoiceId);

    if (statusError) {
      console.error(
        `Failed to update mirror invoice status to paid for ${invoiceId}:`,
        statusError.message
      );
    }
  }

  // Stage 8, same as markInvoicePaid -- only possible if the earlier
  // QuickBooks push at invoice-creation time actually succeeded.
  if (invoiceRow.jobber_client_id && invoiceRow.quickbooks_invoice_id) {
    const qbResult = await pushPaymentToQuickbooks({
      jobberClientId: invoiceRow.jobber_client_id,
      quickbooksInvoiceId: invoiceRow.quickbooks_invoice_id,
      amount,
      paidDate: paidAt.slice(0, 10),
    });

    if (qbResult.ok) {
      await supabaseServer
        .from("invoices")
        .update({
          quickbooks_payment_id: qbResult.quickbooksPaymentId,
          quickbooks_push_error: null,
        })
        .eq("id", invoiceId);
    } else {
      console.error(
        `QuickBooks payment push failed for invoice ${invoiceId}:`,
        qbResult.error
      );
      await supabaseServer
        .from("invoices")
        .update({ quickbooks_push_error: qbResult.error })
        .eq("id", invoiceId);
    }
  }

  return { ok: true };
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
