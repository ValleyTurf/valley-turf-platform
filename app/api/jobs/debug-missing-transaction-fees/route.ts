// One-time diagnostic (2026-09-25). Ryan: after the native-invoice fee
// fix, Linda Iverson and Robert Cox (Jobber-sourced) still show no fee,
// and Michelle Kowalski and Cere Edwards (native) still show no fee.
// Need to see the actual payment/fee rows behind each before guessing
// at another fix -- these could be four different root causes (fee sync
// gap, amount-matching miss, a failed/never-run Stripe balance_transaction
// fetch, a payment method Stripe doesn't charge a fee on, etc.).
//
// Read-only, admin-gated, manual-trigger only. Does not write anything.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOBBER_NAMES = ["iverson", "cox"];
const NATIVE_NAMES = ["kowalski", "edwards"];

async function findCustomers(names: string[]) {
  const filters = names.flatMap((n) => [
    `full_name.ilike.%${n}%`,
    `last_name.ilike.%${n}%`,
  ]);

  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, first_name, last_name")
    .or(filters.join(","));

  if (error) throw error;
  return data ?? [];
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const jobberCustomers = await findCustomers(JOBBER_NAMES);
  const nativeCustomers = await findCustomers(NATIVE_NAMES);

  const jobberResults = await Promise.all(
    jobberCustomers.map(async (customer) => {
      const { data: payments } = await supabaseServer
        .from("jobber_payments")
        .select(
          "jobber_payment_id, jobber_invoice_id, amount, payment_date, payment_method, adjustment_type"
        )
        .eq("jobber_client_id", customer.jobber_client_id)
        .order("payment_date", { ascending: false })
        .limit(20);

      const invoiceIds = Array.from(
        new Set((payments ?? []).map((p) => p.jobber_invoice_id).filter(Boolean))
      );

      const { data: fees } =
        invoiceIds.length > 0
          ? await supabaseServer
              .from("jobber_payment_fees")
              .select("jobber_invoice_id, amount, fee_amount, surcharge_amount")
              .in("jobber_invoice_id", invoiceIds)
          : { data: [] };

      return {
        name:
          `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() ||
          customer.full_name,
        jobberClientId: customer.jobber_client_id,
        payments: payments ?? [],
        feeRowsForThoseInvoices: fees ?? [],
      };
    })
  );

  const nativeResults = await Promise.all(
    nativeCustomers.map(async (customer) => {
      const { data: jobberPayments } = await supabaseServer
        .from("jobber_payments")
        .select("jobber_payment_id, jobber_invoice_id, amount, payment_date, payment_method")
        .eq("jobber_client_id", customer.jobber_client_id)
        .order("payment_date", { ascending: false })
        .limit(20);

      const { data: invoices } = await supabaseServer
        .from("invoices")
        .select("id, invoice_number, total, status")
        .eq("jobber_client_id", customer.jobber_client_id)
        .order("created_at", { ascending: false })
        .limit(20);

      const invoiceIds = (invoices ?? []).map((i) => i.id);

      const { data: nativePayments } =
        invoiceIds.length > 0
          ? await supabaseServer
              .from("payments")
              .select(
                "invoice_id, stripe_payment_intent_id, stripe_charge_id, amount, method, status, fee_amount, net_amount, paid_at"
              )
              .in("invoice_id", invoiceIds)
          : { data: [] };

      return {
        name:
          `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() ||
          customer.full_name,
        jobberClientId: customer.jobber_client_id,
        jobberPaymentsMirror: jobberPayments ?? [],
        nativeInvoices: invoices ?? [],
        nativePayments: nativePayments ?? [],
      };
    })
  );

  return NextResponse.json({
    success: true,
    jobberSourced: jobberResults,
    native: nativeResults,
  });
}
