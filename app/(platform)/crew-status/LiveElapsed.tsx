"use client";

// Ticking "how long has this person been clocked in" display — the only
// reason this tiny component is a client island on an otherwise fully
// server-rendered page. Same pattern as my-day/VisitTimer.tsx's own
// elapsed display, but read-only (no Start/Stop): a manager glancing at
// Crew Status is looking at someone ELSE's timer, not their own.
import { useEffect, useState } from "react";
import { formatElapsedClock } from "@/lib/elapsedTime";

export default function LiveElapsed({
  startedAt,
  priorMinutes = 0,
}: {
  startedAt: string;
  // Finished-segment minutes already logged on this same visit before
  // the currently-running segment -- same "total across every start/stop
  // cycle" reasoning as my-day/VisitTimer.tsx, so a manager watching
  // Crew Status sees continuous time on the job rather than it appearing
  // to reset to 0:00 every time someone stops and restarts their timer.
  priorMinutes?: number;
}) {
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

  return (
    <span className="tabular-nums">
      {formatElapsedClock(priorMinutes * 60 + elapsedSeconds)}
    </span>
  );
}
