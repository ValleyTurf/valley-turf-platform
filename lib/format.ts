// Shared formatting helpers that were genuinely identical (not just
// similar) across many pages. Date formatting was deliberately left out
// of this pass — it turned out to have real, meaningful variation
// (different fallback text, different timezone-anchoring approaches for
// date-only strings, different precision) rather than pure duplication,
// and consolidating it without being able to visually verify every page
// risked silently changing what people see. That's a good candidate for
// a dedicated, careful follow-up.

export function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

// Whole-dollar formatting — used on dashboards showing large aggregate
// figures (Revenue, Alerts, Customer Intelligence, Links & QR).
export function formatCurrency(
  value: number | string | null | undefined
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

// Cents-precise formatting — used wherever a specific unit cost or rate
// matters (Materials, Equipment, Labor Rates, Job Costs, Team pay rate).
export function formatCurrencyPrecise(
  value: number | string | null | undefined
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

export function formatNumber(
  value: number | string | null | undefined
): string {
  return new Intl.NumberFormat("en-US").format(toNumber(value));
}

export function formatPercent(
  value: number | string | null | undefined,
  { decimals = 1 }: { decimals?: number } = {}
): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}
