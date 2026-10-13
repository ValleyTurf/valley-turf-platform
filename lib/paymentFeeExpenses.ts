// Ryan (2026-10-13): "no stripe processing fees show in here because
// they don't hit a bank account. How do I account for those?" -- "Yes,
// let's do both" (native Stripe and Jobber-processed fees).
//
// The fee data already existed in two places that never fed `expenses`:
// payments.fee_amount (lib/stripeWebhookProcessor.ts's
// handlePaymentIntentSucceeded, Tier 1 Stage 6 -- migration 044) and
// jobber_payment_fees.fee_amount/surcharge_amount (the existing
// app/api/jobber/sync-payment-fees/route.ts sync -- migration 022).
// This is the shared write path both call into: one pre-categorized
// (category bank_fees, status 'categorized' -- vendor and amount are
// already known with certainty straight from Stripe/Jobber, nothing
// for a human to review) expense row per fee, auto-logged the moment
// the fee is known.
//
// Idempotency: each function upserts on its own unique link column
// (expenses.stripe_charge_id / expenses.jobber_payment_record_id --
// migration 097) rather than inserting, so a retried Stripe webhook
// delivery or a re-run of the daily Jobber payment-fee sync can never
// create a second expense row for the same fee -- same reasoning as
// expenses.plaid_transaction_id for the bank feed (migration 090). If
// a fee amount is ever corrected upstream, the upsert refreshes the
// existing expense row rather than leaving a stale one behind.
//
// Best-effort and non-throwing, matching the existing comment on
// handlePaymentIntentSucceeded's own fee fetch ("if this fails, the
// payment still gets recorded... not worth failing/retrying the whole
// webhook over") -- a failure here shouldn't take down payment
// recording or the Jobber sync run, just leave that one fee to be
// fixed up manually or picked up by the next run.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export async function recordStripeProcessingFeeExpense(params: {
  chargeId: string;
  feeAmount: number;
  expenseDate: string;
}): Promise<void> {
  if (params.feeAmount <= 0) return;

  const { error } = await supabaseServer.from("expenses").upsert(
    {
      vendor: "Stripe",
      description: "Card/ACH processing fee",
      category: "bank_fees",
      amount: params.feeAmount,
      expense_date: params.expenseDate,
      source: "processing_fee",
      status: "categorized",
      stripe_charge_id: params.chargeId,
      notes: `Auto-logged from Stripe charge ${params.chargeId}'s balance transaction fee.`,
    },
    { onConflict: "stripe_charge_id" }
  );

  if (error) {
    console.error(
      `Failed to log Stripe processing fee expense for charge ${params.chargeId}:`,
      error.message
    );
  }
}

export async function recordJobberProcessingFeeExpense(params: {
  jobberPaymentRecordId: string;
  feeAmount: number;
  surchargeAmount: number;
  expenseDate: string | null;
}): Promise<void> {
  const totalFee = params.feeAmount + params.surchargeAmount;
  if (totalFee <= 0) return;

  const { error } = await supabaseServer.from("expenses").upsert(
    {
      vendor: "Jobber Payments",
      description: "Card/ACH processing fee",
      category: "bank_fees",
      amount: totalFee,
      expense_date: params.expenseDate ?? new Date().toISOString().slice(0, 10),
      source: "processing_fee",
      status: "categorized",
      jobber_payment_record_id: params.jobberPaymentRecordId,
      notes: `Auto-logged from Jobber payment record ${params.jobberPaymentRecordId}.`,
    },
    { onConflict: "jobber_payment_record_id" }
  );

  if (error) {
    console.error(
      `Failed to log Jobber processing fee expense for ${params.jobberPaymentRecordId}:`,
      error.message
    );
  }
}
