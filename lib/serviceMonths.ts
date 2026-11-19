// Which months a customer actually gets serviced, built from visit history
// so a monthly customer shows every month filled and a quarterly customer
// shows only their service months. Pure, so it can be tested.

export type ServiceVisit = {
  // Phoenix month of the visit, YYYY-MM.
  month: string | null;
  completed: boolean;
  // Still ahead of today.
  upcoming: boolean;
};

export type ServiceMonth = {
  key: string;
  label: string;
  done: number;
  scheduled: number;
  isCurrent: boolean;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// Twelve months: nine back, the current month, and two ahead by default.
export function buildServiceMonths(
  visits: ServiceVisit[],
  todayYmd: string,
  back = 9,
  ahead = 2
): ServiceMonth[] {
  const currentKey = todayYmd.slice(0, 7);
  const counts = new Map<string, { done: number; scheduled: number }>();

  for (const visit of visits) {
    if (!visit.month) continue;
    const entry = counts.get(visit.month) ?? { done: 0, scheduled: 0 };
    if (visit.completed) entry.done += 1;
    else if (visit.upcoming) entry.scheduled += 1;
    counts.set(visit.month, entry);
  }

  const months: ServiceMonth[] = [];
  for (let offset = -back; offset <= ahead; offset += 1) {
    const key = shiftMonth(currentKey, offset);
    const entry = counts.get(key) ?? { done: 0, scheduled: 0 };
    months.push({
      key,
      label: MONTH_LABELS[Number(key.slice(5, 7)) - 1],
      done: entry.done,
      scheduled: entry.scheduled,
      isCurrent: key === currentKey,
    });
  }
  return months;
}

// A plain-words pattern read from the months that have service.
export function servicePattern(months: ServiceMonth[]): string | null {
  const active = months
    .map((month, index) => ({ index, total: month.done + month.scheduled }))
    .filter((entry) => entry.total > 0);

  if (active.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < active.length; i += 1) {
    gaps.push(active[i].index - active[i - 1].index);
  }
  gaps.sort((a, b) => a - b);
  const gap = gaps[Math.floor(gaps.length / 2)];
  const perMonth = active.reduce((sum, entry) => sum + entry.total, 0) / active.length;

  if (gap === 1) return perMonth >= 1.5 ? "Twice a month" : "Monthly";
  if (gap === 2) return "Every 2 months";
  if (gap === 3) return "Quarterly";
  if (gap === 6) return "Twice a year";
  return `Every ${gap} months`;
}
