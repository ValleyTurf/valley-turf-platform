// Refunds for payments this app's own Stripe account took (native
// invoices / autopay). Payments taken through Jobber's processor cannot be
// refunded from here -- those are refunded inside Jobber and arrive via the
// Jobber payment sync with a REFUNDED status.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getStripeClient } from "@/lib/stripe";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import {
  checkRefundAmount,
  stripeReasonFor,
  type RefundReason,
} from "@/lib/refundLogic";

// Mirrors a refund into the local tables. Idempotent: the Stripe webhook
// (charge.refunded) and the refund button both call it with the CUMULATIVE
// amount refunded on the charge, and the mirror row is keyed on the
// PaymentIntent, so running it twice (or for several partial refunds)
// always lands on the right running total.
export async function recordNativeRefund(params: {
  paymentIntentId: string;
  refundedCents: number;
  fullyRefunded: boolean;
}): Promise<{ invoiceId: string | null; error: string | null }> {
  const { paymentIntentId, refundedCents, fullyRefunded } = params;
  const now = new Date().toISOString();

  const { data: paymentRow, error: lookupError } = await supabaseServer
    .from("payments")
    .select("invoice_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (lookupError) {
    return { invoiceId: null, error: `Failed to look up payment: ${lookupError.message}` };
  }

  // The payments.status check constraint has no "partially refunded", so
  // only a full refund flips the payment itself.
  if (fullyRefunded) {
    const { error } = await supabaseServer
      .from("payments")
      .update({ status: "refunded", updated_at: now })
      .eq("stripe_payment_intent_id", paymentIntentId);

    if (error) {
      return { invoiceId: null, error: `Failed to mark payment refunded: ${error.message}` };
    }
  }

  const invoiceId = (paymentRow?.invoice_id as string | null) ?? null;

  if (!invoiceId || refundedCents <= 0) {
    return { invoiceId, error: null };
  }

  const mirrorInvoiceId = `native-${invoiceId}`;

  const { data: mirrorInvoiceRow } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_client_id")
    .eq("jobber_invoice_id", mirrorInvoiceId)
    .maybeSingle();

  const { error: refundMirrorError } = await supabaseServer.from("jobber_payments").upsert(
    {
      jobber_payment_id: `native-refund-${paymentIntentId}`,
      jobber_invoice_id: mirrorInvoiceId,
      jobber_client_id: mirrorInvoiceRow?.jobber_client_id ?? null,
      amount: -(refundedCents / 100),
      payment_date: toPhoenixDateString(now),
      payment_method: "Stripe",
      adjustment_type: "refund",
      transaction_status: "refunded",
      tip_amount: 0,
      updated_at: now,
    },
    { onConflict: "jobber_payment_id" }
  );

  if (refundMirrorError) {
    console.error(
      `Failed to mirror refund for payment intent ${paymentIntentId}:`,
      refundMirrorError.message
    );
  }

  // A full refund puts the invoice back to unpaid so it can be charged
  // again or replaced. Only a paid invoice is touched. Autopay will not
  // re-charge it on its own (it refuses invoices with an earlier
  // successful charge).
  if (fullyRefunded) {
    const { error: reopenError } = await supabaseServer
      .from("invoices")
      .update({ status: "sent", paid_at: null, updated_at: now })
      .eq("id", invoiceId)
      .eq("status", "paid");

    if (reopenError) {
      console.error(`Failed to reopen invoice ${invoiceId} after refund:`, reopenError.message);
    }

    await supabaseServer
      .from("jobber_invoices")
      .update({ status: "sent", updated_at: now })
      .eq("jobber_invoice_id", mirrorInvoiceId)
      .eq("status", "paid");
  }

  return { invoiceId, error: null };
}

export type IssueRefundResult =
  | { error: string }
  | { error: null; refundedAmount: number; fullyRefunded: boolean; invoiceId: string | null };

// Sends the refund to Stripe, then mirrors it locally right away (the
// webhook would also do it a moment later, harmlessly).
export async function issueRefund(params: {
  paymentIntentId: string;
  amountDollars: number;
  reason: RefundReason;
  note: string | null;
  actorName: string;
}): Promise<IssueRefundResult> {
  const stripe = getStripeClient();

  const { data: paymentRow } = await supabaseServer
    .from("payments")
    .select("status")
    .eq("stripe_payment_intent_id", params.paymentIntentId)
    .maybeSingle();

  if (!paymentRow) {
    return { error: "That payment was not taken through the CRM, so it cannot be refunded here." };
  }

  const intent = await stripe.paymentIntents.retrieve(params.paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge =
    intent.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;

  if (!charge || !charge.paid) {
    return { error: "Stripe shows no completed charge for this payment, so there is nothing to refund." };
  }

  const check = checkRefundAmount(params.amountDollars, charge.amount, charge.amount_refunded);

  if (!check.ok) {
    return { error: check.error };
  }

  try {
    await stripe.refunds.create(
      {
        payment_intent: params.paymentIntentId,
        amount: check.cents,
        reason: stripeReasonFor(params.reason),
        metadata: {
          reason: params.reason,
          note: params.note ?? "",
          refunded_by: params.actorName,
        },
      },
      // Same payment, same already-refunded total, same amount => one refund,
      // even if the button is pressed twice.
      { idempotencyKey: `refund-${params.paymentIntentId}-${charge.amount_refunded}-${check.cents}` }
    );
  } catch (error) {
    return {
      error: `Stripe could not issue the refund: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  const cumulative = charge.amount_refunded + check.cents;
  const recorded = await recordNativeRefund({
    paymentIntentId: params.paymentIntentId,
    refundedCents: cumulative,
    fullyRefunded: check.fullyRefunded,
  });

  if (recorded.error) {
    // The refund already went through at Stripe; the webhook will finish the
    // local bookkeeping.
    console.error(recorded.error);
  }

  return {
    error: null,
    refundedAmount: check.cents / 100,
    fullyRefunded: check.fullyRefunded,
    invoiceId: recorded.invoiceId,
  };
}
