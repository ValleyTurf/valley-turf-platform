export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { formatCurrency } from "@/lib/format";
import ScheduleInteractive from "./ScheduleInteractive";
import type { AssignableUser, GridDate, SchedulePin, ScheduleVisit } from "./types";

type ViewMode = "day" | "week" | "month";

type SchedulePageProps = {
  searchParams: Promise<{
    date?: string;
    view?: string;
  }>;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  jobber_invoice_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  job_status: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | string | null;
};

type JobRow = {
  jobber_job_id: string;
  total: number | string | null;
};

// The bit of jobber_jobs data buildScheduleVisit actually needs, already
// normalized to a plain number.
type JobPricing = {
  total: number;
};

// Just enough of jobber_visits to count how many of a job's visits land
// in a given Phoenix-local calendar month — see visitCountByJobMonth.
type MonthVisitRow = {
  jobber_job_id: string | null;
  start_at: string | null;
};

type CustomerContact = {
  jobber_client_id: string;
  phone: string | null;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  gate_code: string | null;
  service_instructions: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type VisitAssignmentRow = {
  jobber_visit_id: string;
  assigned_user_id: string;
};

type UserRow = {
  id: string;
  name: string;
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(
    parts.find((part) => part.type === "month")?.value ?? 1
  );
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

// Same idea as getPhoenixToday, but for an arbitrary visit timestamp — used
// to bucket visits into the correct Phoenix-local calendar day for the
// week/month grids. Arizona doesn't observe DST, so this is always -07:00,
// but going through Intl (rather than hardcoding the offset) keeps it
// correct even if that ever changes.
function phoenixDateKey(iso: string | null): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

// Same as phoenixDateKey but truncated to "YYYY-MM" — the bucket
// visitCountByJobMonth groups by, since a job's total is treated as a
// per-calendar-month amount (see JobPricing's comment).
function phoenixMonthKey(iso: string | null): string | null {
  const dateKey = phoenixDateKey(iso);
  return dateKey ? dateKey.slice(0, 7) : null;
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return getPhoenixToday();
}

function isViewMode(value: string | undefined): value is ViewMode {
  return value === "day" || value === "week" || value === "month";
}

function formatDateHeading(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatRangeHeading(start: Date, end: Date): string {
  const month = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d);
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(d);
  const year = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(d);

  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();

  if (sameMonth) {
    return `${month(start)} ${day(start)} – ${day(end)}, ${year(end)}`;
  }

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (sameYear) {
    return `${month(start)} ${day(start)} – ${month(end)} ${day(end)}, ${year(end)}`;
  }

  return `${month(start)} ${day(start)}, ${year(start)} – ${month(end)} ${day(end)}, ${year(end)}`;
}

function formatMonthHeading(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatShortWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatTime(value: string | null): string {
  if (!value) {
    return "Unscheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusMeta(status: string | null): {
  label: string;
  classes: string;
  dot: string;
} {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "COMPLETED") {
    return {
      label: "Completed",
      classes: "bg-green-100 text-green-800",
      dot: "bg-green-500",
    };
  }

  if (normalized === "LATE") {
    return {
      label: "Late",
      classes: "bg-red-100 text-red-800",
      dot: "bg-red-500",
    };
  }

  if (normalized === "UPCOMING") {
    return {
      label: "Upcoming",
      classes: "bg-blue-100 text-blue-800",
      dot: "bg-blue-500",
    };
  }

  return {
    label: status || "Unknown",
    classes: "bg-gray-100 text-gray-700",
    dot: "bg-gray-400",
  };
}

// Jobber visit titles follow "{Customer} - {Service}" — e.g. "Buttermore -
// Quarterly Turf Cleaning" or "Hensley - Maintenance - Monthly" (the
// service part can itself contain further " - " segments). Stripping off
// just the first " - "-delimited segment recovers the actual service name,
// so every visit for the same service can be grouped and colored together
// regardless of whose visit it is — this is what makes Jobber's own
// calendar color by service rather than by customer.
function visitServiceLabel(title: string | null): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return "Other";

  const separatorIndex = trimmed.indexOf(" - ");
  if (separatorIndex === -1) return trimmed;

  const service = trimmed.slice(separatorIndex + 3).trim();
  return service || trimmed;
}

// Named colors, each pairing a Tailwind chip class (for the DOM) with the
// matching hex value (for Leaflet map pins, which take real CSS colors,
// not Tailwind classes — and Tailwind's build-time scanner needs the
// class names written out literally rather than assembled with template
// strings, or they'd get purged from the production CSS).
const NAMED_COLORS = {
  green: { chip: "bg-green-100 text-green-800 border border-green-300", hex: "#16a34a" },
  blue: { chip: "bg-blue-100 text-blue-800 border border-blue-300", hex: "#2563eb" },
  orange: { chip: "bg-orange-100 text-orange-800 border border-orange-300", hex: "#ea580c" },
  sky: { chip: "bg-sky-100 text-sky-800 border border-sky-300", hex: "#0284c7" },
  purple: { chip: "bg-purple-100 text-purple-800 border border-purple-300", hex: "#9333ea" },
  lime: { chip: "bg-lime-100 text-lime-800 border border-lime-300", hex: "#65a30d" },
  yellow: { chip: "bg-yellow-100 text-yellow-800 border border-yellow-300", hex: "#ca8a04" },
  pink: { chip: "bg-pink-100 text-pink-800 border border-pink-300", hex: "#db2777" },
  rose: { chip: "bg-rose-100 text-rose-800 border border-rose-300", hex: "#e11d48" },
  emerald: { chip: "bg-emerald-100 text-emerald-800 border border-emerald-300", hex: "#059669" },
} as const;

function normalizeServiceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fixed, explicit rules (checked in order — first match wins) rather than
// an automatic per-view assignment: the business wants a given service to
// always be the same color everywhere, permanently, not just distinct
// from whatever else happens to be on screen. Matching is substring-based
// against the normalized service label (hyphens collapsed to spaces) so
// small wording differences in the Jobber title ("Bimonthly" vs
// "Bi-Monthly") still hit the right rule. Anything that matches none of
// these falls through to emerald.
const SERVICE_COLOR_RULES: {
  color: keyof typeof NAMED_COLORS;
  test: (label: string) => boolean;
}[] = [
  {
    color: "green",
    test: (l) => l.includes("initial") && l.includes("full") && l.includes("clean"),
  },
  {
    color: "blue",
    test: (l) => l.includes("full") && l.includes("clean") && l.includes("return"),
  },
  {
    color: "orange",
    test: (l) => l.includes("bimonthly") || l.includes("bi monthly"),
  },
  {
    color: "rose",
    test: (l) => l.includes("semi annual") || l.includes("semiannual"),
  },
  {
    color: "sky",
    test: (l) => l.includes("quarterly"),
  },
  {
    color: "purple",
    test: (l) => l.includes("maintenance") && l.includes("monthly"),
  },
  {
    color: "lime",
    test: (l) => l.includes("full") && l.includes("monthly"),
  },
  {
    color: "yellow",
    test: (l) => l.includes("spray") && l.includes("only"),
  },
  {
    color: "pink",
    test: (l) => l.includes("weekly"),
  },
];

function classifyService(
  rawTitle: string | null
): { label: string; chip: string; hex: string } {
  const label = visitServiceLabel(rawTitle);
  const normalized = normalizeServiceText(label);

  const rule = SERVICE_COLOR_RULES.find((r) => r.test(normalized));
  const color = NAMED_COLORS[rule?.color ?? "emerald"];

  return { label, chip: color.chip, hex: color.hex };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function scheduleUrl(view: ViewMode, dateStr: string): string {
  return `/schedule?view=${view}&date=${dateStr}`;
}

function buildScheduleVisit(
  visit: VisitRow,
  contact: CustomerContact | null,
  assignedUsers: AssignableUser[],
  jobPricing: JobPricing | null,
  jobVisitCountThisMonth: number
): ScheduleVisit {
  const meta = statusMeta(visit.visit_status);
  const address = contact
    ? [contact.address_line_1, contact.city, contact.state]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const dateKey = phoenixDateKey(visit.start_at);
  const { label, chip, hex } = classifyService(visit.title);
  const timeLabel = formatTime(visit.start_at);

  const latitude = contact?.latitude != null ? Number(contact.latitude) : NaN;
  const longitude =
    contact?.longitude != null ? Number(contact.longitude) : NaN;

  return {
    id: visit.jobber_visit_id,
    clientId: visit.jobber_client_id,
    customerName: visit.customer_name || "Unnamed Customer",
    address,
    phone: contact?.phone ?? null,
    dateStr: dateKey ?? "",
    dateHeading: dateKey
      ? formatDateHeading(new Date(`${dateKey}T00:00:00Z`))
      : "Unscheduled",
    dateTimeShort: dateKey
      ? `${formatShortDate(new Date(`${dateKey}T00:00:00Z`))} · ${timeLabel}`
      : timeLabel,
    startTimeLabel: timeLabel,
    endTimeLabel: visit.end_at ? formatTime(visit.end_at) : null,
    durationMinutes: toNumber(visit.duration_minutes),
    service: visit.title,
    serviceLabel: label,
    serviceChipClass: chip,
    serviceColorHex: hex,
    statusLabel: meta.label,
    statusClasses: meta.classes,
    statusDotClass: meta.dot,
    gateCode: contact?.gate_code ?? null,
    specialInstructions: contact?.service_instructions ?? null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    startAtIso: visit.start_at,
    endAtIso: visit.end_at,
    assignedUsers,
    jobId: visit.jobber_job_id,
    jobTotal: jobPricing ? jobPricing.total : null,
    jobVisitCountThisMonth,
    visitPrice:
      jobPricing && jobVisitCountThisMonth > 0
        ? jobPricing.total / jobVisitCountThisMonth
        : jobPricing?.total ?? null,
  };
}

// Every visit already carries its own fair share of its job's total (see
// ScheduleVisit.visitPrice — jobTotal divided by how many of that job's
// visits fall in the same month), so summing visitPrice across any set
// of visits is always correct: a job's several visits add back up to
// exactly jobTotal, and a job with only one visit this month just adds
// its whole total once. No per-job dedup needed here (unlike the
// job-total-based summaries in lib/visitReportFormatting.ts and
// recurring-services/page.tsx, which sum the undivided jobTotal and so
// dedupe by job instead).
function sumVisitPrices(visits: ScheduleVisit[]): number {
  return visits.reduce((sum, visit) => sum + (visit.visitPrice ?? 0), 0);
}

function toPins(visits: ScheduleVisit[]): SchedulePin[] {
  return visits
    .filter((v) => v.latitude != null && v.longitude != null)
    .map((v) => ({
      id: v.id,
      name: v.customerName,
      lat: v.latitude as number,
      lng: v.longitude as number,
      dateTimeShort: v.dateTimeShort,
      serviceLabel: v.serviceLabel,
      color: v.serviceColorHex,
    }));
}

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  const params = await searchParams;
  const view: ViewMode = isViewMode(params.view) ? params.view : "month";
  const selectedDate = parseDate(params.date);
  const dateStr = formatDateInput(selectedDate);

  const today = getPhoenixToday();
  const todayStr = formatDateInput(today);

  // Compute the query window and nav targets for whichever view is active.
  // Month view queries only the actual month's days — not a padded 6-week
  // grid — so visits from the tail end of the previous month or the start
  // of the next never show up on a page showing "this month."
  let queryStartDate: Date;
  let queryEndDate: Date;
  let prevHref: string;
  let nextHref: string;
  let todayHref: string;
  let heading: string;
  let isCurrentPeriod: boolean;

  const weekStartDate = addDays(selectedDate, -selectedDate.getUTCDay());
  const weekEndDate = addDays(weekStartDate, 6);
  const monthStartDate = new Date(
    Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1)
  );
  const monthEndDate = new Date(
    Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0)
  );
  const gridStartDate = addDays(monthStartDate, -monthStartDate.getUTCDay());
  const gridDates = Array.from({ length: 42 }, (_, i) => addDays(gridStartDate, i));

  if (view === "week") {
    queryStartDate = weekStartDate;
    queryEndDate = weekEndDate;
    prevHref = scheduleUrl("week", formatDateInput(addDays(weekStartDate, -7)));
    nextHref = scheduleUrl("week", formatDateInput(addDays(weekStartDate, 7)));
    todayHref = scheduleUrl("week", todayStr);
    heading = formatRangeHeading(weekStartDate, weekEndDate);
    isCurrentPeriod = today >= weekStartDate && today <= weekEndDate;
  } else if (view === "month") {
    queryStartDate = monthStartDate;
    queryEndDate = monthEndDate;
    prevHref = scheduleUrl("month", formatDateInput(addMonths(monthStartDate, -1)));
    nextHref = scheduleUrl("month", formatDateInput(addMonths(monthStartDate, 1)));
    todayHref = scheduleUrl("month", todayStr);
    heading = formatMonthHeading(monthStartDate);
    isCurrentPeriod =
      today.getUTCFullYear() === monthStartDate.getUTCFullYear() &&
      today.getUTCMonth() === monthStartDate.getUTCMonth();
  } else {
    queryStartDate = selectedDate;
    queryEndDate = selectedDate;
    prevHref = scheduleUrl("day", formatDateInput(addDays(selectedDate, -1)));
    nextHref = scheduleUrl("day", formatDateInput(addDays(selectedDate, 1)));
    todayHref = scheduleUrl("day", todayStr);
    heading = formatDateHeading(selectedDate);
    isCurrentPeriod = dateStr === todayStr;
  }

  const queryStart = `${formatDateInput(queryStartDate)}T00:00:00-07:00`;
  const queryEnd = `${formatDateInput(queryEndDate)}T23:59:59-07:00`;

  const [{ data, error }, currentUser] = await Promise.all([
    supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, jobber_invoice_id, customer_name, job_number, job_status, title, visit_status, start_at, end_at, duration_minutes"
      )
      // Job canceled directly in Jobber's own UI (not through this app)
      // only fires a job-level webhook — it never touches the visit rows
      // themselves, so without this filter a canceled job's visits sit
      // in jobber_visits forever looking "upcoming." See
      // 051_add_job_status_to_visits.sql. Written as job_status.is.null
      // OR job_status.neq.archived (not a plain .neq()) because a bare
      // <> comparison excludes NULL rows in SQL, which would hide every
      // visit not yet backfilled/synced with a job_status at all.
      .or("job_status.is.null,job_status.neq.archived")
      .gte("start_at", queryStart)
      .lte("start_at", queryEnd)
      .order("start_at", { ascending: true }),
    getCurrentUser(),
  ]);

  const visits = (data ?? []) as VisitRow[];

  const clientIds = Array.from(
    new Set(visits.map((v) => v.jobber_client_id).filter(Boolean))
  ) as string[];

  const visitIds = visits.map((v) => v.jobber_visit_id);

  const jobIds = Array.from(
    new Set(visits.map((v) => v.jobber_job_id).filter(Boolean))
  ) as string[];

  // canAssign gates the "Assign To" control in the detail modal — see
  // 017_add_visit_assignments.sql's header comment for why assignment is
  // local-only, and schedule/actions.ts's assignVisit for the matching
  // server-side role check (this is UI-level convenience, not the real
  // gate).
  const canAssign =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  // The month(s) touched by the current view — day/week windows are
  // smaller than a month, so the visits loaded above can't tell us a
  // job's true visit count for the month it's actually billed against.
  // At most this spans two calendar months (a week view straddling a
  // month boundary); for month view it's exactly the one month already
  // loaded. Queried separately from the main visits fetch above because
  // it needs every visit for these jobs in range, not just the ones
  // falling inside the current view's day/week window.
  const jobCountRangeStart = new Date(
    Date.UTC(queryStartDate.getUTCFullYear(), queryStartDate.getUTCMonth(), 1)
  );
  const jobCountRangeEnd = new Date(
    Date.UTC(queryEndDate.getUTCFullYear(), queryEndDate.getUTCMonth() + 1, 0)
  );
  const jobCountRangeStartIso = `${formatDateInput(jobCountRangeStart)}T00:00:00-07:00`;
  const jobCountRangeEndIso = `${formatDateInput(jobCountRangeEnd)}T23:59:59-07:00`;

  const [
    { data: contactsData },
    { data: assignmentsData },
    { data: usersData },
    { data: jobsData },
    { data: monthVisitsData },
  ] = await Promise.all([
    clientIds.length > 0
      ? supabaseServer
          .from("customers")
          .select(
            "jobber_client_id, phone, address_line_1, city, state, gate_code, service_instructions, latitude, longitude"
          )
          .in("jobber_client_id", clientIds)
      : Promise.resolve({ data: [] as CustomerContact[] }),
    visitIds.length > 0
      ? supabaseServer
          .from("visit_assignments")
          .select("jobber_visit_id, assigned_user_id")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as VisitAssignmentRow[] }),
    supabaseServer
      .from("users")
      .select("id, name")
      .eq("active", true)
      .order("name", { ascending: true }),
    // Priced off jobber_jobs.total, not anything on jobber_visits itself
    // — see the JobPricing/sumVisitPrices comments above. The
    // schedule's query window is always at most a month, so unlike
    // lib/visitReport.ts's fetchJobsByIds this never needs to batch past
    // Supabase's .in() row limits.
    jobIds.length > 0
      ? supabaseServer
          .from("jobber_jobs")
          .select("jobber_job_id, total")
          .in("jobber_job_id", jobIds)
      : Promise.resolve({ data: [] as JobRow[] }),
    // Every visit for these jobs across the full month(s) above — used
    // only to count visits per (job, month), not rendered directly.
    jobIds.length > 0
      ? supabaseServer
          .from("jobber_visits")
          .select("jobber_job_id, start_at")
          .in("jobber_job_id", jobIds)
          .gte("start_at", jobCountRangeStartIso)
          .lte("start_at", jobCountRangeEndIso)
      : Promise.resolve({ data: [] as MonthVisitRow[] }),
  ]);

  const contactMap = new Map<string, CustomerContact>(
    ((contactsData ?? []) as CustomerContact[]).map((c) => [
      c.jobber_client_id,
      c,
    ])
  );

  const userNameById = new Map<string, string>(
    ((usersData ?? []) as UserRow[]).map((u) => [u.id, u.name])
  );

  // Multiple assignees per visit (018_visit_assignments_multi.sql) — one
  // array per visit rather than a single {userId, userName}.
  const assignmentMap = new Map<string, AssignableUser[]>();
  for (const row of (assignmentsData ?? []) as VisitAssignmentRow[]) {
    const userName = userNameById.get(row.assigned_user_id);
    if (!userName) continue;

    const list = assignmentMap.get(row.jobber_visit_id) ?? [];
    list.push({ id: row.assigned_user_id, name: userName });
    assignmentMap.set(row.jobber_visit_id, list);
  }

  const assignableUsers: AssignableUser[] = ((usersData ?? []) as UserRow[]).map(
    (u) => ({ id: u.id, name: u.name })
  );

  const jobPricingMap = new Map<string, JobPricing>(
    ((jobsData ?? []) as JobRow[]).map((job) => [
      job.jobber_job_id,
      { total: toNumber(job.total) },
    ])
  );

  // Counts, per job, of how many visits land in each Phoenix-local
  // calendar month — the denominator behind ScheduleVisit.visitPrice.
  // Keyed "{jobId}:{YYYY-MM}" since the same job could show visits from
  // two different months within one week-view query.
  const visitCountByJobMonth = new Map<string, number>();
  for (const row of (monthVisitsData ?? []) as MonthVisitRow[]) {
    const monthKey = phoenixMonthKey(row.start_at);
    if (!row.jobber_job_id || !monthKey) continue;

    const key = `${row.jobber_job_id}:${monthKey}`;
    visitCountByJobMonth.set(key, (visitCountByJobMonth.get(key) ?? 0) + 1);
  }

  const enrichedVisits: ScheduleVisit[] = visits.map((visit) => {
    const monthKey = phoenixMonthKey(visit.start_at);
    const countKey =
      visit.jobber_job_id && monthKey
        ? `${visit.jobber_job_id}:${monthKey}`
        : null;
    // Falls back to 1 (not 0) so a visit whose job somehow didn't come
    // back in the month-visits query — e.g. a data gap — still shows its
    // job's full total rather than dividing by zero.
    const jobVisitCountThisMonth = countKey
      ? visitCountByJobMonth.get(countKey) ?? 1
      : 1;

    return buildScheduleVisit(
      visit,
      visit.jobber_client_id ? contactMap.get(visit.jobber_client_id) ?? null : null,
      assignmentMap.get(visit.jobber_visit_id) ?? [],
      visit.jobber_job_id ? jobPricingMap.get(visit.jobber_job_id) ?? null : null,
      jobVisitCountThisMonth
    );
  });

  // Group every fetched visit by its Phoenix-local calendar day, for the
  // week/month grids.
  const visitsByDate: Record<string, ScheduleVisit[]> = {};
  for (const visit of enrichedVisits) {
    if (!visit.dateStr) continue;
    (visitsByDate[visit.dateStr] ??= []).push(visit);
  }

  // One dollar total per day — just the sum of that day's visitPrice
  // values (see sumVisitPrices), for the pill ScheduleGrids renders at
  // the bottom of each week/month day cell.
  const dailyTotals: Record<string, number> = {};
  for (const [date, dayVisits] of Object.entries(visitsByDate)) {
    dailyTotals[date] = sumVisitPrices(dayVisits);
  }

  // Same sum, across the whole query window — feeds the "Total Price"
  // stat card below, which already scopes to exactly the current
  // day/week/month via queryStart/queryEnd, so this one number answers
  // both "total for the day" and "total for the week" depending on
  // which view is active.
  const periodTotal = sumVisitPrices(enrichedVisits);

  const completedCount = enrichedVisits.filter(
    (v) => v.statusLabel === "Completed"
  ).length;
  const lateCount = enrichedVisits.filter((v) => v.statusLabel === "Late").length;
  const upcomingCount = enrichedVisits.filter(
    (v) => v.statusLabel === "Upcoming"
  ).length;

  const totalMinutes = enrichedVisits.reduce(
    (sum, v) => sum + v.durationMinutes,
    0
  );
  const totalHours = (totalMinutes / 60).toFixed(1);

  const periodLabel =
    view === "day" ? "today" : view === "week" ? "this week" : "this month";

  const containerMaxWidth = view === "day" ? "max-w-4xl" : "max-w-6xl";

  const viewLabel: Record<ViewMode, string> = {
    day: "Today",
    week: "This Week",
    month: "This Month",
  };

  const mapTitle =
    view === "month" ? `Stops in ${heading}` : `Stops for ${heading}`;

  const pins = toPins(enrichedVisits);

  // GridDate arrays for the week/month client component. Built here (not
  // in the client) so all the Intl/date-math stays server-side and the
  // client component only ever renders data it's handed.
  const weekDates: GridDate[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStartDate, i);
    const cellDateStr = formatDateInput(day);
    return {
      dateStr: cellDateStr,
      dayNumber: day.getUTCDate(),
      weekdayShort: formatShortWeekday(day),
      inMonth: true,
      isToday: cellDateStr === todayStr,
      dayHref: scheduleUrl("day", cellDateStr),
    };
  });

  const monthDates: GridDate[] = gridDates.map((day) => {
    const cellDateStr = formatDateInput(day);
    return {
      dateStr: cellDateStr,
      dayNumber: day.getUTCDate(),
      weekdayShort: formatShortWeekday(day),
      inMonth: day.getUTCMonth() === monthStartDate.getUTCMonth(),
      isToday: cellDateStr === todayStr,
      dayHref: scheduleUrl("day", cellDateStr),
    };
  });

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <ScheduleInteractive
        view={view}
        visits={enrichedVisits}
        weekDates={weekDates}
        monthDates={monthDates}
        visitsByDate={visitsByDate}
        dailyTotals={dailyTotals}
        pins={pins}
        mapTitle={mapTitle}
        canAssign={canAssign}
        assignableUsers={assignableUsers}
      >
        <div className={`mx-auto ${containerMaxWidth}`}>
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
                Valley Turf Revival OS
              </p>

              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Schedule</h1>
            </div>
          </header>

          <div className="mt-5 flex flex-wrap gap-2">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <Link
                key={mode}
                href={scheduleUrl(mode, dateStr)}
                className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${
                  view === mode
                    ? "bg-[#174734] text-white"
                    : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                }`}
              >
                {mode}
              </Link>
            ))}
          </div>

          <section className="mt-3 rounded-2xl bg-white p-5 shadow">
            <div className="relative flex flex-col items-center gap-3 sm:flex-row">
              <div className="flex items-center gap-2">
                <Link
                  href={prevHref}
                  className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
                >
                  ← Prev
                </Link>

                {!isCurrentPeriod && (
                  <Link
                    href={todayHref}
                    className="rounded-xl bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
                  >
                    {viewLabel[view]}
                  </Link>
                )}

                <Link
                  href={nextHref}
                  className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
                >
                  Next →
                </Link>
              </div>

              <p className="text-center text-lg font-bold sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
                {heading}
                {isCurrentPeriod && (
                  <span className="ml-2 text-sm font-normal text-[#9c7a20]">
                    ({viewLabel[view]})
                  </span>
                )}
              </p>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <p className="text-2xl font-bold">{enrichedVisits.length}</p>
              <p className="text-xs text-[#6b705c]">Total Visits</p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4 text-center shadow">
              <p className="text-2xl font-bold text-blue-800">{upcomingCount}</p>
              <p className="text-xs text-blue-700">Upcoming</p>
            </div>

            <div className="rounded-2xl bg-green-50 p-4 text-center shadow">
              <p className="text-2xl font-bold text-green-800">
                {completedCount}
              </p>
              <p className="text-xs text-green-700">Completed</p>
            </div>

            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <p className="text-2xl font-bold">{totalHours}</p>
              <p className="text-xs text-[#6b705c]">Scheduled Hours</p>
            </div>

            <div className="rounded-2xl bg-[#fdf8ea] p-4 text-center shadow">
              <p className="text-2xl font-bold text-[#9c7a20]">
                {formatCurrency(periodTotal)}
              </p>
              <p className="text-xs text-[#9c7a20]">
                Total Price ({viewLabel[view]})
              </p>
            </div>
          </section>

          {lateCount > 0 && (
            <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
              <p className="text-sm font-bold">
                {lateCount} visit{lateCount === 1 ? "" : "s"} marked late{" "}
                {periodLabel}
              </p>
            </section>
          )}

          {error && (
            <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
              <p className="font-bold text-red-700">
                Schedule could not be loaded
              </p>
              <p className="mt-1 text-sm text-red-600">{error.message}</p>
            </section>
          )}
        </div>
      </ScheduleInteractive>
    </main>
  );
}
