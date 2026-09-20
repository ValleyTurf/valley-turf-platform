// One-time diagnostic (2026-09-20), follow-up to debug-unpaid-native.
// That route showed 13 of 15 native invoices sitting at status "paid" --
// far more than the 2 "sent" (unpaid) ones Ryan expected, given he says he
// has native invoices that haven't actually been paid. markInvoicePaid and
// recordManualInvoicePayment (lib/payments.ts) are supposedly the only two
// places that ever flip a native invoice to "paid", and both are only
// called after a real Stripe webhook event or a staff-entered cash/check
// payment -- so if that's true, every "paid" invoice should have a
// matching row in the native `payments` table. This checks that directly:
// for every native invoice sitting at status "paid", does a payments row
// (status "succeeded", any method) actually exist for it? If not, the
// status column was flipped without a real payment behind it -- which
// would explain invoices showing as paid (and therefore invisible to the
// digest) when the customer hasn't actually paid.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data: paidInvoices, error: invoiceError } = await supabaseServer
    .from("invoices")
    .select("id, invoice_number, customer_name, status, total, paid_at, updated_at")
    .eq("status", "paid");

  if (invoiceError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read invoices: ${invoiceError.message}` },
      { status: 500 }
    );
  }

  const invoices = paidInvoices ?? [];
  const invoiceIds = invoices.map((inv) => inv.id as string);

  const { data: paymentRows, error: paymentError } = await supabaseServer
    .from("payments")
    .select("invoice_id, status, amount, method, paid_at, stripe_payment_intent_id")
    .in("invoice_id", invoiceIds.length > 0 ? invoiceIds : ["__none__"]);

  if (paymentError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read payments: ${paymentError.message}` },
      { status: 500 }
    );
  }

  const paymentsByInvoiceId = new Map<string, typeof paymentRows>();
  for (const row of paymentRows ?? []) {
    const list = paymentsByInvoiceId.get(row.invoice_id as string) ?? [];
    list.push(row);
    paymentsByInvoiceId.set(row.invoice_id as string, list);
  }

  const report = invoices.map((invoice) => {
    const payments = paymentsByInvoiceId.get(invoice.id as string) ?? [];
    const succeededPayments = payments.filter((p) => p.status === "succeeded");
    const hasRealPayment = succeededPayments.length > 0;

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer_name,
      total: invoice.total,
      paidAt: invoice.paid_at,
      updatedAt: invoice.updated_at,
      paymentRowCount: payments.length,
      hasSucceededPayment: hasRealPayment,
      paymentStatuses: payments.map((p) => p.status),
      paymentMethods: payments.map((p) => p.method),
      suspicious: !hasRealPayment,
    };
  });

  const suspicious = report.filter((r) => r.suspicious);

  return NextResponse.json({
    success: true,
    totalPaidInvoices: report.length,
    withRealPaymentRecord: report.length - suspicious.length,
    suspiciousNoPaymentRecord: suspicious.length,
    suspiciousRows: suspicious,
    allRows: report,
  });
}
