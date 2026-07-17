export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type SchedulePageProps = {
  searchParams: Promise<{
    date?: string;
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

function formatDateHeading(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  const params = await searchParams;
  const selectedDate = parseDate(params.date);
  const dateStr = formatDateInput(selectedDate);

  const dayStart = `${dateStr}T00:00:00-07:00`;
  const dayEnd = `${dateStr}T23:59:59-07:00`;

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, jobber_client_id, jobber_invoice_id, customer_name, job_number, title, visit_status, start_at, end_at, duration_minutes"
    )
    .gte("start_at", dayStart)
    .lte("start_at", dayEnd)
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

  const completedCount = visits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "COMPLETED"
  ).length;
  const lateCount = visits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "LATE"
  ).length;
  const upcomingCount = visits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "UPCOMING"
  ).length;

  const totalMinutes = visits.reduce(
    (sum, v) => sum + toNumber(v.duration_minutes),
    0
  );
  const totalHours = (totalMinutes / 60).toFixed(1);

  const today = getPhoenixToday();
  const isToday = dateStr === formatDateInput(today);

  const prevDateStr = formatDateInput(addDays(selectedDate, -1));
  const nextDateStr = formatDateInput(addDays(selectedDate, 1));
  const todayStr = formatDateInput(today);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">Daily Schedule</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Real visit data synced from Jobber — who's scheduled where,
              and when.
            </p>
          </div>

          <Link
            href="/job-costs"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Log Job Costs
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/schedule?date=${prevDateStr}`}
                className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                ← Prev Day
              </Link>

              {!isToday && (
                <Link
                  href={`/schedule?date=${todayStr}`}
                  className="rounded-xl bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
                >
                  Today
                </Link>
              )}

              <Link
                href={`/schedule?date=${nextDateStr}`}
                className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                Next Day →
              </Link>
            </div>

            <p className="text-lg font-bold">
              {formatDateHeading(selectedDate)}
              {isToday && (
                <span className="ml-2 text-sm font-normal text-[#9c7a20]">
                  (Today)
                </span>
              )}
            </p>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 text-center shadow">
            <p className="text-2xl font-bold">{visits.length}</p>
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
              {lateCount} visit{lateCount === 1 ? "" : "s"} marked late today
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
        ) : visits.length === 0 ? (
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
        )}
      </div>
    </main>
  );
}
