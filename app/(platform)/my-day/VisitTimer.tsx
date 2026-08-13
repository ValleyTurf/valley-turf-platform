"use client";

// Small client island on an otherwise fully server-rendered page — the
// live-ticking elapsed display needs real client state (setInterval),
// which is the only reason My Day has any "use client" code at all. See
// actions.ts's startVisitTimer/stopVisitTimer for why Start/Stop is kept
// separate from the Mark Complete button next to it.
import { useEffect, useState, useTransition } from "react";
import { startVisitTimer, stopVisitTimer } from "./actions";
import { formatElapsedClock } from "@/lib/elapsedTime";

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export default function VisitTimer({
  visitId,
  activeTimeLogId,
  activeStartedAt,
  loggedMinutes,
}: {
  visitId: string;
  activeTimeLogId: string | null;
  activeStartedAt: string | null;
  loggedMinutes: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!activeStartedAt) return;

    const startMs = new Date(activeStartedAt).getTime();

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [activeStartedAt]);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startVisitTimer(visitId);
      if (result.error) setError(result.error);
    });
  }

  function handleStop() {
    if (!activeTimeLogId) return;

    setError(null);
    startTransition(async () => {
      const result = await stopVisitTimer(activeTimeLogId);
      if (result.error) setError(result.error);
    });
  }

  // Total across every start/stop cycle on this visit, not just the
  // segment that's live right now -- stopping and restarting used to
  // visually reset the ticking display to 0:00 even though the
  // underlying total (loggedMinutes, summed from every finished segment
  // in my-day/page.tsx) was never actually lost. Adding it as the base
  // here just makes the display match what was already true.
  const totalSecondsSoFar = loggedMinutes * 60 + elapsedSeconds;

  return (
    <div className="mt-2">
      {activeTimeLogId ? (
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-[#eef4ee] px-3 py-2.5 text-sm font-bold tabular-nums text-[#174734]">
            ⏱ {formatElapsedClock(totalSecondsSoFar)}
          </span>
          <button
            type="button"
            onClick={handleStop}
            disabled={isPending}
            className="flex-1 rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
          >
            Stop Timer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleStart}
          disabled={isPending}
          className="w-full rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
        >
          {isPending
            ? "Starting…"
            : `Start Job${loggedMinutes > 0 ? ` (logged ${formatMinutes(loggedMinutes)})` : ""}`}
        </button>
      )}

      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
