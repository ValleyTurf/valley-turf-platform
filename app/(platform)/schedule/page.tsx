export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import ScheduleInteractive from "./ScheduleInteractive";
import type { GridDate, SchedulePin, ScheduleVisit } from "./types";

type ViewMode = "day" | "week" | "month";

type SchedulePageProps = {
  searchParams: Promise<{
    date?: string;
    view?: string;
  }>;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  jobber_invoice_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | string | null;
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

// Each entry pairs a Tailwind chip class (for the DOM) with the matching
// hex value (for Leaflet map pins, which take real CSS colors, not
// Tailwind classes — and Tailwind's build-time scanner needs the class
// names written out literally rather than assembled with template
// strings, or they'd get purged from the production CSS).
const SERVICE_PALETTE: { chip: string; hex: string }[] = [
  { chip: "bg-green-100 text-green-800 border border-green-300", hex: "#16a34a" },
  { chip: "bg-blue-100 text-blue-800 border border-blue-300", hex: "#2563eb" },
  { chip: "bg-purple-100 text-purple-800 border border-purple-300", hex: "#9333ea" },
  { chip: "bg-orange-100 text-orange-800 border border-orange-300", hex: "#ea580c" },
  { chip: "bg-pink-100 text-pink-800 border border-pink-300", hex: "#db2777" },
  { chip: "bg-teal-100 text-teal-800 border border-teal-300", hex: "#0d9488" },
  { chip: "bg-amber-100 text-amber-800 border border-amber-300", hex: "#d97706" },
  { chip: "bg-rose-100 text-rose-800 border border-rose-300", hex: "#e11d48" },
  { chip: "bg-indigo-100 text-indigo-800 border border-indigo-300", hex: "#4f46e5" },
  { chip: "bg-lime-100 text-lime-800 border border-lime-300", hex: "#65a30d" },
  { chip: "bg-cyan-100 text-cyan-800 border border-cyan-300", hex: "#0891b2" },
  { chip: "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300", hex: "#c026d3" },
  { chip: "bg-sky-100 text-sky-800 border border-sky-300", hex: "#0284c7" },
  { chip: "bg-emerald-100 text-emerald-800 border border-emerald-300", hex: "#059669" },
  { chip: "bg-yellow-100 text-yellow-800 border border-yellow-300", hex: "#ca8a04" },
  { chip: "bg-violet-100 text-violet-800 border border-violet-300", hex: "#7c3aed" },
];

// Colors are assigned per-request from whatever distinct service labels
// are actually in the current view (rather than hashing each label
// independently), so two different services can never land on the same
// color as long as there are 16 or fewer distinct services on screen at
// once — hashing each label separately can't guarantee that (birthday-
// paradox collisions start becoming likely well before 16 items), which
// is exactly how "Full - Monthly" and "Returning Customer Full" ended up
// sharing a color before. The tradeoff is that a given service's color
// isn't necessarily identical across different months — a small cosmetic
// cost for never showing two different services the same color within one
// view.
function assignServiceColors(
  labels: string[]
): Map<string, { chip: string; hex: string }> {
  const unique = Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
  const colors = new Map<string, { chip: string; hex: string }>();

  unique.forEach((label, index) => {
    colors.set(label, SERVICE_PALETTE[index % SERVICE_PALETTE.length]);
  });

  return colors;
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
  serviceColors: Map<string, { chip: string; hex: string }>
): ScheduleVisit {
  const meta = statusMeta(visit.visit_status);
  const address = contact
    ? [contact.address_line_1, contact.city, contact.state]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const dateKey = phoenixDateKey(visit.start_at);
  const label = visitServiceLabel(visit.title);
  const color = serviceColors.get(label) ?? SERVICE_PALETTE[0];
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
    serviceChipClass: color.chip,
    serviceColorHex: color.hex,
    statusLabel: meta.label,
    statusClasses: meta.classes,
    statusDotClass: meta.dot,
    gateCode: contact?.gate_code ?? null,
    specialInstructions: contact?.service_instructions ?? null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
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
  const view: ViewMode = isViewMode(params.view) ? params.view : "day";
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

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, jobber_client_id, jobber_invoice_id, customer_name, job_number, title, visit_status, start_at, end_at, duration_minutes"
    )
    .gte("start_at", queryStart)
    .lte("start_at", queryEnd)
    .order("start_at", { ascending: true });

  const visits = (data ?? []) as VisitRow[];

  const clientIds = Array.from(
    new Set(visits.map((v) => v.jobber_client_id).filter(Boolean))
  ) as string[];

  const { data: contactsData } =
    clientIds.length > 0
      ? await supabaseServer
          .from("customers")
          .select(
            "jobber_client_id, phone, address_line_1, city, state, gate_code, service_instructions, latitude, longitude"
          )
          .in("jobber_client_id", clientIds)
      : { data: [] as CustomerContact[] };

  const contactMap = new Map<string, CustomerContact>(
    ((contactsData ?? []) as CustomerContact[]).map((c) => [
      c.jobber_client_id,
      c,
    ])
  );

  const serviceColors = assignServiceColors(
    visits.map((v) => visitServiceLabel(v.title))
  );

  const enrichedVisits: ScheduleVisit[] = visits.map((visit) =>
    buildScheduleVisit(
      visit,
      visit.jobber_client_id ? contactMap.get(visit.jobber_client_id) ?? null : null,
      serviceColors
    )
  );

  // Group every fetched visit by its Phoenix-local calendar day, for the
  // week/month grids.
  const visitsByDate: Record<string, ScheduleVisit[]> = {};
  for (const visit of enrichedVisits) {
    if (!visit.dateStr) continue;
    (visitsByDate[visit.dateStr] ??= []).push(visit);
  }

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
        pins={pins}
        mapTitle={mapTitle}
      >
        <div className={`mx-auto ${containerMaxWidth}`}>
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
                Valley Turf Revival OS
              </p>

              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Schedule</h1>

              <p className="mt-2 max-w-2xl text-[#6b705c]">
                Real visit data synced from Jobber — who&apos;s scheduled where,
                and when.
              </p>
            </div>

            <Link
              href="/job-costs"
              className="w-full rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246] lg:w-auto"
            >
              Log Job Costs
            </Link>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
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

              <p className="text-lg font-bold">
                {heading}
                {isCurrentPeriod && (
                  <span className="ml-2 text-sm font-normal text-[#9c7a20]">
                    ({viewLabel[view]})
                  </span>
                )}
              </p>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
