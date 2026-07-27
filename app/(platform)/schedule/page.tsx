export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

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
} {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "COMPLETED") {
    return { label: "Completed", classes: "bg-green-100 text-green-800" };
  }

  if (normalized === "LATE") {
    return { label: "Late", classes: "bg-red-100 text-red-800" };
  }

  if (normalized === "UPCOMING") {
    return { label: "Upcoming", classes: "bg-blue-100 text-blue-800" };
  }

  return { label: status || "Unknown", classes: "bg-gray-100 text-gray-700" };
}

function statusDotClass(status: string | null): string {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "COMPLETED") return "bg-green-500";
  if (normalized === "LATE") return "bg-red-500";
  if (normalized === "UPCOMING") return "bg-blue-500";
  return "bg-gray-400";
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
  // All three views share one jobber_visits query — day queries a single
  // day, week queries 7 days, month queries the full 6-week grid (including
  // the leading/trailing days from adjacent months that fill it out).
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
  const gridStartDate = addDays(monthStartDate, -monthStartDate.getUTCDay());
  const gridDates = Array.from({ length: 42 }, (_, i) => addDays(gridStartDate, i));
  const gridEndDate = gridDates[41];

  if (view === "week") {
    queryStartDate = weekStartDate;
    queryEndDate = weekEndDate;
    prevHref = scheduleUrl("week", formatDateInput(addDays(weekStartDate, -7)));
    nextHref = scheduleUrl("week", formatDateInput(addDays(weekStartDate, 7)));
    todayHref = scheduleUrl("week", todayStr);
    heading = formatRangeHeading(weekStartDate, weekEndDate);
    isCurrentPeriod = today >= weekStartDate && today <= weekEndDate;
  } else if (view === "month") {
    queryStartDate = gridStartDate;
    queryEndDate = gridEndDate;
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
          .select("jobber_client_id, phone, address_line_1, city, state")
          .in("jobber_client_id", clientIds)
      : { data: [] as CustomerContact[] };

  const contactMap = new Map<string, CustomerContact>(
    ((contactsData ?? []) as CustomerContact[]).map((c) => [
      c.jobber_client_id,
      c,
    ])
  );

  // Group every fetched visit by its Phoenix-local calendar day, for the
  // week/month grids. Visits with no start_at never match the range filter
  // above, so every row here always has one.
  const visitsByDate = new Map<string, VisitRow[]>();
  for (const visit of visits) {
    const key = phoenixDateKey(visit.start_at);
    if (!key) continue;
    const existing = visitsByDate.get(key);
    if (existing) {
      existing.push(visit);
    } else {
      visitsByDate.set(key, [visit]);
    }
  }

  // Stats reflect exactly what's on screen: the single day for day view,
  // the 7 fetched days for week view, and only the in-month days for month
  // view (excluding the leading/trailing days from adjacent months that
  // fill out the grid).
  const statsVisits =
    view === "month"
      ? gridDates
          .filter((d) => d.getUTCMonth() === monthStartDate.getUTCMonth())
          .flatMap((d) => visitsByDate.get(formatDateInput(d)) ?? [])
      : visits;

  const completedCount = statsVisits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "COMPLETED"
  ).length;
  const lateCount = statsVisits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "LATE"
  ).length;
  const upcomingCount = statsVisits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "UPCOMING"
  ).length;

  const totalMinutes = statsVisits.reduce(
    (sum, v) => sum + toNumber(v.duration_minutes),
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

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
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
            <p className="text-2xl font-bold">{statsVisits.length}</p>
            <p className="text-xs text-[#6b705c]">Total Visits</p>
          </div>

          <div className="rounded-2xl bg-blue-50 p-4 text-center shadow">
            <p className="text-2xl font-bold text-blue-800">
              {upcomingCount}
            </p>
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

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Schedule could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : view === "day" ? (
          visits.length === 0 ? (
            <section className="mt-6 rounded-2xl bg-white p-8 text-center shadow">
              <p className="text-[#6b705c]">No visits scheduled this day.</p>
            </section>
          ) : (
            <section className="mt-6 space-y-3">
              {visits.map((visit) => {
                const meta = statusMeta(visit.visit_status);
                const contact = visit.jobber_client_id
                  ? contactMap.get(visit.jobber_client_id)
                  : null;

                const address = contact
                  ? [contact.address_line_1, contact.city, contact.state]
                      .filter(Boolean)
                      .join(", ")
                  : null;

                return (
                  <div
                    key={visit.jobber_visit_id}
                    className="rounded-2xl bg-white p-5 shadow"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-lg font-bold">
                          {formatTime(visit.start_at)}
                          {visit.duration_minutes
                            ? ` · ${toNumber(visit.duration_minutes)} min`
                            : ""}
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.customer_name || "Unnamed Customer"}
                        </p>

                        {visit.title && (
                          <p className="text-sm text-[#6b705c]">
                            {visit.title}
                          </p>
                        )}

                        {address && (
                          <p className="mt-1 text-sm text-[#6b705c]">
                            {address}
                          </p>
                        )}

                        {contact?.phone && (
                          <a
                            href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                            className="mt-1 inline-block text-sm font-semibold text-[#9c7a20] hover:underline"
                          >
                            {contact.phone}
                          </a>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${meta.classes}`}
                        >
                          {meta.label}
                        </span>

                        {visit.jobber_client_id && (
                          <Link
                            href={`/customers/${encodeURIComponent(
                              visit.jobber_client_id
                            )}`}
                            className="text-sm font-semibold text-[#9c7a20] hover:underline"
                          >
                            View Customer →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )
        ) : view === "week" ? (
          <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)).map(
              (day) => {
                const cellDateStr = formatDateInput(day);
                const dayVisits = visitsByDate.get(cellDateStr) ?? [];
                const isToday = cellDateStr === todayStr;
                const visibleVisits = dayVisits.slice(0, 5);
                const remaining = dayVisits.length - visibleVisits.length;

                return (
                  <div
                    key={cellDateStr}
                    className={`rounded-2xl bg-white p-3 shadow ${
                      isToday ? "ring-2 ring-[#d4af37]" : ""
                    }`}
                  >
                    <Link
                      href={scheduleUrl("day", cellDateStr)}
                      className="block hover:underline"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#9c7a20]">
                        {formatShortWeekday(day)}
                      </p>
                      <p className="text-lg font-bold">{day.getUTCDate()}</p>
                    </Link>

                    <div className="mt-2 space-y-1.5">
                      {dayVisits.length === 0 ? (
                        <p className="text-xs text-[#6b705c]">No visits</p>
                      ) : (
                        <>
                          {visibleVisits.map((visit) => (
                            <div
                              key={visit.jobber_visit_id}
                              className="flex items-center gap-1.5 text-xs"
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(
                                  visit.visit_status
                                )}`}
                              />
                              <span className="truncate">
                                {formatTime(visit.start_at)}
                                {" · "}
                                {visit.customer_name || "Unnamed"}
                              </span>
                            </div>
                          ))}
                          {remaining > 0 && (
                            <p className="text-xs font-semibold text-[#9c7a20]">
                              +{remaining} more
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </section>
        ) : (
          <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow">
            <div className="grid grid-cols-7 border-b border-[#eee9dc] bg-[#f7f6f1]">
              {gridDates.slice(0, 7).map((day) => (
                <div
                  key={formatShortWeekday(day)}
                  className="p-2 text-center text-xs font-bold uppercase tracking-wide text-[#9c7a20]"
                >
                  {formatShortWeekday(day)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {gridDates.map((day) => {
                const cellDateStr = formatDateInput(day);
                const dayVisits = visitsByDate.get(cellDateStr) ?? [];
                const inMonth = day.getUTCMonth() === monthStartDate.getUTCMonth();
                const isToday = cellDateStr === todayStr;
                const anyLate = dayVisits.some(
                  (v) => (v.visit_status ?? "").toUpperCase() === "LATE"
                );
                const allCompleted =
                  dayVisits.length > 0 &&
                  dayVisits.every(
                    (v) => (v.visit_status ?? "").toUpperCase() === "COMPLETED"
                  );
                const badgeClasses = anyLate
                  ? "bg-red-100 text-red-800"
                  : allCompleted
                    ? "bg-green-100 text-green-800"
                    : "bg-blue-100 text-blue-800";

                return (
                  <Link
                    key={cellDateStr}
                    href={scheduleUrl("day", cellDateStr)}
                    className={`min-h-[72px] border-b border-r border-[#eee9dc] p-2 transition hover:bg-[#f7f6f1] ${
                      inMonth ? "bg-white" : "bg-[#faf9f5]"
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isToday
                          ? "bg-[#d4af37] text-[#174734]"
                          : inMonth
                            ? "text-[#174734]"
                            : "text-[#b5b09f]"
                      }`}
                    >
                      {day.getUTCDate()}
                    </span>

                    {dayVisits.length > 0 && (
                      <span
                        className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClasses}`}
                      >
                        {dayVisits.length} visit{dayVisits.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
