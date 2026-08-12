"use client";

// "On my way" text to the customer, right on the My Day card — same
// client-island reasoning as VisitTimer.tsx: sendOnWay (actions.ts) can
// genuinely fail (no phone on file, Twilio not configured/down), and a
// crew member tapping this needs to see that inline rather than the
// button just doing nothing, which a plain <form action> would do.
import { useState, useTransition } from "react";
import { sendOnWay } from "./actions";

function formatSentTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function OnWayButton({
  visitId,
  jobberClientId,
  customerName,
  initialSentAt,
}: {
  visitId: string;
  jobberClientId: string;
  customerName: string | null;
  initialSentAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(initialSentAt);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await sendOnWay(visitId, jobberClientId, customerName);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSentAt(result.sentAt);
    });
  }

  if (sentAt) {
    return (
      <p className="mt-2 text-xs font-semibold text-[#6b705c]">
        ✓ On my way text sent at {formatSentTime(sentAt)}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
      >
        {isPending ? "Sending…" : "🚚 On My Way"}
      </button>

      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
