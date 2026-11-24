// Loads a customer's payment history for the portal (and the single
// payment a receipt is built from). Everything is scoped by the signed-in
// customer's jobber_client_id, so one customer can never reach another's
// payment by guessing an id.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { buildPortalPayments, type PortalPayment, type RawPaymentRow } from "@/lib/portalPaymentsLogic";

const PAYMENT_COLUMNS =
  "jobber_payment_id, jobber_invoice_id, amount, payment_date, payment_method, tip_amount, transaction_status";

async function invoiceNumberMap(invoiceIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const ids = Array.from(new Set(invoiceIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const { data } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, invoice_number")
    .in("jobber_invoice_id", ids);

  for (const row of data ?? []) {
    map.set(row.jobber_invoice_id as string, (row.invoice_number as string | null) ?? null);
  }
  return map;
}

export async function loadPortalPayments(jobberClientId: string): Promise<PortalPayment[]> {
  const { data, error } = await supabaseServer
    .from("jobber_payments")
    .select(PAYMENT_COLUMNS)
    .eq("jobber_client_id", jobberClientId)
    .order("payment_date", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Portal payments query failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as RawPaymentRow[];
  const numbers = await invoiceNumberMap(rows.map((r) => r.jobber_invoice_id ?? ""));
  return buildPortalPayments(rows, numbers);
}

// One payment for a receipt. Returns null unless it belongs to this
// customer and is a real (non-failed, non-refund) payment.
export async function getPortalPayment(
  jobberClientId: string,
  paymentId: string
): Promise<PortalPayment | null> {
  // Load the whole history so a native payment's refund rows fold in.
  const all = await loadPortalPayments(jobberClientId);
  const match = all.find((p) => p.id === paymentId);
  return match && match.receiptAvailable ? match : null;
}
