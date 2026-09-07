"use client";

// "On my way" text to the customer, right on the My Day card — same
// client-island reasoning as VisitTimer.tsx: sendOnWay (actions.ts) can
// genuinely fail (no phone on file, Twilio not configured/down), and a
// crew member tapping this needs to see that inline rather than the
// button just doing nothing, which a plain <form action> would do.
import { useState, useTransition } from "react";
import { sendOnWay } from "./actions";

// Quick-tap ETA options -- covers the common cases so a crew member can
// send this one-handed without typing; "Other" below still takes any
// custom number of minutes.
const ETA_PRESETS = [5, 10, 15, 20, 30];

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
  const [pickingEta, setPickingEta] = useState(false);
  const [customEta, setCustomEta] = useState("");

  function send(etaMinutes: number) {
    setError(null);
    startTransition(async () => {
      const result = await sendOnWay(visitId, jobberClientId, customerName, etaMinutes);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSentAt(result.sentAt);
    });
  }

  function handleCustomSend() {
    const parsed = Number(customEta);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter how many minutes away you are.");
      return;
    }
    send(parsed);
  }

  if (sentAt) {
    return (
      <p className="mt-2 text-xs font-semibold text-[#6b705c]">
        ✓ On my way text sent at {formatSentTime(sentAt)}
      </p>
    );
  }

  if (!pickingEta) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setPickingEta(true)}
          className="w-full rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
        >
          🚚 On My Way
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#174734] p-3">
      <p className="text-xs font-bold text-[#9c7a20]">
        How many minutes away?
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {ETA_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={isPending}
            onClick={() => send(minutes)}
            className="rounded-full border border-[#174734] px-3 py-1.5 text-sm font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
          >
            {minutes} min
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={customEta}
          onChange={(e) => setCustomEta(e.target.value)}
          placeholder="Other #"
          className="w-24 rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={handleCustomSend}
          className="flex-1 rounded-lg bg-[#174734] px-3 py-1.5 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setPickingEta(false);
          setError(null);
        }}
        className="mt-2 w-full text-center text-xs font-semibold text-[#9c7a20] hover:underline"
      >
        Cancel
      </button>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
