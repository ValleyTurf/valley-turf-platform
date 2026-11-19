// Cost and profit tracking only began in August 2026, so anything dated
// before then has billing but no trustworthy cost. One shared cutoff so
// the customer page, the Visits tab and the visit page never disagree
// (Ryan, 2026-11-19: lifetime revenue is fine, but profit and margin
// figures should only count visits since Aug 2026).
import { toPhoenixDateString } from "@/lib/phoenixDate";

export const PROFIT_TRACKING_START_DATE = "2026-08-01";
export const PROFIT_TRACKING_START_LABEL = "Aug 2026";

// True when the visit (or any timestamp) falls on or after the cutoff in
// Phoenix time. Missing or unparseable dates are treated as not tracked.
export function isProfitTracked(dateValue: string | null | undefined): boolean {
  if (!dateValue) return false;
  const day = toPhoenixDateString(dateValue);
  if (!day) return false;
  return day >= PROFIT_TRACKING_START_DATE;
}

// Whole-percent margin, or null when there is nothing billed to divide by.
export function marginPercent(billed: number, profit: number): number | null {
  if (!Number.isFinite(billed) || billed <= 0) return null;
  return Math.round((profit / billed) * 100);
}
