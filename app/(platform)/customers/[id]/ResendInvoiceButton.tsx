"use client";

// Client island for the same reason OnWayButton.tsx is one -- resending
// can genuinely fail (no contact info, no payment link, delivery error),
// and staff tapping this need to see that inline rather than a plain
// <form action> silently doing nothing.
import { useState, useTransition } from "react";
import { resendCustomerInvoice } from "./actions";

export default function ResendInvoiceButton({
  jobberClientId,
  invoiceId,
}: {
  jobberClientId: string;
  invoiceId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resendCustomerInvoice(jobberClientId, invoiceId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setResent(true);
    });
  }

  if (resent) {
    return (
      <span className="text-xs font-bold text-green-700">✓ Resent</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-[#174734] px-2.5 py-1 text-xs font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
      >
        {isPending ? "Sending…" : "Resend"}
      </button>
      {error && (
        <p className="max-w-[200px] text-right text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
