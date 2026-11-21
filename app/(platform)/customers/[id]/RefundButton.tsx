"use client";

// Refund control for a payment taken through the CRM's own card system.
// Opens a small inline form (amount, reason, note) and asks for a final
// confirmation before anything is sent to Stripe.
import { useState, useTransition } from "react";
import { refundCustomerPayment } from "./actions";
import { REFUND_REASONS, type RefundReason } from "@/lib/refundLogic";

export default function RefundButton({
  jobberClientId,
  paymentRecordId,
  maxAmount,
}: {
  jobberClientId: string;
  paymentRecordId: string;
  maxAmount: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [reason, setReason] = useState<RefundReason>("wrong_card");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsedAmount = Number(amount);
  const amountValid =
    Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxAmount + 0.001;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await refundCustomerPayment(
        jobberClientId,
        paymentRecordId,
        parsedAmount,
        reason,
        note
      );

      if (result.error !== null) {
        setError(result.error);
        setConfirming(false);
        return;
      }

      setDoneMessage(
        result.fullyRefunded
          ? `Refunded $${result.refundedAmount.toFixed(2)}. The invoice is back to unpaid.`
          : `Refunded $${result.refundedAmount.toFixed(2)}.`
      );
      setOpen(false);
      setConfirming(false);
    });
  }

  if (doneMessage) {
    return <span className="text-xs font-bold text-green-700">✓ {doneMessage}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-bold text-red-700 transition hover:bg-red-50"
      >
        Refund
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-2 rounded-xl border border-[#d9d4c6] bg-white p-3 text-xs">
      <label className="block">
        <span className="font-semibold">Amount (up to ${maxAmount.toFixed(2)})</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={maxAmount}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setConfirming(false);
          }}
          disabled={isPending}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-1 outline-none focus:border-[#d4af37]"
        />
      </label>

      <label className="block">
        <span className="font-semibold">Reason</span>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as RefundReason)}
          disabled={isPending}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-2 py-1 outline-none focus:border-[#d4af37]"
        >
          {REFUND_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-semibold">Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={isPending}
          maxLength={200}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-1 outline-none focus:border-[#d4af37]"
        />
      </label>

      {error && <p className="font-semibold text-red-600">{error}</p>}

      {confirming ? (
        <div className="space-y-2">
          <p className="font-semibold text-red-700">
            Refund ${parsedAmount.toFixed(2)} to the card it was paid with? This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="rounded-lg bg-red-700 px-3 py-1 font-bold text-white disabled:opacity-60"
            >
              {isPending ? "Refunding…" : "Yes, refund"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="rounded-lg border border-[#d9d4c6] px-3 py-1 font-bold"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!amountValid || isPending}
            className="rounded-lg bg-red-700 px-3 py-1 font-bold text-white disabled:opacity-50"
          >
            Review refund
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="rounded-lg border border-[#d9d4c6] px-3 py-1 font-bold"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
