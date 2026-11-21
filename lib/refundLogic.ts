// Pure helpers for refunds (no server imports, so they are unit-testable).

export type RefundReason = "duplicate" | "requested_by_customer" | "wrong_card" | "other";

export const REFUND_REASONS: { value: RefundReason; label: string }[] = [
  { value: "wrong_card", label: "Charged the wrong card" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "requested_by_customer", label: "Customer requested" },
  { value: "other", label: "Other" },
];

// Stripe only knows three reasons; the rest go in metadata.
export function stripeReasonFor(reason: RefundReason): "duplicate" | "requested_by_customer" | undefined {
  if (reason === "duplicate") return "duplicate";
  if (reason === "requested_by_customer") return "requested_by_customer";
  return undefined;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// Validates a requested refund against what is still refundable on the
// charge. Returns cents on success.
export function checkRefundAmount(
  requestedDollars: number,
  chargeCents: number,
  alreadyRefundedCents: number
): { ok: true; cents: number; fullyRefunded: boolean } | { ok: false; error: string } {
  if (!Number.isFinite(requestedDollars) || requestedDollars <= 0) {
    return { ok: false, error: "Enter a refund amount greater than $0." };
  }

  const cents = toCents(requestedDollars);
  const refundableCents = chargeCents - alreadyRefundedCents;

  if (refundableCents <= 0) {
    return { ok: false, error: "This payment has already been fully refunded." };
  }

  if (cents > refundableCents) {
    return {
      ok: false,
      error: `You can refund at most $${(refundableCents / 100).toFixed(2)} on this payment.`,
    };
  }

  return { ok: true, cents, fullyRefunded: alreadyRefundedCents + cents >= chargeCents };
}

// Money actually kept from one payment row. Jobber flips a refunded
// payment's own status to REFUNDED (its amount no longer counts), while a
// refund this app mirrors is a separate NEGATIVE row that nets against the
// original, so negative rows always count.
export function netCollectedAmount(
  amount: number,
  status: string | null | undefined,
  isCollected: (status: string | null | undefined) => boolean
): number {
  if (amount < 0) return amount;
  return isCollected(status) ? amount : 0;
}
