// Pure view-model helpers for the customer portal's Payments page and the
// receipt PDF. Payments live in jobber_payments (Jobber-synced rows plus
// native "native-payment-<pi>" / "native-refund-<pi>" mirrors), so this
// turns those raw rows into what a customer should see: each payment, any
// refund against it, and whether a receipt can be downloaded.

export type RawPaymentRow = {
  jobber_payment_id: string;
  jobber_invoice_id: string | null;
  amount: number | string | null;
  payment_date: string | null;
  payment_method: string | null;
  tip_amount: number | string | null;
  transaction_status: string | null;
};

export type PortalPaymentState =
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "failed"
  | "refund";

export type PortalPayment = {
  id: string;
  date: string | null;
  amount: number;
  tip: number;
  methodLabel: string;
  invoiceNumber: string | null;
  state: PortalPaymentState;
  refundedAmount: number;
  receiptAvailable: boolean;
};

const NATIVE_PAYMENT_PREFIX = "native-payment-";
const NATIVE_REFUND_PREFIX = "native-refund-";

function toMoney(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function paymentMethodLabel(method: string | null | undefined): string {
  const m = (method ?? "").trim();
  if (!m) return "Payment";
  const lower = m.toLowerCase();
  if (lower === "stripe") return "Card (online)";
  if (lower.includes("credit") || lower.includes("card")) return "Card";
  if (lower.includes("ach") || lower.includes("bank")) return "Bank transfer";
  if (lower === "cash") return "Cash";
  if (lower.includes("check") || lower.includes("cheque")) return "Check";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function isFailedStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s.includes("fail") || s.includes("declin") || s.includes("void");
}

function isRefundedStatus(status: string | null | undefined): boolean {
  return /refund/i.test(status ?? "");
}

// Short, readable receipt number derived from the payment id. Stable, so the
// same payment always prints the same number.
export function receiptNumber(paymentId: string): string {
  const cleaned = paymentId.replace(/[^A-Za-z0-9]/g, "");
  return `R-${cleaned.slice(-8).toUpperCase()}`;
}

export function buildPortalPayments(
  rows: RawPaymentRow[],
  invoiceNumbers: Map<string, string | null>
): PortalPayment[] {
  // Native refunds are separate negative rows keyed by the payment intent.
  const nativeRefundTotals = new Map<string, number>();
  for (const row of rows) {
    if (row.jobber_payment_id.startsWith(NATIVE_REFUND_PREFIX)) {
      const pi = row.jobber_payment_id.slice(NATIVE_REFUND_PREFIX.length);
      nativeRefundTotals.set(pi, (nativeRefundTotals.get(pi) ?? 0) + Math.abs(toMoney(row.amount)));
    }
  }

  const out: PortalPayment[] = [];

  for (const row of rows) {
    const amount = toMoney(row.amount);
    const invoiceNumber = row.jobber_invoice_id ? invoiceNumbers.get(row.jobber_invoice_id) ?? null : null;
    const base = {
      id: row.jobber_payment_id,
      date: row.payment_date,
      tip: toMoney(row.tip_amount),
      methodLabel: paymentMethodLabel(row.payment_method),
      invoiceNumber,
    };

    if (row.jobber_payment_id.startsWith(NATIVE_REFUND_PREFIX)) {
      // Shown as a note on the original payment when we can find it;
      // otherwise listed on its own so the money movement is never hidden.
      const pi = row.jobber_payment_id.slice(NATIVE_REFUND_PREFIX.length);
      const hasOriginal = rows.some((r) => r.jobber_payment_id === `${NATIVE_PAYMENT_PREFIX}${pi}`);
      if (hasOriginal) continue;
      out.push({ ...base, amount: Math.abs(amount), tip: 0, state: "refund", refundedAmount: Math.abs(amount), receiptAvailable: false });
      continue;
    }

    if (amount < 0) {
      out.push({ ...base, amount: Math.abs(amount), tip: 0, state: "refund", refundedAmount: Math.abs(amount), receiptAvailable: false });
      continue;
    }

    if (isFailedStatus(row.transaction_status)) {
      out.push({ ...base, tip: 0, amount, state: "failed", refundedAmount: 0, receiptAvailable: false });
      continue;
    }

    let refundedAmount = 0;
    if (row.jobber_payment_id.startsWith(NATIVE_PAYMENT_PREFIX)) {
      const pi = row.jobber_payment_id.slice(NATIVE_PAYMENT_PREFIX.length);
      refundedAmount = Math.min(amount, nativeRefundTotals.get(pi) ?? 0);
    } else if (isRefundedStatus(row.transaction_status)) {
      refundedAmount = amount;
    }
    refundedAmount = Math.round(refundedAmount * 100) / 100;

    let state: PortalPaymentState = "paid";
    if (refundedAmount > 0) {
      state = refundedAmount >= amount ? "refunded" : "partially_refunded";
    }

    out.push({ ...base, amount, state, refundedAmount, receiptAvailable: true });
  }

  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function paymentStateLabel(state: PortalPaymentState): string {
  switch (state) {
    case "paid":
      return "Paid";
    case "partially_refunded":
      return "Partially refunded";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Did not go through";
    case "refund":
      return "Refund";
  }
}
