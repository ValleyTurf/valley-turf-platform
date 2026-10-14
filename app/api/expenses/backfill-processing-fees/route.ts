// One-time backfill for native Stripe processing fees that succeeded
// before the auto-logging code (migration 097, lib/paymentFeeExpenses.ts)
// went live. handlePaymentIntentSucceeded in
// lib/stripeWebhookProcessor.ts only logs a fee going forward, from a
// real webhook event -- so anything that succeeded earlier already has
// its fee sitting in payments.fee_amount, fetched back when it
// happened, but never made it into `expenses`. Confirmed on Ryan's data
// 2026-10-14: 20 succeeded payments with a fee_amount, 0 of them in the
// last two days.
//
// Jobber's equivalent (app/api/jobber/sync-payment-fees/route.ts)
// didn't need one of these -- that route walks every page of Jobber's
// payment records on every run (no incremental cursor), so the first
// run after that code shipped already caught every historical fee.
// Native Stripe charges aren't re-walkable the same way -- the
// PaymentIntent already succeeded, so there's no event left to re-fire
// -- hence this reads straight from the `payments` table instead.
//
// 9 of the first 20 rows checked had fee_amount set but
// stripe_charge_id/method null -- a real (now-fixed, see
// lib/payments.ts's upsertPaymentByIntentId) bug where
// checkout.session.completed or payment_intent.payment_failed, neither
// of which has a charge id, could land after payment_intent.succeeded
// for the same PaymentIntent and silently null out what it had already
// set correctly. The column's gone from the DB, but Stripe still knows
// it -- stripe.paymentIntents.retrieve(stripe_payment_intent_id) gets
// latest_charge back, and this also writes it onto the payments row so
// a second run doesn't need to ask Stripe again for the same one.
//
// Same dry-run-by-default, admin-gated, ?apply=true-to-write shape as
// every other one-off data fix in this app (app/api/plaid/sync/route.ts,
// app/api/expenses/import-quickbooks/route.ts). Safe to run more than
// once -- recordStripeProcessingFeeExpense upserts on
// expenses.stripe_charge_id, so re-applying never duplicates a row.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { recordStripeProcessingFeeExpense } from "@/lib/paymentFeeExpenses";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PaymentRow = {
  stripe_payment_intent_id: string;
  stripe_charge_id: string | null;
  fee_amount: number | string | null;
  paid_at: string | null;
};

type ResolvedFee = {
  chargeId: string;
  feeAmount: number;
  expenseDate: string;
  paymentIntentId: string;
  recoveredFromStripe: boolean;
};

export async function POST(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  const { data, error } = await supabaseServer
    .from("payments")
    .select("stripe_payment_intent_id, stripe_charge_id, fee_amount, paid_at")
    .eq("status", "succeeded")
    .not("fee_amount", "is", null)
    .gt("fee_amount", 0);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PaymentRow[];
  const resolved: ResolvedFee[] = [];
  let unresolvable = 0;

  for (const row of rows) {
    let chargeId = row.stripe_charge_id;
    let recoveredFromStripe = false;

    if (!chargeId) {
      try {
        const stripe = getStripeClient();
        const paymentIntent = await stripe.paymentIntents.retrieve(
          row.stripe_payment_intent_id
        );
        chargeId =
          typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : (paymentIntent.latest_charge?.id ?? null);
        recoveredFromStripe = chargeId !== null;
      } catch (err) {
        console.error(
          `Failed to recover charge id for ${row.stripe_payment_intent_id} from Stripe:`,
          err
        );
      }
    }

    if (!chargeId) {
      unresolvable += 1;
      continue;
    }

    resolved.push({
      chargeId,
      feeAmount: Number(row.fee_amount),
      expenseDate: (row.paid_at ?? new Date().toISOString()).slice(0, 10),
      paymentIntentId: row.stripe_payment_intent_id,
      recoveredFromStripe,
    });
  }

  const recoveredCount = resolved.filter((r) => r.recoveredFromStripe).length;
  let logged = 0;

  if (apply) {
    for (const item of resolved) {
      await recordStripeProcessingFeeExpense({
        chargeId: item.chargeId,
        feeAmount: item.feeAmount,
        expenseDate: item.expenseDate,
      });

      if (item.recoveredFromStripe) {
        // Persist the recovered charge id so a second run (or the next
        // webhook retry for this PaymentIntent) doesn't need to ask
        // Stripe again -- same table, just filling in what the
        // clobbering bug erased.
        await supabaseServer
          .from("payments")
          .update({ stripe_charge_id: item.chargeId })
          .eq("stripe_payment_intent_id", item.paymentIntentId)
          .is("stripe_charge_id", null);
      }

      logged += 1;
    }

    await recordAuditLog({
      actor,
      action: "create",
      entityType: "processing_fee_backfill",
      entityId: `stripe-fee-backfill-${new Date().toISOString()}`,
      entityLabel: "Stripe processing fee backfill",
      after: { resolved: resolved.length, recoveredCount, unresolvable, logged },
    });
  }

  return NextResponse.json({
    success: true,
    dryRun: !apply,
    applied: apply,
    eligibleCount: resolved.length,
    recoveredFromStripeCount: recoveredCount,
    unresolvable,
    logged,
  });
}
