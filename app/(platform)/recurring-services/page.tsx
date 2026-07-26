export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency } from "@/lib/format";

type RangeKey = "7" | "30" | "month" | "custom";
type CategoryKey = "monthly" | "quarterly" | "bimonthly" | "semiannual" | "other";

type RecurringServicesPageProps = {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
  }>;
};

type JobCategoryRow = {
  jobber_job_id: string;
  service_category: string | null;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  customer_name: string | null;
  start_at: string | null;
};

type CustomerEntry = {
  jobber_client_id: string;
  customer_name: string;
  visitCount: number;
  estimatedAmount: number | null;
};

type InvoicePriceRow = {
  service_category: string | null;
  total: number | string | null;
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

function uniqueCustomersFor(
  visits: VisitRow[],
  realCategoryByJobId: Map<string, string | null>,
  avgPriceByCategory: Map<string, number>
): CustomerEntry[] {
  const byId = new Map<
    string,
    { customer_name: string; visitCount: number; amountTotal: number; hasAnyKnownPrice: boolean }
  >();

  for (const visit of visits) {
    if (!visit.jobber_client_id) {
      continue;
    }

    const realCategory = visit.jobber_job_id
      ? realCategoryByJobId.get(visit.jobber_job_id) ?? null
      : null;
    const price = realCategory ? avgPriceByCategory.get(realCategory) : undefined;

    const existing = byId.get(visit.jobber_client_id);

    if (existing) {
      existing.visitCount += 1;
      if (typeof price === "number") {
        existing.amountTotal += price;
        existing.hasAnyKnownPrice = true;
      }
    } else {
      byId.set(visit.jobber_client_id, {
        customer_name: visit.customer_name || "Unnamed Customer",
        visitCount: 1,
        amountTotal: typeof price === "number" ? price : 0,
        hasAnyKnownPrice: typeof price === "number",
      });
    }
  }

  return Array.from(byId.entries())
    .map(([jobber_client_id, entry]) => ({
      jobber_client_id,
      customer_name: entry.customer_name,
      visitCount: entry.visitCount,
      estimatedAmount: entry.hasAnyKnownPrice ? entry.amountTotal : null,
    }))
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
}

function CategoryBox({
  categoryKey,
  visits,
  size,
  realCategoryByJobId,
  avgPriceByCategory,
}: {
  categoryKey: CategoryKey;
  visits: VisitRow[];
  size: "large" | "small";
  realCategoryByJobId: Map<string, string | null>;
  avgPriceByCategory: Map<string, number>;
}) {
  const customers = uniqueCustomersFor(
    visits,
    realCategoryByJobId,
    avgPriceByCategory
  );

  const boxTotal = customers.reduce(
    (sum, customer) => sum + (customer.estimatedAmount ?? 0),
    0
  );
  const hasAnyKnownPrice = customers.some(
    (customer) => customer.estimatedAmount !== null
  );

  return (
    <div
      className={`rounded-2xl bg-white shadow ${
        size === "large" ? "p-6" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#9c7a20]">
            {CATEGORY_LABELS[categoryKey]}
          </p>

          <p
            className={`mt-2 font-bold ${
              size === "large" ? "text-3xl" : "text-xl"
            }`}
          >
            {visits.length} visit{visits.length === 1 ? "" : "s"}
          </p>

          <p className="text-sm text-[#6b705c]">
            {customers.length} customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>

        {hasAnyKnownPrice && (
          <p
            className={`shrink-0 text-right font-bold text-[#174734] ${
              size === "large" ? "text-2xl" : "text-lg"
            }`}
          >
            ~{formatCurrency(boxTotal)}
          </p>
        )}
      </div>

      {customers.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-[#eee9dc] pt-3">
          {customers.map((customer) => (
            <Link
              key={customer.jobber_client_id}
              href={`/customers/${encodeURIComponent(
                customer.jobber_client_id
              )}`}
              className="flex items-baseline justify-between gap-3 rounded-lg px-1 py-1 text-sm hover:bg-[#f7f6f1]"
            >
              <span className="truncate font-semibold text-[#9c7a20] hover:underline">
                {customer.customer_name}
                {customer.visitCount > 1 ? ` ×${customer.visitCount}` : ""}
              </span>

              {customer.estimatedAmount !== null && (
                <span className="shrink-0 text-[#6b705c]">
                  ~{formatCurrency(customer.estimatedAmount)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {hasAnyKnownPrice && (
        <p className="mt-3 text-xs text-[#9c9887]">
          Amounts are estimated from this category's average historical
          price, not each customer's exact contracted rate.
        </p>
      )}
    </div>
  );
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

  // job_service_category already computes a service_category per job (the
  // same categorization the revenue dashboard's "Revenue by Service" and
  // forecast logic use), plus job_type — Jobber's own ONE_OFF/RECURRING
  // signal, which is what actually determines "is this recurring" here
  // rather than trusting the category keyword-match for that part.
  const { data: jobsData, error: jobsError } = await supabaseServer
    .from("job_service_category")
    .select("jobber_job_id, service_category")
    .ilike("job_type", "%recur%");

  const recurringJobs = (jobsData ?? []) as JobCategoryRow[];
  const recurringJobIds = recurringJobs.map((job) => job.jobber_job_id);

  const categoryByJobId = new Map<string, CategoryKey>(
    recurringJobs.map((job) => [
      job.jobber_job_id,
      categoryKeyFor(job.service_category),
    ])
  );

  const realCategoryByJobId = new Map<string, string | null>(
    recurringJobs.map((job) => [job.jobber_job_id, job.service_category])
  );

  const { data: visitsData, error: visitsError } =
    recurringJobIds.length > 0
      ? await supabaseServer
          .from("jobber_visits")
          .select(
            "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, start_at"
          )
          .in("jobber_job_id", recurringJobIds)
          .gte("start_at", rangeStart)
          .lte("start_at", rangeEnd)
          .order("start_at", { ascending: true })
      : { data: [] as VisitRow[], error: null };

  const visits = (visitsData ?? []) as VisitRow[];

  // Visits aren't invoiced yet at scheduling time, so there's no real
  // per-visit dollar amount to pull. Instead, estimate each customer's
  // upcoming visit(s) using that job's actual service category's average
  // historical invoice total — clearly labeled as an estimate in the UI,
  // not presented as an exact contracted rate.
  const categoriesNeeded = Array.from(
    new Set(
      visits
        .map((visit) =>
          visit.jobber_job_id
            ? realCategoryByJobId.get(visit.jobber_job_id)
            : null
        )
        .filter((category): category is string => Boolean(category))
    )
  );

  const { data: priceData } =
    categoriesNeeded.length > 0
      ? await supabaseServer
          .from("invoice_service_category")
          .select("service_category, total")
          .in("service_category", categoriesNeeded)
      : { data: [] as InvoicePriceRow[] };

  const priceRows = (priceData ?? []) as InvoicePriceRow[];

  const priceSumsByCategory = new Map<string, { sum: number; count: number }>();

  for (const row of priceRows) {
    if (!row.service_category) {
      continue;
    }

    const total = Number(row.total ?? 0);

    if (!Number.isFinite(total)) {
      continue;
    }

    const existing = priceSumsByCategory.get(row.service_category);

    if (existing) {
      existing.sum += total;
      existing.count += 1;
    } else {
      priceSumsByCategory.set(row.service_category, { sum: total, count: 1 });
    }
  }

  const avgPriceByCategory = new Map<string, number>(
    Array.from(priceSumsByCategory.entries()).map(([category, { sum, count }]) => [
      category,
      count > 0 ? sum / count : 0,
    ])
  );

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

  const uniqueCustomers = new Set(
    visits.map((visit) => visit.jobber_client_id).filter(Boolean)
  ).size;

  const error = jobsError || visitsError;

  function hrefFor(nextRange: RangeKey): string {
    const next = new URLSearchParams();
    next.set("range", nextRange);

    if (nextRange === "custom") {
      next.set("start", toDateInput(start));
      next.set("end", toDateInput(end));
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
          <Link href={hrefFor("7")} className={rangePillClasses(range === "7")}>
            Next 7 Days
          </Link>
          <Link href={hrefFor("30")} className={rangePillClasses(range === "30")}>
            Next 30 Days
          </Link>
          <Link
            href={hrefFor("month")}
            className={rangePillClasses(range === "month")}
          >
            Next Month
          </Link>
          <Link
            href={hrefFor("custom")}
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
          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
              <CategoryBox
                categoryKey="monthly"
                visits={buckets.monthly}
                size="large"
                realCategoryByJobId={realCategoryByJobId}
                avgPriceByCategory={avgPriceByCategory}
              />
              <CategoryBox
                categoryKey="quarterly"
                visits={buckets.quarterly}
                size="large"
                realCategoryByJobId={realCategoryByJobId}
                avgPriceByCategory={avgPriceByCategory}
              />
            </div>

            <div className="grid gap-4">
              <CategoryBox
                categoryKey="bimonthly"
                visits={buckets.bimonthly}
                size="small"
                realCategoryByJobId={realCategoryByJobId}
                avgPriceByCategory={avgPriceByCategory}
              />
              <CategoryBox
                categoryKey="semiannual"
                visits={buckets.semiannual}
                size="small"
                realCategoryByJobId={realCategoryByJobId}
                avgPriceByCategory={avgPriceByCategory}
              />
              <CategoryBox
                categoryKey="other"
                visits={buckets.other}
                size="small"
                realCategoryByJobId={realCategoryByJobId}
                avgPriceByCategory={avgPriceByCategory}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
