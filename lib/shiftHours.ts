// Pure duration math shared between /timeclock (self-service clock in/
// out) and /timecards (payroll) — kept dependency-free (no
// supabase-server import) so it's unit-testable on its own, same
// reasoning as lib/auditDiff.ts vs lib/auditLog.ts.

export type ShiftSegment = {
  clockedInAt: string;
  clockedOutAt: string | null;
};

// Minutes for a single segment. An still-open segment (clockedOutAt
// null) counts up to `now` — callers that want to exclude in-progress
// time from a payroll total (see totalMinutes' `includeActive` param)
// filter those segments out before calling this, rather than this
// function returning 0 for them, so a live "clocked in for 1h 12m so
// far" display on /timeclock can still use the same math.
export function segmentMinutes(
  segment: ShiftSegment,
  now: Date = new Date()
): number {
  const start = new Date(segment.clockedInAt).getTime();
  const end = segment.clockedOutAt
    ? new Date(segment.clockedOutAt).getTime()
    : now.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return (end - start) / 60000;
}

// Sums a list of segments. By default only finished (clockedOutAt set)
// segments count — a payroll total that silently changes every second
// because someone's still on the clock is more confusing than useful,
// so /timecards leaves still-open shifts out of the number and flags
// them separately instead. Pass includeActive: true for a live personal
// view (/timeclock's "today so far") where that's exactly the point.
export function totalMinutes(
  segments: ShiftSegment[],
  options: { includeActive?: boolean; now?: Date } = {}
): number {
  const { includeActive = false, now = new Date() } = options;

  return segments.reduce((sum, segment) => {
    if (!includeActive && !segment.clockedOutAt) {
      return sum;
    }

    return sum + segmentMinutes(segment, now);
  }, 0);
}

export function formatHoursMinutes(totalMins: number): string {
  const safeMinutes = Number.isFinite(totalMins) && totalMins > 0 ? totalMins : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = Math.round(safeMinutes % 60);

  return `${hours}h ${minutes}m`;
}

// Decimal hours to two places — the form payroll software/spreadsheets
// actually want (e.g. "7.25" hours), as opposed to formatHoursMinutes'
// "7h 15m" which is for on-screen display only.
export function minutesToDecimalHours(totalMins: number): number {
  if (!Number.isFinite(totalMins) || totalMins <= 0) {
    return 0;
  }

  return Math.round((totalMins / 60) * 100) / 100;
}
