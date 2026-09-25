// One-time backfill (2026-09-25). Ryan: Michele Kowalski and Cere Edwards
// (native, Stripe-processed) still show no fee on Transactions even after
// the native-invoice fee fix landed. Their `payments.fee_amount` is
// actually null (not $0) and `stripe_charge_id` is also null.
//
// Root cause, traced through lib/stripeWebhookProcessor.ts's
// handlePaymentIntentSucceeded: it reads the charge id off
// paymentIntent.latest_charge, and only fetches the real processing fee
// (from the Charge's balance_transaction) when that charge id is present.
// For these two, latest_charge apparently wasn't on the
// payment_intent.succeeded webhook payload when it was processed, so
// chargeId was null, the whole fee fetch was skipped, and the gap is
// permanent until backfilled -- it does not self-heal, and it's not
// limited to these two names. This backfills every succeeded native
// payment missing a fee, not just Kowalski/Edwards.
//
// Re-fetches each affected PaymentIntent directly from Stripe (Stripe
// still has the charge/balance_transaction data) and fills in
// stripe_charge_id, fee_amount, net_amount.
//
// Excludes stripe_payment_intent_id starting with "manual-" -- those are
// manually-recorded cash/check payments (lib/payments.ts's
// recordManualInvoicePayment), never real Stripe charges, and genuinely
// have no fee to backfill.
//
// Dry-run by default (?apply=true to write), admin-gated, processes up to
// `limit` rows per run (default 100, max 500, ?limit= to override) to
// stay inside the route's time budget -- rerun after an apply to pick up
// any rows still remaining.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  stripe_payment_intent_id: string;
  amount: number | string;
};

type ResultStatus =
  | "updated"
  | "would_update"
  | "no_charge_on_intent"
  | "no_balance_transaction"
  | "error";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe not configured." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "true";
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100)
  );

  const { data: rows, error: selectError } = await supabaseServer
    .from("payments")
    .select("id, invoice_id, stripe_payment_intent_id, amount")
    .eq("status", "succeeded")
    .is("fee_amount", null)
    .not("stripe_payment_intent_id", "like", "manual-%")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const candidates = (rows ?? []) as PaymentRow[];

  const results: {
    id: string;
    invoiceId: string | null;
    stripePaymentIntentId: string;
    amount: number;
    status: ResultStatus;
    chargeId: string | null;
    feeAmount: number | null;
    netAmount: number | null;
    error?: string;
  }[] = [];

  for (const row of candidates) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        row.stripe_payment_intent_id,
        { expand: ["latest_charge.balance_transaction"] }
      );

      const charge =
        typeof paymentIntent.latest_charge !== "string"
          ? (paymentIntent.latest_charge ?? null)
          : null;

      if (!charge) {
        results.push({
          id: row.id,
          invoiceId: row.invoice_id,
          stripePaymentIntentId: row.stripe_payment_intent_id,
          amount: Number(row.amount ?? 0),
          status: "no_charge_on_intent",
          chargeId: null,
          feeAmount: null,
          netAmount: null,
        });
        continue;
      }

      const balanceTransaction =
        typeof charge.balance_transaction !== "string"
          ? (charge.balance_transaction ?? null)
          : null;

      if (!balanceTransaction) {
        results.push({
          id: row.id,
          invoiceId: row.invoice_id,
          stripePaymentIntentId: row.stripe_payment_intent_id,
          amount: Number(row.amount ?? 0),
          status: "no_balance_transaction",
          chargeId: charge.id,
          feeAmount: null,
          netAmount: null,
        });
        continue;
      }

      const feeAmount = balanceTransaction.fee / 100;
      const netAmount = balanceTransaction.net / 100;

      if (apply) {
        const { error: updateError } = await supabaseServer
          .from("payments")
          .update({
            stripe_charge_id: charge.id,
            fee_amount: feeAmount,
            net_amount: netAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateError) {
          results.push({
            id: row.id,
            invoiceId: row.invoice_id,
            stripePaymentIntentId: row.stripe_payment_intent_id,
            amount: Number(row.amount ?? 0),
            status: "error",
            chargeId: charge.id,
            feeAmount,
            netAmount,
            error: updateError.message,
          });
          continue;
        }
      }

      results.push({
        id: row.id,
        invoiceId: row.invoice_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        amount: Number(row.amount ?? 0),
        status: apply ? "updated" : "would_update",
        chargeId: charge.id,
        feeAmount,
        netAmount,
      });
    } catch (error) {
      results.push({
        id: row.id,
        invoiceId: row.invoice_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        amount: Number(row.amount ?? 0),
        status: "error",
        chargeId: null,
        feeAmount: null,
        netAmount: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    success: true,
    apply,
    scanned: candidates.length,
    updated: results.filter((r) => r.status === "updated").length,
    wouldUpdate: results.filter((r) => r.status === "would_update").length,
    problems: results.filter((r) =>
      r.status === "no_charge_on_intent" ||
      r.status === "no_balance_transaction" ||
      r.status === "error"
    ).length,
    results,
  });
}
