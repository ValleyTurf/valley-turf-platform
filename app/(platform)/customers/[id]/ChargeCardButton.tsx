"use client";

// Client island for the same reason ResendInvoiceButton.tsx/
// MarkPaidButton.tsx are ones -- charging can genuinely fail (declined,
// requires 3D Secure authentication, no longer enrolled), and staff
// tapping this need to see that inline. Unlike those two, this is a
// real money-moving action, so it asks for a plain confirm() first
// (same pattern ConfirmSubmitButton.tsx uses elsewhere, just inlined
// since this button isn't a plain form submit) rather than firing a
// Stripe charge on a single accidental click.
import { useState, useTransition } from "react";
import { chargeCustomerInvoiceManually } from "./actions";

export default function ChargeCardButton({
  jobberClientId,
  invoiceId,
  total,
  cardLast4,
}: {
  jobberClientId: string;
  invoiceId: string;
  total: number | null;
  cardLast4: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [charged, setCharged] = useState(false);

  function handleClick() {
    const amount =
      total !== null
        ? total.toLocaleString("en-US", { style: "currency", currency: "USD" })
        : "this invoice's total";
    const card = cardLast4 ? `card ending in ${cardLast4}` : "the card on file";

    if (!window.confirm(`Charge ${amount} to ${card} right now?`)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await chargeCustomerInvoiceManually(jobberClientId, invoiceId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setCharged(true);
    });
  }

  if (charged) {
    return <span className="text-xs font-bold text-green-700">✓ Charged</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-[#174734] bg-[#174734] px-2.5 py-1 text-xs font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Charging…" : "Charge Card on File"}
      </button>
      {error && (
        <p className="max-w-[220px] text-right text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
