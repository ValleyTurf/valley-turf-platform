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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PaymentRow = {
  stripe_charge_id: string | null;
  fee_amount: number | string | null;
  paid_at: string | null;
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
    .select("stripe_charge_id, fee_amount, paid_at")
    .eq("status", "succeeded")
    .not("fee_amount", "is", null)
    .gt("fee_amount", 0);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PaymentRow[];
  const eligible = rows.filter((row) => row.stripe_charge_id);
  // A payment can have a fee recorded but no charge id in the rare case
  // a PaymentIntent succeeded without a retrievable latest_charge --
  // recordStripeProcessingFeeExpense's upsert key is stripe_charge_id,
  // so there's nothing to dedupe on for one of these; flagged rather
  // than silently skipped.
  const skippedNoChargeId = rows.length - eligible.length;

  let logged = 0;

  if (apply) {
    for (const row of eligible) {
      await recordStripeProcessingFeeExpense({
        chargeId: row.stripe_charge_id as string,
        feeAmount: Number(row.fee_amount),
        expenseDate: (row.paid_at ?? new Date().toISOString()).slice(0, 10),
      });
      logged += 1;
    }

    await recordAuditLog({
      actor,
      action: "create",
      entityType: "processing_fee_backfill",
      entityId: `stripe-fee-backfill-${new Date().toISOString()}`,
      entityLabel: "Stripe processing fee backfill",
      after: { eligible: eligible.length, skippedNoChargeId, logged },
    });
  }

  return NextResponse.json({
    success: true,
    dryRun: !apply,
    applied: apply,
    eligibleCount: eligible.length,
    skippedNoChargeId,
    logged,
  });
}
