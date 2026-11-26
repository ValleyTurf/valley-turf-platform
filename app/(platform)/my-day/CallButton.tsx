"use client";

// Calls the customer through the CRM business number: the business number
// rings your phone, you answer, and it connects you to the customer.
import { useState, useTransition } from "react";
import { callCustomerViaBusinessLine } from "@/lib/callActions";

export default function CallButton({ jobberClientId }: { jobberClientId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  function handleClick() {
    setError(null);
    setStarted(false);
    startTransition(async () => {
      const result = await callCustomerViaBusinessLine(jobberClientId);
      if (result.error) setError(result.error);
      else setStarted(true);
    });
  }

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-xl border border-[#174734] px-4 py-2.5 text-center text-sm font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
      >
        {isPending ? "Starting..." : "Call"}
      </button>

      {started ? (
        <p className="mt-1 text-xs text-[#6b705c]">
          Your phone is about to ring from the business number. Answer it to be connected to the customer.
        </p>
      ) : null}

      {error ? <p className="mt-1 text-xs text-[#9a2f22]">{error}</p> : null}
    </div>
  );
}
