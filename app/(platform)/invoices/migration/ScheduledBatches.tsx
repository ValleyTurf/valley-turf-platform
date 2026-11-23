"use client";

// Queued "send at 9am" batches, with a cancel button on each.
import { useState, useTransition } from "react";
import { cancelScheduledBatchAction } from "./actions";

export type ScheduledBatchView = {
  id: string;
  count: number;
  whenLabel: string;
  byName: string | null;
  message: string;
  names: string[];
};

export default function ScheduledBatches({ batches }: { batches: ScheduledBatchView[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (batches.length === 0) return null;

  function cancel(id: string) {
    setError(null);
    startTransition(async () => {
      const outcome = await cancelScheduledBatchAction(id);
      if (outcome.error) setError(outcome.error);
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#d4af37] bg-[#fbf6e4] p-4 text-sm">
      <p className="font-bold">Scheduled to send</p>
      <ul className="mt-2 space-y-3">
        {batches.map((batch) => (
          <li key={batch.id} className="rounded-xl bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {batch.count} customer{batch.count === 1 ? "" : "s"} · {batch.whenLabel}
                {batch.byName ? ` · queued by ${batch.byName}` : ""}
              </p>
              <button
                type="button"
                onClick={() => cancel(batch.id)}
                disabled={isPending}
                className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-bold text-red-700 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
            <p className="mt-1 text-xs text-[#6b705c]">{batch.names.join(", ")}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-[#6b705c]">{batch.message}</p>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
