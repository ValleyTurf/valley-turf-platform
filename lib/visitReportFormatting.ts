// Pure helpers for the Visits report page/CSV export — same split as
// lib/transactionFormatting.ts (kept free of lib/supabase-server.ts so
// it's trivially unit-testable). lib/visitReport.ts is the I/O
// counterpart that fetches and joins the underlying Jobber tables.

export type VisitRow = {
  id: string; // jobber_visit_id
  jobId: string | null;
  jobNumber: string | null;
  jobberWebUri: string | null;
  date: string | null; // "YYYY-MM-DD", Phoenix calendar day
  startAt: string | null; // raw ISO timestamp, for time-of-day formatting
  endAt: string | null;
  title: string | null;
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  status: string;
  jobType: string;
  jobTotal: number | null;
};

export type VisitSortField = "date" | "client" | "jobNumber" | "jobType" | "status";
export type SortDirection = "asc" | "desc";

// Jobber's visitStatus/jobType enum values are SCREAMING_SNAKE_CASE
// (confirmed elsewhere in this codebase, e.g. job_status/job_type stored
// verbatim off JobberJob.jobStatus/jobType) — humanized the same way
// deriveTransactionType() handles adjustmentType, rather than hardcoding
// a translation table this account's real data might not exercise every
// value of.
export function humanizeVisitField(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();

  if (!trimmed) {
    return "Unknown";
  }

  return trimmed
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compareRows(a: VisitRow, b: VisitRow, field: VisitSortField): number {
  switch (field) {
    case "client":
      return a.clientName.localeCompare(b.clientName);
    case "jobNumber":
      return (a.jobNumber ?? "").localeCompare(b.jobNumber ?? "", undefined, {
        numeric: true,
      });
    case "jobType":
      return a.jobType.localeCompare(b.jobType);
    case "status":
      return a.status.localeCompare(b.status);
    case "date":
    default:
      // Same-day visits should then order by start time, not just fall
      // back to insertion order.
      return (
        (a.date ?? "").localeCompare(b.date ?? "") ||
        (a.startAt ?? "").localeCompare(b.startAt ?? "")
      );
  }
}

export function sortVisitRows(
  rows: VisitRow[],
  field: VisitSortField,
  direction: SortDirection
): VisitRow[] {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, field));
  return direction === "asc" ? sorted : sorted.reverse();
}

export function filterVisitRows(
  rows: VisitRow[],
  {
    jobType,
    status,
    search,
  }: { jobType?: string; status?: string; search?: string }
): VisitRow[] {
  let result = rows;

  if (jobType && jobType !== "all") {
    result = result.filter((row) => row.jobType === jobType);
  }

  if (status && status !== "all") {
    result = result.filter((row) => row.status === status);
  }

  const query = search?.trim().toLowerCase();
  if (query) {
    result = result.filter((row) =>
      row.clientName.toLowerCase().includes(query)
    );
  }

  return result;
}

// Totals by job type, each distinct job's total counted exactly ONCE no
// matter how many of its visits fall in range — a recurring job's
// jobber_jobs.total is a flat price for the whole billing period (e.g.
// $500/month), not a per-visit price, even though that one job can
// generate several visits in the same period (a customer serviced
// weekly under one $500/mo job still owes $500, not $500 × 5).
//
// This mirrors app/(platform)/recurring-services/page.tsx's
// uniqueCustomersFor(), which already carries an explicit comment about
// this exact bug ("previously this summed the job's total once per
// visit, so a flat-rate customer with 2 visits ... showed $400 instead
// of $200") — that page's already-correct, already-relied-on behavior is
// the source of truth this was brought in line with, not the other way
// around.
//
// visitCount is tracked separately purely as informational context next
// to the dollar total (so "12 jobs · 45 visits" is visible), not part of
// the total itself.
export function summarizeVisitsByJobType(
  rows: VisitRow[]
): { jobType: string; total: number; jobCount: number; visitCount: number }[] {
  const seenJobs = new Set<string>();
  const totalsByType = new Map<string, number>();
  const jobCountByType = new Map<string, number>();
  const visitCountByType = new Map<string, number>();

  for (const row of rows) {
    const jobKey = row.jobId ?? row.id; // fall back to visit id if a visit has no job

    visitCountByType.set(row.jobType, (visitCountByType.get(row.jobType) ?? 0) + 1);

    if (seenJobs.has(jobKey)) continue;
    seenJobs.add(jobKey);

    totalsByType.set(
      row.jobType,
      (totalsByType.get(row.jobType) ?? 0) + (row.jobTotal ?? 0)
    );
    jobCountByType.set(row.jobType, (jobCountByType.get(row.jobType) ?? 0) + 1);
  }

  return Array.from(totalsByType.entries())
    .map(([jobType, total]) => ({
      jobType,
      total,
      jobCount: jobCountByType.get(jobType) ?? 0,
      visitCount: visitCountByType.get(jobType) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export type VisitTimeframe =
  | "today"
  | "next-7-days"
  | "next-30-days"
  | "this-month"
  | "last-7-days"
  | "last-30-days"
  | "last-month"
  | "ytd"
  | "custom";

export function isVisitTimeframe(
  value: string | undefined
): value is VisitTimeframe {
  return [
    "today",
    "next-7-days",
    "next-30-days",
    "this-month",
    "last-7-days",
    "last-30-days",
    "last-month",
    "ytd",
    "custom",
  ].includes(value ?? "");
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getVisitDateRange(
  timeframe: VisitTimeframe,
  today: Date,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string } {
  let start = new Date(today);
  let end = new Date(today);

  if (timeframe === "today") {
    // start/end already both equal today
  } else if (timeframe === "next-7-days") {
    end.setUTCDate(end.getUTCDate() + 6);
  } else if (timeframe === "next-30-days") {
    end.setUTCDate(end.getUTCDate() + 29);
  } else if (timeframe === "this-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  } else if (timeframe === "last-7-days") {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (timeframe === "last-30-days") {
    start.setUTCDate(start.getUTCDate() - 29);
  } else if (timeframe === "last-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "custom") {
    const parsedStart = customStart ? new Date(`${customStart}T00:00:00Z`) : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T00:00:00Z`) : null;

    if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }

    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }

    if (start > end) {
      [start, end] = [end, start];
    }
  }

  return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
}

// Formats an ISO timestamp as Phoenix-local "h:mmAM/PM" (e.g. "10:15AM"),
// matching the compact style Jobber's own report uses. Returns null for
// a missing/unparseable timestamp so the page can show a placeholder.
export function formatPhoenixTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  // Intl inserts a space before AM/PM ("10:15 AM") — Jobber's own report
  // (and the tighter column width a table needs) reads better without it.
  return formatted.replace(/\s+/g, "");
}
