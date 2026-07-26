export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

const LOOKAHEAD_DAYS = 30;

type JobRow = {
  jobber_job_id: string;
  job_type: string | null;
  title: string | null;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
};

type CustomerContact = {
  jobber_client_id: string;
  phone: string | null;
  city: string | null;
  state: string | null;
};

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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDateHeading(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
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

export default async function RecurringServicesPage() {
  const today = getPhoenixToday();
  const windowEnd = addDays(today, LOOKAHEAD_DAYS);

  const rangeStart = `${today.toISOString().slice(0, 10)}T00:00:00-07:00`;
  const rangeEnd = `${windowEnd.toISOString().slice(0, 10)}T23:59:59-07:00`;

  // job_type is Jobber's own ONE_OFF/RECURRING signal on the job record —
  // more reliable than inferring recurrence from keyword-matching a job
  // title or invoice subject, which is what the revenue forecast's
  // "is_recurring_service" logic currently does.
  const { data: jobsData, error: jobsError } = await supabaseServer
    .from("jobber_jobs")
    .select("jobber_job_id, job_type, title")
    .ilike("job_type", "%recur%");

  const recurringJobs = (jobsData ?? []) as JobRow[];
  const recurringJobIds = recurringJobs.map((job) => job.jobber_job_id);
  const jobTitleById = new Map(
    recurringJobs.map((job) => [job.jobber_job_id, job.title])
  );

  const { data: visitsData, error: visitsError } =
    recurringJobIds.length > 0
      ? await supabaseServer
          .from("jobber_visits")
          .select(
            "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, job_number, title, visit_status, start_at"
          )
          .in("jobber_job_id", recurringJobIds)
          .gte("start_at", rangeStart)
          .lte("start_at", rangeEnd)
          .order("start_at", { ascending: true })
      : { data: [] as VisitRow[], error: null };

  const visits = (visitsData ?? []) as VisitRow[];

  const clientIds = Array.from(
    new Set(visits.map((visit) => visit.jobber_client_id).filter(Boolean))
  ) as string[];

  const { data: contactsData } =
    clientIds.length > 0
      ? await supabaseServer
          .from("customers")
          .select("jobber_client_id, phone, city, state")
          .in("jobber_client_id", clientIds)
      : { data: [] as CustomerContact[] };

  const contactMap = new Map<string, CustomerContact>(
    ((contactsData ?? []) as CustomerContact[]).map((contact) => [
      contact.jobber_client_id,
      contact,
    ])
  );

  const uniqueCustomers = new Set(
    visits.map((visit) => visit.jobber_client_id).filter(Boolean)
  ).size;

  const error = jobsError || visitsError;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-4xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-4xl font-bold">Upcoming Recurring Services</h1>

          <p className="mt-2 max-w-2xl text-[#6b705c]">
            Visits scheduled in the next {LOOKAHEAD_DAYS} days that belong to
            a recurring job (per Jobber's own job type), so you can see who's
            coming up and what service they're getting without waiting on a
            revenue forecast.
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 text-center shadow">
            <p className="text-2xl font-bold">{visits.length}</p>
            <p className="text-xs text-[#6b705c]">Scheduled Visits</p>
          </div>

          <div className="rounded-2xl bg-white p-4 text-center shadow">
            <p className="text-2xl font-bold">{uniqueCustomers}</p>
            <p className="text-xs text-[#6b705c]">Unique Customers</p>
          </div>
        </section>

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Recurring services could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : visits.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-8 text-center shadow">
            <p className="text-[#6b705c]">
              No recurring-job visits scheduled in the next{" "}
              {LOOKAHEAD_DAYS} days.
            </p>
            <p className="mt-2 text-sm text-[#9c9887]">
              If this looks low, it may mean Jobber jobs aren't consistently
              marked as "Recurring" — worth spot-checking a known recurring
              customer's job in Jobber.
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-3">
            {visits.map((visit) => {
              const contact = visit.jobber_client_id
                ? contactMap.get(visit.jobber_client_id)
                : null;

              const service =
                visit.title ||
                (visit.jobber_job_id
                  ? jobTitleById.get(visit.jobber_job_id)
                  : null) ||
                "Recurring Service";

              const location = contact
                ? [contact.city, contact.state].filter(Boolean).join(", ")
                : null;

              return (
                <div
                  key={visit.jobber_visit_id}
                  className="rounded-2xl bg-white p-5 shadow"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#9c7a20]">
                        {visit.start_at
                          ? `${formatDateHeading(visit.start_at)} · ${formatTime(
                              visit.start_at
                            )}`
                          : "Unscheduled"}
                      </p>

                      <p className="mt-1 font-semibold">
                        {visit.customer_name || "Unnamed Customer"}
                      </p>

                      <p className="text-sm text-[#6b705c]">{service}</p>

                      {location && (
                        <p className="mt-1 text-sm text-[#6b705c]">
                          {location}
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

                    {visit.jobber_client_id && (
                      <Link
                        href={`/customers/${encodeURIComponent(
                          visit.jobber_client_id
                        )}`}
                        className="shrink-0 text-sm font-semibold text-[#9c7a20] hover:underline"
                      >
                        View Customer →
                      </Link>
                    )}
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
