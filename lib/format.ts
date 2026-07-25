// Shared formatting helpers that were genuinely identical (not just
// similar) across many pages.
//
// Most date formatting was deliberately left out of the original pass —
// it turned out to have real, meaningful variation (different fallback
// text, different timezone-anchoring approaches, different precision)
// rather than pure duplication, and consolidating it without being able
// to visually verify every page risked silently changing what people
// see. A follow-up pass confirmed formatDateOnly() below really was
// byte-for-byte identical across its callers and consolidated just that
// one; the timestamp+time formatters (settings/jobber, ActivityFeed,
// customers/page, team/page, customers/[id]'s formatDateTime) still have
// real per-page differences in fields shown and fallback text, so those
// stay local rather than being forced into one shape.

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

// Formats a date-only value ("YYYY-MM-DD") or a full ISO timestamp as
// "Mon D, YYYY". Date-only values are anchored to local noon before
// formatting so the calendar day never shifts due to a UTC/local
// conversion landing on the wrong side of midnight. Deliberately has no
// explicit timeZone — matches the historical behavior of every page this
// was consolidated from (costs, equipment, revenue,
// job-costing-analytics, customers/[id]).
export function formatDateOnly(
  value: string | null | undefined,
  fallback = "—"
): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
