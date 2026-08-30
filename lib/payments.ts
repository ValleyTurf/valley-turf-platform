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
