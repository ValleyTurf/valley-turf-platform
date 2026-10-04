import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { toNumber } from "@/lib/format";

// Extracted out of app/(platform)/revenue/page.tsx (2026-10-04) so the
// new Profit & Loss report (app/(platform)/revenue/profit-loss/page.tsx)
// can use the exact same overhead-for-a-date-range math Revenue already
// uses, instead of a second copy that could quietly drift out of sync --
// the whole reason migration 033 existed was Job Costing Analytics and
// Revenue disagreeing on this number because one used the view and the
// other used this proration logic directly. Moving the function instead
// of duplicating it means there's only ever one place this can be wrong.
//
// Behavior is unchanged from the original -- same daily-rate proration,
// same recurring/amortized branches. Revenue's own call sites were
// updated to import from here instead of defining it locally.
export type OverheadCostRow = {
  cost_type: string;
  amount: number | string;
  start_date: string;
  end_date: string | null;
};

export async function fetchOverheadCosts(): Promise<OverheadCostRow[]> {
  const { data, error } = await supabaseServer
    .from("overhead_costs")
    .select("cost_type, amount, start_date, end_date");

  if (error) throw error;

  return (data ?? []) as OverheadCostRow[];
}

function daysBetweenInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function calculateOverheadForRange(
  costs: OverheadCostRow[],
  rangeStart: string,
  rangeEnd: string
): number {
  const rangeStartDate = new Date(`${rangeStart}T00:00:00Z`);
  const rangeEndDate = new Date(`${rangeEnd}T00:00:00Z`);

  let total = 0;

  for (const cost of costs) {
    const amount = toNumber(cost.amount);
    const costStart = new Date(`${cost.start_date}T00:00:00Z`);
    const costEnd = cost.end_date
      ? new Date(`${cost.end_date}T00:00:00Z`)
      : null;

    if (cost.cost_type === "recurring") {
      // Smooth a monthly amount into a daily burn rate so it can be
      // prorated across any arbitrary date range, not just calendar months.
      const dailyRate = (amount * 12) / 365.25;

      const overlapStart =
        costStart > rangeStartDate ? costStart : rangeStartDate;
      const overlapEnd =
        costEnd && costEnd < rangeEndDate ? costEnd : rangeEndDate;

      if (overlapStart <= overlapEnd) {
        total += dailyRate * daysBetweenInclusive(overlapStart, overlapEnd);
      }
    } else if (cost.cost_type === "amortized" && costEnd) {
      const totalDays = daysBetweenInclusive(costStart, costEnd);
      const dailyRate = totalDays > 0 ? amount / totalDays : 0;

      const overlapStart =
        costStart > rangeStartDate ? costStart : rangeStartDate;
      const overlapEnd = costEnd < rangeEndDate ? costEnd : rangeEndDate;

      if (overlapStart <= overlapEnd) {
        total += dailyRate * daysBetweenInclusive(overlapStart, overlapEnd);
      }
    }
  }

  return total;
}
