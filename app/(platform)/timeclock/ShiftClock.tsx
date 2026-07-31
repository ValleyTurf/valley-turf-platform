"use client";

// Live-ticking Clock In / Clock Out control — the only client island on
// an otherwise fully server-rendered page, same pattern as my-day's
// VisitTimer.tsx.
import { useEffect, useState, useTransition } from "react";
import { clockIn, clockOut } from "./actions";

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function ShiftClock({
  activeShiftId,
  activeClockedInAt,
}: {
  activeShiftId: string | null;
  activeClockedInAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!activeClockedInAt) return;

    const startMs = new Date(activeClockedInAt).getTime();

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [activeClockedInAt]);

  function handleClockIn() {
    setError(null);
    startTransition(async () => {
      const result = await clockIn();
      if (result.error) setError(result.error);
    });
  }

  function handleClockOut() {
    if (!activeShiftId) return;

    setError(null);
    startTransition(async () => {
      const result = await clockOut(activeShiftId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      {activeShiftId ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            Clocked in
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </p>
          <button
            type="button"
            onClick={handleClockOut}
            disabled={isPending}
            className="mt-5 w-full rounded-xl bg-[#174734] px-4 py-3.5 text-base font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
          >
            {isPending ? "Clocking out…" : "Clock Out"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-xs font-bold uppercase tracking-wide text-[#6b705c]">
            Not clocked in
          </p>
          <button
            type="button"
            onClick={handleClockIn}
            disabled={isPending}
            className="mt-4 w-full rounded-xl border-2 border-[#174734] px-4 py-3.5 text-base font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
          >
            {isPending ? "Clocking in…" : "Clock In"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-center text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
