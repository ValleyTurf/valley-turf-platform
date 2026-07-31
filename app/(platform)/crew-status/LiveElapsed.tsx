"use client";

// Ticking "how long has this person been clocked in" display — the only
// reason this tiny component is a client island on an otherwise fully
// server-rendered page. Same pattern as my-day/VisitTimer.tsx's own
// elapsed display, but read-only (no Start/Stop): a manager glancing at
// Crew Status is looking at someone ELSE's timer, not their own.
import { useEffect, useState } from "react";

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function LiveElapsed({ startedAt }: { startedAt: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>;
}
