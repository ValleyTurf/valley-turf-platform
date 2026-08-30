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

// Flips an invoice to paid. Guards against downgrading a voided invoice
// (e.g. a stale/duplicate webhook arriving for an invoice that's since
// been voided) -- every other status is fair game to move to paid,
// including re-marking an already-paid invoice paid again (harmless).
export async function markInvoicePaid(
  invoiceId: string,
  paidAt: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId)
    .neq("status", "void");

  if (error) {
    throw new Error(`Failed to mark invoice ${invoiceId} paid: ${error.message}`);
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
