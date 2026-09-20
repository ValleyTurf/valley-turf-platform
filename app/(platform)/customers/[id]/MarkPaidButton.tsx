"use client";

// Client island for the same reason ResendInvoiceButton.tsx is one --
// this can genuinely fail (invoice already paid/voided by the time it's
// clicked), and staff need to see that inline. A small method dropdown
// sits next to the button (defaulting to Cash, the immediate need) since
// "paid in person" isn't always literally cash -- a check is just as
// common and worth recording accurately for the payments/jobber_payments
// mirror rather than always labeling it "Cash".
import { useState, useTransition } from "react";
import { markCustomerInvoicePaidManually } from "./actions";

const METHOD_OPTIONS = ["Cash", "Check", "Other"];

export default function MarkPaidButton({
  jobberClientId,
  invoiceId,
}: {
  jobberClientId: string;
  invoiceId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await markCustomerInvoicePaidManually(
        jobberClientId,
        invoiceId,
        method
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      setMarked(true);
    });
  }

  if (marked) {
    return <span className="text-xs font-bold text-green-700">✓ Marked Paid</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          disabled={isPending}
          className="rounded-lg border border-[#d9d4c6] bg-white px-1.5 py-1 text-xs outline-none focus:border-[#d4af37]"
        >
          {METHOD_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded-lg border border-[#174734] px-2.5 py-1 text-xs font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
        >
          {isPending ? "Marking…" : "Mark Paid"}
        </button>
      </div>

      {error && (
        <p className="max-w-[220px] text-right text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
