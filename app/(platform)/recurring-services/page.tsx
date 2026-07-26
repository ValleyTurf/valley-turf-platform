export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type RangeKey = "7" | "30" | "month" | "custom";
type CategoryKey = "monthly" | "quarterly" | "bimonthly" | "semiannual" | "other";

type RecurringServicesPageProps = {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
    category?: string;
  }>;
};

type JobCategoryRow = {
  jobber_job_id: string;
  service_category: string | null;
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

type CategoryBucket = {
  key: CategoryKey;
  label: string;
  visits: VisitRow[];
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  bimonthly: "Bi-Monthly",
  semiannual: "Semi-Annual",
  other: "All Others",
};

function categoryKeyFor(serviceCategory: string | null): CategoryKey {
  switch (serviceCategory) {
    case "Monthly Maintenance":
      return "monthly";
    case "Quarterly Cleaning":
      return "quarterly";
    case "Bimonthly Cleaning":
      return "bimonthly";
    case "Semi-Annual Cleaning":
      return "semiannual";
    default:
      return "other";
  }
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseCustomDate(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getRangeBounds(
  range: RangeKey,
  today: Date,
  customStart: string | undefined,
  customEnd: string | undefined
): { start: Date; end: Date } {
  if (range === "7") {
    return { start: today, end: addDays(today, 6) };
  }

  if (range === "month") {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();

    return {
      start: new Date(Date.UTC(year, month + 1, 1)),
      end: new Date(Date.UTC(year, month + 2, 0)),
    };
  }

  if (range === "custom") {
    const start = parseCustomDate(customStart, today);
    const end = parseCustomDate(customEnd, addDays(today, 29));

    return end < start ? { start, end: start } : { start, end };
  }

  return { start: today, end: addDays(today, 29) };
}

function formatRangeLabel(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(start)} – ${formatter.format(end)}`;
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

export default async function RecurringServicesPage({
  searchParams,
}: RecurringServicesPageProps) {
  const params = await searchParams;

  const range: RangeKey =
    params.range === "7" ||
    params.range === "month" ||
    params.range === "custom"
      ? (params.range as RangeKey)
      : "30";

  const today = getPhoenixToday();
  const { start, end } = getRangeBounds(range, today, params.start, params.end);

  const rangeStart = `${toDateInput(start)}T00:00:00-07:00`;
  const rangeEnd = `${toDateInput(end)}T23:59:59-07:00`;

  const selectedCategory: CategoryKey | null =
    params.category && params.category in CATEGORY_LABELS
      ? (params.category as CategoryKey)
      : null;

  // job_service_category already computes a service_category per job (the
  // same categorization the revenue dashboard's "Revenue by Service" and
  // forecast logic use), plus job_type — Jobber's own ONE_OFF/RECURRING
  // signal, which is what actually determines "is this recurring" here
  // rather than trusting the category keyword-match for that part.
  const { data: jobsData, error: jobsError } = await supabaseServer
    .from("job_service_category")
    .select("jobber_job_id, service_category, title")
    .ilike("job_type", "%recur%");

  const recurringJobs = (jobsData ?? []) as JobCategoryRow[];
  const recurringJobIds = recurringJobs.map((job) => job.jobber_job_id);

  const categoryByJobId = new Map<string, CategoryKey>(
    recurringJobs.map((job) => [
      job.jobber_job_id,
      categoryKeyFor(job.service_category),
    ])
  );

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

  const buckets: Record<CategoryKey, VisitRow[]> = {
    monthly: [],
    quarterly: [],
    bimonthly: [],
    semiannual: [],
    other: [],
  };

  for (const visit of visits) {
    const key = visit.jobber_job_id
      ? categoryByJobId.get(visit.jobber_job_id) ?? "other"
      : "other";

    buckets[key].push(visit);
  }

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

  function hrefFor(overrides: {
    range?: RangeKey;
    category?: CategoryKey | null;
  }): string {
    const next = new URLSearchParams();
    const nextRange = overrides.range ?? range;

    next.set("range", nextRange);

    if (nextRange === "custom") {
      next.set("start", toDateInput(start));
      next.set("end", toDateInput(end));
    }

    const nextCategory =
      overrides.category === undefined ? selectedCategory : overrides.category;

    if (nextCategory) {
      next.set("category", nextCategory);
    }

    return `/recurring-services?${next.toString()}`;
  }

  function rangePillClasses(active: boolean): string {
    return `rounded-xl px-4 py-2 text-sm font-bold transition ${
      active
        ? "bg-[#174734] text-white"
        : "border border-[#d8d3c6] bg-white text-[#174734] hover:bg-[#f7f6f1]"
    }`;
  }

  const categoryOrder: { key: CategoryKey; big: boolean }[] = [
    { key: "monthly", big: true },
    { key: "quarterly", big: true },
    { key: "bimonthly", big: false },
    { key: "semiannual", big: false },
    { key: "other", big: false },
  ];

  const activeVisits = selectedCategory ? buckets[selectedCategory] : [];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-4xl font-bold">Upcoming Recurring Services</h1>

          <p className="mt-2 max-w-2xl text-[#6b705c]">
            Who's getting recurring service (per Jobber's own job type) and
            what kind, without waiting on a revenue forecast.
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-2">
          <Link
            href={hrefFor({ range: "7", category: null })}
            className={rangePillClasses(range === "7")}
          >
            Next 7 Days
          </Link>
          <Link
            href={hrefFor({ range: "30", category: null })}
            className={rangePillClasses(range === "30")}
          >
            Next 30 Days
          </Link>
          <Link
            href={hrefFor({ range: "month", category: null })}
            className={rangePillClasses(range === "month")}
          >
            Next Month
          </Link>
          <Link
            href={hrefFor({ range: "custom", category: null })}
            className={rangePillClasses(range === "custom")}
          >
            Custom
          </Link>
        </section>

        {range === "custom" && (
          <form
            action="/recurring-services"
            method="GET"
            className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow"
          >
            <input type="hidden" name="range" value="custom" />

            <label className="text-sm">
              <span className="block font-semibold text-[#6b705c]">
                Start
              </span>
              <input
                type="date"
                name="start"
                defaultValue={toDateInput(start)}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm">
              <span className="block font-semibold text-[#6b705c]">End</span>
              <input
                type="date"
                name="end"
                defaultValue={toDateInput(end)}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
              />
            </label>

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Apply
            </button>
          </form>
        )}

        <p className="mt-4 text-sm text-[#6b705c]">
          {formatRangeLabel(start, end)} · {visits.length} visit
          {visits.length === 1 ? "" : "s"} · {uniqueCustomers} customer
          {uniqueCustomers === 1 ? "" : "s"}
        </p>

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
              No recurring-job visits scheduled in this window.
            </p>
            <p className="mt-2 text-sm text-[#9c9887]">
              If this looks low, it may mean Jobber jobs aren't consistently
              marked as "Recurring" — worth spot-checking a known recurring
              customer's job in Jobber.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
                {categoryOrder
                  .filter((entry) => entry.big)
                  .map((entry) => {
                    const bucketVisits = buckets[entry.key];
                    const active = selectedCategory === entry.key;

                    return (
                      <Link
                        key={entry.key}
                        href={hrefFor({
                          category: active ? null : entry.key,
                        })}
                        className={`rounded-2xl p-6 shadow transition ${
                          active
                            ? "bg-[#174734] text-white"
                            : "bg-white text-[#174734] hover:bg-[#f7f6f1]"
                        }`}
                      >
                        <p
                          className={`text-sm font-semibold uppercase tracking-wide ${
                            active ? "text-green-100" : "text-[#9c7a20]"
                          }`}
                        >
                          {CATEGORY_LABELS[entry.key]}
                        </p>
                        <p className="mt-3 text-4xl font-bold">
                          {bucketVisits.length}
                        </p>
                        <p
                          className={`mt-1 text-sm ${
                            active ? "text-green-100" : "text-[#6b705c]"
                          }`}
                        >
                          visit{bucketVisits.length === 1 ? "" : "s"} ·{" "}
                          {
                            new Set(
                              bucketVisits.map((v) => v.jobber_client_id)
                            ).size
                          }{" "}
                          customers
                        </p>
                      </Link>
                    );
                  })}
              </div>

              <div className="grid gap-4">
                {categoryOrder
                  .filter((entry) => !entry.big)
                  .map((entry) => {
                    const bucketVisits = buckets[entry.key];
                    const active = selectedCategory === entry.key;

                    return (
                      <Link
                        key={entry.key}
                        href={hrefFor({
                          category: active ? null : entry.key,
                        })}
                        className={`flex items-center justify-between rounded-2xl p-4 shadow transition ${
                          active
                            ? "bg-[#174734] text-white"
                            : "bg-white text-[#174734] hover:bg-[#f7f6f1]"
                        }`}
                      >
                        <div>
                          <p
                            className={`text-xs font-semibold uppercase tracking-wide ${
                              active ? "text-green-100" : "text-[#9c7a20]"
                            }`}
                          >
                            {CATEGORY_LABELS[entry.key]}
                          </p>
                          <p
                            className={`mt-1 text-xs ${
                              active ? "text-green-100" : "text-[#6b705c]"
                            }`}
                          >
                            {
                              new Set(
                                bucketVisits.map((v) => v.jobber_client_id)
                              ).size
                            }{" "}
                            customers
                          </p>
                        </div>

                        <p className="text-2xl font-bold">
                          {bucketVisits.length}
                        </p>
                      </Link>
                    );
                  })}
              </div>
            </section>

            <section className="mt-6">
              {!selectedCategory ? (
                <p className="rounded-2xl bg-white p-5 text-center text-sm text-[#6b705c] shadow">
                  Click a category above to see who's scheduled.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-bold">
                      {CATEGORY_LABELS[selectedCategory]} · {activeVisits.length}{" "}
                      visit{activeVisits.length === 1 ? "" : "s"}
                    </h2>

                    <Link
                      href={hrefFor({ category: null })}
                      className="text-sm font-semibold text-[#9c7a20] hover:underline"
                    >
                      Clear ✕
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {activeVisits.map((visit) => {
                      const contact = visit.jobber_client_id
                        ? contactMap.get(visit.jobber_client_id)
                        : null;

                      const service =
                        visit.title ||
                        (visit.jobber_job_id
                          ? jobTitleById.get(visit.jobber_job_id)
                          : null) ||
                        "Recurring Service";

                      return (
                        <div
                          key={visit.jobber_visit_id}
                          className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-[#9c7a20]">
                              {visit.start_at
                                ? `${formatDateHeading(
                                    visit.start_at
                                  )} · ${formatTime(visit.start_at)}`
                                : "Unscheduled"}
                            </span>
                            <span className="mx-2 text-[#d9d4c6]">·</span>
                            <span className="font-semibold">
                              {visit.customer_name || "Unnamed Customer"}
                            </span>
                            <span className="mx-2 text-[#d9d4c6]">·</span>
                            <span className="text-sm text-[#6b705c]">
                              {service}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            {contact?.phone && (
                              <a
                                href={`tel:${contact.phone.replace(
                                  /[^\d+]/g,
                                  ""
                                )}`}
                                className="text-sm font-semibold text-[#9c7a20] hover:underline"
                              >
                                {contact.phone}
                              </a>
                            )}

                            {visit.jobber_client_id && (
                              <Link
                                href={`/customers/${encodeURIComponent(
                                  visit.jobber_client_id
                                )}`}
                                className="text-sm font-semibold text-[#9c7a20] hover:underline"
                              >
                                View →
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
