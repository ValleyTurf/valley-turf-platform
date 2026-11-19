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

// Margin tiers (Ryan, 2026-11-19): below 30% is low, above 50% is good.
export const LOW_MARGIN_PCT = 30;
export const GOOD_MARGIN_PCT = 50;

export type MarginTier = "low" | "ok" | "good";

export function marginTier(margin: number): MarginTier {
  if (margin < LOW_MARGIN_PCT) return "low";
  if (margin > GOOD_MARGIN_PCT) return "good";
  return "ok";
}

// Whole-percent margin, or null when there is nothing billed to divide by.
export function marginPercent(billed: number, profit: number): number | null {
  if (!Number.isFinite(billed) || billed <= 0) return null;
  return Math.round((profit / billed) * 100);
}
