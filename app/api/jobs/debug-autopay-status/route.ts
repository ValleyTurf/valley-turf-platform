// Ryan (2026-09-27): "Has anyone set up auto pay yet in our system?"
//
// lib/autopay.ts's customer_payment_methods table has three possible
// states per customer: a saved card with autopay on (stripePaymentMethodId
// set, autopayEnabled true), a saved card with autopay off (card on file
// but toggled off), an enrollment link generated but never completed
// (enrollmentToken set, no stripePaymentMethodId yet), or no row at all
// (never started). There's no admin-facing list across all customers --
// only the per-customer page shows one at a time -- so this pulls every
// row and buckets them.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type PaymentMethodRow = {
  jobber_client_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  autopay_enabled: boolean;
  enrollment_token: string | null;
  created_at: string | null;
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data: rows, error } = await supabaseServer
    .from("customer_payment_methods")
    .select(
      "jobber_client_id, stripe_customer_id, stripe_payment_method_id, card_brand, card_last4, autopay_enabled, enrollment_token, created_at"
    );

  if (error) {
    return NextResponse.json(
      { error: error.message, step: "customer_payment_methods" },
      { status: 500 }
    );
  }

  const clientIds = (rows ?? []).map((r) => r.jobber_client_id);

  const { data: customerRows } = clientIds.length
    ? await supabaseServer
        .from("customers")
        .select("jobber_client_id, first_name, last_name")
        .in("jobber_client_id", clientIds)
    : { data: [] as { jobber_client_id: string; first_name: string | null; last_name: string | null }[] };

  const nameByClientId = new Map(
    (customerRows ?? []).map((c) => [
      c.jobber_client_id,
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    ])
  );

  const withName = (r: PaymentMethodRow) => ({
    name: nameByClientId.get(r.jobber_client_id) ?? "(unknown)",
    jobberClientId: r.jobber_client_id,
    cardBrand: r.card_brand,
    cardLast4: r.card_last4,
    autopayEnabled: r.autopay_enabled,
    createdAt: r.created_at,
  });

  const autopayOn = (rows ?? []).filter(
    (r) => r.stripe_payment_method_id && r.autopay_enabled
  );
  const cardOnFileAutopayOff = (rows ?? []).filter(
    (r) => r.stripe_payment_method_id && !r.autopay_enabled
  );
  const enrollmentStartedNotCompleted = (rows ?? []).filter(
    (r) => !r.stripe_payment_method_id && r.enrollment_token
  );

  return NextResponse.json({
    success: true,
    totalRows: (rows ?? []).length,
    autopayOnCount: autopayOn.length,
    cardOnFileAutopayOffCount: cardOnFileAutopayOff.length,
    enrollmentStartedNotCompletedCount: enrollmentStartedNotCompleted.length,
    autopayOn: autopayOn.map(withName),
    cardOnFileAutopayOff: cardOnFileAutopayOff.map(withName),
    enrollmentStartedNotCompleted: enrollmentStartedNotCompleted.map(withName),
  });
}
