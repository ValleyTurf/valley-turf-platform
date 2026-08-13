// Shared "live ticking elapsed time" formatter for the two client-side
// timer displays -- my-day/VisitTimer.tsx (your own timer, with
// Start/Stop) and crew-status/LiveElapsed.tsx (a manager watching
// someone else's, read-only). Both are "use client" components so, unlike
// the "use server" files elsewhere in this app that have to keep small
// duplicated copies of shared logic, this can just be a normal shared
// import.
//
// Previously each copy formatted as "H:MM:SS" with no cap on hours, which
// is fine for a normal same-day shift but unreadable for a stuck timer
// that's been running for days (confirmed live: Brittanie's forgotten
// timer would have shown as "51:23:11"). Once past 24 hours this switches
// to "Xd Yh" instead.
export function formatElapsedClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);

  if (days > 0) {
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
