export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

type Timeframe =
  | "last-7-days"
  | "last-month"
  | "this-month"
  | "last-90-days"
  | "ytd"
  | "custom";

type Customer = {
  jobber_client_id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  postal_code: string | null;
  recurring_service: boolean | null;
  status: string | null;
};

type Invoice = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  issue_date: string | null;
  invoice_total: number | string;
};

type CustomerSummary = {
  customer: Customer;
  invoices: Invoice[];
  lifetimeRevenue: number;
  invoiceCount: number;
  averageTicket: number;
  firstInvoiceDate: string | null;
  latestInvoiceDate: string | null;
  averageIntervalDays: number | null;
  daysSinceLastInvoice: number | null;
};

type MarketSummary = {
  market: string;
  customers: number;
  repeatCustomers: number;
  revenue: number;
  averageCustomerValue: number;
  repeatRate: number;
};

type RecurringServiceRow = {
  jobber_client_id: string | null;
  is_recurring_service: boolean | null;
};

type IntelligenceExclusion = {
  jobber_client_id: string;
  exclusion_type: string;
};

type ReactivationBucket = {
  title: string;
  subtitle: string;
  customers: CustomerSummary[];
};

type PageProps = {
  searchParams: Promise<{
    timeframe?: string;
    start?: string;
    end?: string;
    market?: string;
  }>;
};

const PHOENIX_TIME_ZONE = "America/Phoenix";

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function isTimeframe(value: string | undefined): value is Timeframe {
  return [
    "last-7-days",
    "last-month",
    "this-month",
    "last-90-days",
    "ytd",
    "custom",
  ].includes(value ?? "");
}

function getDateRange(
  timeframe: Timeframe,
  customStart?: string,
  customEnd?: string,
): { startDate: string; endDate: string; label: string } {
  const today = getPhoenixToday();
  let start = new Date(today);
  let end = new Date(today);

  if (timeframe === "last-7-days") {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (timeframe === "last-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
    );
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "this-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  } else if (timeframe === "last-90-days") {
    start.setUTCDate(start.getUTCDate() - 89);
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "custom") {
    const parsedStart = customStart
      ? new Date(`${customStart}T00:00:00Z`)
      : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T00:00:00Z`) : null;

    if (parsedStart && !Number.isNaN(parsedStart.getTime())) start = parsedStart;
    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) end = parsedEnd;

    if (start > end) {
      [start, end] = [end, start];
    }
  }

  const startDate = formatDateInput(start);
  const endDate = formatDateInput(end);

  return {
    startDate,
    endDate,
    label: `${formatDate(startDate)} – ${formatDate(endDate)}`,
  };
}

function makeHref(
  timeframe: Timeframe,
  market: "city" | "zip",
  changes: {
    timeframe?: Timeframe;
    market?: "city" | "zip";
  },
  start?: string,
  end?: string,
): string {
  const params = new URLSearchParams();

  params.set("timeframe", changes.timeframe ?? timeframe);
  params.set("market", changes.market ?? market);

  if ((changes.timeframe ?? timeframe) === "custom") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }

  return `/customers/intelligence?${params.toString()}`;
}

async function fetchCustomers(): Promise<Customer[]> {
  const rows: Customer[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select(
        "jobber_client_id, full_name, company_name, city, postal_code, recurring_service, status",
      )
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as Customer[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchRecurringServiceRows(): Promise<RecurringServiceRow[]> {
  const rows: RecurringServiceRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("job_service_category")
      .select("jobber_client_id, is_recurring_service")
      .eq("is_recurring_service", true)
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as RecurringServiceRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchIntelligenceExclusions(): Promise<IntelligenceExclusion[]> {
  const { data, error } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .select("jobber_client_id, exclusion_type")
    .eq("exclusion_type", "reactivation");

  if (error) throw error;

  return (data ?? []) as IntelligenceExclusion[];
}

async function excludeFromReactivation(formData: FormData) {
  "use server";

  const jobberClientId = String(
    formData.get("jobber_client_id") ?? "",
  ).trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const allowedReasons = new Set([
    "moved",
    "canceled_permanently",
    "no_longer_has_turf",
    "do_not_contact",
    "bad_fit",
    "other",
  ]);

  if (!jobberClientId || !allowedReasons.has(reason)) {
    return;
  }

  const { error } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .upsert(
      {
        jobber_client_id: jobberClientId,
        exclusion_type: "reactivation",
        reason,
        excluded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "jobber_client_id,exclusion_type",
        ignoreDuplicates: false,
      },
    );

  if (error) {
    throw new Error(`Could not remove customer from reactivation: ${error.message}`);
  }

  revalidatePath("/customers/intelligence");
}

async function fetchInvoices(): Promise<Invoice[]> {
  const rows: Invoice[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select(
        "jobber_invoice_id, jobber_client_id, issue_date, invoice_total",
      )
      .not("jobber_client_id", "is", null)
      .order("issue_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as Invoice[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  return Math.max(
    0,
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000),
  );
}

function buildCustomerSummaries(
  customers: Customer[],
  invoices: Invoice[],
): CustomerSummary[] {
  const invoiceMap = new Map<string, Invoice[]>();

  for (const invoice of invoices) {
    if (!invoice.jobber_client_id || !invoice.issue_date) continue;

    const existing = invoiceMap.get(invoice.jobber_client_id) ?? [];
    existing.push(invoice);
    invoiceMap.set(invoice.jobber_client_id, existing);
  }

  const today = formatDateInput(getPhoenixToday());

  return customers.map((customer) => {
    const customerInvoices = [...(invoiceMap.get(customer.jobber_client_id) ?? [])]
      .filter((invoice) => invoice.issue_date)
      .sort((a, b) =>
        String(a.issue_date).localeCompare(String(b.issue_date)),
      );

    const lifetimeRevenue = customerInvoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.invoice_total),
      0,
    );

    const datedInvoices = customerInvoices.filter(
      (invoice): invoice is Invoice & { issue_date: string } =>
        Boolean(invoice.issue_date),
    );

    const intervals: number[] = [];

    for (let index = 1; index < datedInvoices.length; index += 1) {
      intervals.push(
        daysBetween(
          datedInvoices[index - 1].issue_date,
          datedInvoices[index].issue_date,
        ),
      );
    }

    const averageIntervalDays =
      intervals.length > 0
        ? intervals.reduce((sum, interval) => sum + interval, 0) /
          intervals.length
        : null;

    const firstInvoiceDate = datedInvoices[0]?.issue_date ?? null;
    const latestInvoiceDate =
      datedInvoices[datedInvoices.length - 1]?.issue_date ?? null;

    return {
      customer,
      invoices: customerInvoices,
      lifetimeRevenue,
      invoiceCount: customerInvoices.length,
      averageTicket:
        customerInvoices.length > 0
          ? lifetimeRevenue / customerInvoices.length
          : 0,
      firstInvoiceDate,
      latestInvoiceDate,
      averageIntervalDays,
      daysSinceLastInvoice: latestInvoiceDate
        ? daysBetween(latestInvoiceDate, today)
        : null,
    };
  });
}

export default async function CustomerIntelligencePage({
  searchParams,
}: PageProps) {
  try {
    const params = await searchParams;

    const timeframe: Timeframe = isTimeframe(params.timeframe)
      ? params.timeframe
      : "last-month";

    const marketMode: "city" | "zip" =
      params.market === "city" ? "city" : "zip";

    const { startDate, endDate, label } = getDateRange(
      timeframe,
      params.start,
      params.end,
    );

    const [
      customers,
      invoices,
      recurringServiceRows,
      intelligenceExclusions,
    ] = await Promise.all([
      fetchCustomers(),
      fetchInvoices(),
      fetchRecurringServiceRows(),
      fetchIntelligenceExclusions(),
    ]);

    const summaries = buildCustomerSummaries(customers, invoices);

    const periodInvoices = invoices.filter(
      (invoice) =>
        invoice.issue_date &&
        invoice.issue_date >= startDate &&
        invoice.issue_date <= endDate,
    );

    const activeCustomerIds = new Set(
      periodInvoices
        .map((invoice) => invoice.jobber_client_id)
        .filter((value): value is string => Boolean(value)),
    );

    const customersWithInvoices = summaries.filter(
      (summary) => summary.invoiceCount > 0,
    );

    const repeatCustomers = customersWithInvoices.filter(
      (summary) => summary.invoiceCount >= 2,
    );

    const repeatRate =
      customersWithInvoices.length > 0
        ? repeatCustomers.length / customersWithInvoices.length
        : 0;

    const averageCustomerValue =
      customersWithInvoices.length > 0
        ? customersWithInvoices.reduce(
            (sum, summary) => sum + summary.lifetimeRevenue,
            0,
          ) / customersWithInvoices.length
        : 0;

    const recurringClientIds = new Set(
      recurringServiceRows
        .filter((row) => row.is_recurring_service && row.jobber_client_id)
        .map((row) => row.jobber_client_id as string),
    );

    const reactivationExcludedClientIds = new Set(
      intelligenceExclusions.map((row) => row.jobber_client_id),
    );

    const recurringOpportunities = summaries
      .filter(
        (summary) =>
          summary.invoiceCount >= 3 &&
          !recurringClientIds.has(summary.customer.jobber_client_id) &&
          summary.latestInvoiceDate,
      )
      .sort((a, b) => {
        if (b.invoiceCount !== a.invoiceCount) {
          return b.invoiceCount - a.invoiceCount;
        }

        return b.lifetimeRevenue - a.lifetimeRevenue;
      })
      .slice(0, 15);

    const reactivationCandidates = summaries
      .filter(
        (summary) =>
          summary.invoiceCount > 0 &&
          summary.daysSinceLastInvoice !== null &&
          summary.daysSinceLastInvoice >= 90 &&
          summary.daysSinceLastInvoice < 548 &&
          !recurringClientIds.has(summary.customer.jobber_client_id) &&
          !reactivationExcludedClientIds.has(
            summary.customer.jobber_client_id,
          ),
      )
      .sort(
        (a, b) =>
          (b.daysSinceLastInvoice ?? 0) - (a.daysSinceLastInvoice ?? 0),
      );

    const reactivationBuckets: ReactivationBucket[] = [
      {
        title: "3–6 Months",
        subtitle: "90–179 days since last invoice",
        customers: reactivationCandidates.filter(
          (summary) =>
            (summary.daysSinceLastInvoice ?? 0) >= 90 &&
            (summary.daysSinceLastInvoice ?? 0) < 180,
        ),
      },
      {
        title: "6–12 Months",
        subtitle: "180–364 days since last invoice",
        customers: reactivationCandidates.filter(
          (summary) =>
            (summary.daysSinceLastInvoice ?? 0) >= 180 &&
            (summary.daysSinceLastInvoice ?? 0) < 365,
        ),
      },
      {
        title: "12–18 Months",
        subtitle: "365–547 days since last invoice",
        customers: reactivationCandidates.filter(
          (summary) =>
            (summary.daysSinceLastInvoice ?? 0) >= 365 &&
            (summary.daysSinceLastInvoice ?? 0) < 548,
        ),
      },
    ];

    const topCustomers = [...customersWithInvoices]
      .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
      .slice(0, 10);

    const customerMap = new Map(
      customers.map((customer) => [
        customer.jobber_client_id,
        customer,
      ]),
    );

    const summaryMap = new Map(
      summaries.map((summary) => [
        summary.customer.jobber_client_id,
        summary,
      ]),
    );

    const marketMap = new Map<
      string,
      {
        customerIds: Set<string>;
        repeatCustomerIds: Set<string>;
        revenue: number;
      }
    >();

    for (const invoice of periodInvoices) {
      if (!invoice.jobber_client_id) continue;

      const customer = customerMap.get(invoice.jobber_client_id);
      const rawMarket =
        marketMode === "city" ? customer?.city : customer?.postal_code;
      const market = rawMarket?.trim();

      if (!market) continue;

      const key = marketMode === "city" ? market.toUpperCase() : market;

      const existing = marketMap.get(key) ?? {
        customerIds: new Set<string>(),
        repeatCustomerIds: new Set<string>(),
        revenue: 0,
      };

      existing.customerIds.add(invoice.jobber_client_id);
      existing.revenue += toNumber(invoice.invoice_total);

      const summary = summaryMap.get(invoice.jobber_client_id);

      if (summary && summary.invoiceCount >= 2) {
        existing.repeatCustomerIds.add(invoice.jobber_client_id);
      }

      marketMap.set(key, existing);
    }

    const marketSummaries: MarketSummary[] = Array.from(
      marketMap.entries(),
    )
      .map(([key, value]) => ({
        market:
          marketMode === "city"
            ? key.replace(/\b\w/g, (character) => character.toUpperCase())
            : key,
        customers: value.customerIds.size,
        repeatCustomers: value.repeatCustomerIds.size,
        revenue: value.revenue,
        averageCustomerValue:
          value.customerIds.size > 0
            ? value.revenue / value.customerIds.size
            : 0,
        repeatRate:
          value.customerIds.size > 0
            ? value.repeatCustomerIds.size / value.customerIds.size
            : 0,
      }))
      .sort((a, b) => b.customers - a.customers)
      .slice(0, 10);

    const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
      { value: "last-7-days", label: "Last 7 Days" },
      { value: "last-month", label: "Last Month" },
      { value: "this-month", label: "This Month" },
      { value: "last-90-days", label: "Last 90 Days" },
      { value: "ytd", label: "YTD" },
      { value: "custom", label: "Custom" },
    ];

    const cards = [
      {
        title: "Active Customers",
        value: formatNumber(activeCustomerIds.size),
        subtitle: `Customers invoiced · ${label}`,
        icon: "👥",
      },
      {
        title: "Repeat Customer Rate",
        value: formatPercent(repeatRate),
        subtitle: `${formatNumber(repeatCustomers.length)} repeat customers`,
        icon: "🔁",
      },
      {
        title: "Average Customer Value",
        value: formatCurrency(averageCustomerValue),
        subtitle: "Lifetime invoiced value",
        icon: "💎",
      },
      {
        title: "Reactivation Opportunities",
        value: formatNumber(reactivationCandidates.length),
        subtitle: "3–18 months since last activity",
        icon: "📈",
      },
    ];

    return (
      <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
                Valley Turf Revival OS
              </p>

              <h1 className="mt-2 text-4xl font-bold">
                Customer Intelligence
              </h1>

              <p className="mt-2 max-w-2xl text-[#6b705c]">
                Identify repeat behavior, recurring opportunities, at-risk
                customers, and your strongest customer markets.
              </p>
            </div>

            <Link
              href="/customers"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Customer Directory
            </Link>
          </header>

          <section
            id="customer-intelligence-filters"
            className="mt-8 scroll-mt-6 rounded-3xl bg-white p-6 shadow"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Customer Snapshot
                </p>

                <h2 className="mt-1 text-2xl font-bold">{label}</h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {timeframeOptions.map((option) => (
                  <Link
                    key={option.value}
                    href={makeHref(
                      timeframe,
                      marketMode,
                      { timeframe: option.value },
                      params.start,
                      params.end,
                    )}
                    scroll={false}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                      timeframe === option.value
                        ? "bg-[#d4af37] text-[#174734]"
                        : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                    }`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>

            {timeframe === "custom" ? (
              <form
                method="GET"
                action="/customers/intelligence#customer-intelligence-filters"
                className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f7f6f1] p-4"
              >
                <input type="hidden" name="timeframe" value="custom" />
                <input type="hidden" name="market" value={marketMode} />

                <label className="text-sm font-semibold text-[#6b705c]">
                  Start date
                  <input
                    type="date"
                    name="start"
                    defaultValue={startDate}
                    className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                  />
                </label>

                <label className="text-sm font-semibold text-[#6b705c]">
                  End date
                  <input
                    type="date"
                    name="end"
                    defaultValue={endDate}
                    className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white"
                >
                  Apply Dates
                </button>
              </form>
            ) : null}
          </section>

          <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article
                key={card.title}
                className="rounded-3xl bg-white p-6 shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                      {card.title}
                    </p>

                    <p className="mt-3 text-4xl font-bold">{card.value}</p>

                    <p className="mt-2 text-sm text-[#6b705c]">
                      {card.subtitle}
                    </p>
                  </div>

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f7f6f1] text-3xl">
                    {card.icon}
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">
                Recurring Opportunities
              </h2>

              <p className="mt-1 text-[#6b705c]">
                Customers with 3+ invoices and no recurring-service history
                in synced Jobber service data.
              </p>

              <div className="mt-6 space-y-3">
                {recurringOpportunities.length === 0 ? (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No recurring opportunities found.
                  </p>
                ) : (
                  recurringOpportunities.map((summary) => (
                    <Link
                      key={summary.customer.jobber_client_id}
                      href={`/customers/${encodeURIComponent(
                        summary.customer.jobber_client_id,
                      )}`}
                      className="block rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold">
                            {summary.customer.full_name ||
                              summary.customer.company_name ||
                              "Unnamed Customer"}
                          </p>

                          <p className="mt-1 text-sm text-[#6b705c]">
                            {summary.customer.city || "Unknown city"}
                            {summary.customer.postal_code
                              ? ` · ${summary.customer.postal_code}`
                              : ""}
                          </p>
                        </div>

                        <p className="text-xl font-bold text-[#9c7a20]">
                          {formatCurrency(summary.lifetimeRevenue)}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#6b705c]">
                        <span>{formatNumber(summary.invoiceCount)} invoices</span>
                        <span>
                          {formatCurrency(summary.averageTicket)} avg ticket
                        </span>
                        <span>
                          Last invoice {formatDate(summary.latestInvoiceDate)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Reactivation Pipeline</h2>

              <p className="mt-1 text-[#6b705c]">
                Non-recurring customers grouped by time since their last invoice.
                Customers at 18+ months are automatically left off the active list.
              </p>

              <div className="mt-6 space-y-5">
                {reactivationBuckets.map((bucket) => (
                  <div
                    key={bucket.title}
                    className="rounded-2xl border border-[#e7e2d5] p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold">{bucket.title}</h3>
                        <p className="mt-1 text-sm text-[#6b705c]">
                          {bucket.subtitle}
                        </p>
                      </div>

                      <span className="rounded-full bg-[#f7f6f1] px-3 py-1 text-sm font-bold">
                        {formatNumber(bucket.customers.length)}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {bucket.customers.length === 0 ? (
                        <p className="rounded-xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
                          No customers in this reactivation group.
                        </p>
                      ) : (
                        bucket.customers.slice(0, 15).map((summary) => (
                          <div
                            key={summary.customer.jobber_client_id}
                            className="rounded-xl bg-[#f7f6f1] p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <Link
                                  href={`/customers/${encodeURIComponent(
                                    summary.customer.jobber_client_id,
                                  )}`}
                                  className="font-bold hover:text-[#9c7a20]"
                                >
                                  {summary.customer.full_name ||
                                    summary.customer.company_name ||
                                    "Unnamed Customer"}
                                </Link>

                                <p className="mt-1 text-sm text-[#6b705c]">
                                  {formatNumber(
                                    summary.daysSinceLastInvoice ?? 0,
                                  )}{" "}
                                  days since last invoice ·{" "}
                                  {formatNumber(summary.invoiceCount)} invoices ·{" "}
                                  {formatCurrency(summary.lifetimeRevenue)} lifetime
                                </p>
                              </div>

                              <form
                                action={excludeFromReactivation}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input
                                  type="hidden"
                                  name="jobber_client_id"
                                  value={summary.customer.jobber_client_id}
                                />

                                <select
                                  name="reason"
                                  defaultValue="moved"
                                  className="rounded-lg border border-[#d8d3c6] bg-white px-3 py-2 text-xs font-semibold text-[#174734]"
                                >
                                  <option value="moved">Moved</option>
                                  <option value="canceled_permanently">
                                    Canceled Permanently
                                  </option>
                                  <option value="no_longer_has_turf">
                                    No Longer Has Turf
                                  </option>
                                  <option value="do_not_contact">
                                    Do Not Contact
                                  </option>
                                  <option value="bad_fit">Bad Fit</option>
                                  <option value="other">Other</option>
                                </select>

                                <button
                                  type="submit"
                                  className="rounded-lg border border-[#174734] px-3 py-2 text-xs font-bold transition hover:bg-[#174734] hover:text-white"
                                >
                                  Remove From List
                                </button>
                              </form>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Top Customers</h2>

              <p className="mt-1 text-[#6b705c]">
                Ranked by lifetime invoiced revenue.
              </p>

              <div className="mt-6 space-y-3">
                {topCustomers.map((summary, index) => (
                  <Link
                    key={summary.customer.jobber_client_id}
                    href={`/customers/${encodeURIComponent(
                      summary.customer.jobber_client_id,
                    )}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f7f6f1] font-bold">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-bold">
                          {summary.customer.full_name ||
                            summary.customer.company_name ||
                            "Unnamed Customer"}
                        </p>

                        <p className="mt-1 text-sm text-[#6b705c]">
                          {formatNumber(summary.invoiceCount)} invoices ·{" "}
                          {formatCurrency(summary.averageTicket)} avg ticket
                        </p>
                      </div>
                    </div>

                    <p className="font-bold">
                      {formatCurrency(summary.lifetimeRevenue)}
                    </p>
                  </Link>
                ))}
              </div>
            </article>

            <article className="rounded-3xl bg-white p-8 shadow">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    Customer Growth by Market
                  </h2>

                  <p className="mt-1 text-[#6b705c]">
                    Customer activity during {label}.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={makeHref(
                      timeframe,
                      marketMode,
                      { market: "zip" },
                      params.start,
                      params.end,
                    )}
                    scroll={false}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      marketMode === "zip"
                        ? "bg-[#174734] text-white"
                        : "bg-[#f7f6f1] text-[#6b705c]"
                    }`}
                  >
                    ZIP Codes
                  </Link>

                  <Link
                    href={makeHref(
                      timeframe,
                      marketMode,
                      { market: "city" },
                      params.start,
                      params.end,
                    )}
                    scroll={false}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      marketMode === "city"
                        ? "bg-[#174734] text-white"
                        : "bg-[#f7f6f1] text-[#6b705c]"
                    }`}
                  >
                    Cities
                  </Link>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {marketSummaries.length === 0 ? (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No customer market data found for this timeframe.
                  </p>
                ) : (
                  marketSummaries.map((market, index) => (
                    <div
                      key={market.market}
                      className="rounded-2xl border border-[#e7e2d5] p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f7f6f1] font-bold">
                            {index + 1}
                          </div>

                          <div>
                            <p className="font-bold">{market.market}</p>
                            <p className="mt-1 text-sm text-[#6b705c]">
                              {formatNumber(market.customers)} active customers
                            </p>
                          </div>
                        </div>

                        <p className="font-bold">
                          {formatCurrency(market.revenue)}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-[#f7f6f1] p-3">
                          <p className="text-xs text-[#6b705c]">Repeat Rate</p>
                          <p className="mt-1 font-bold">
                            {formatPercent(market.repeatRate)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-[#f7f6f1] p-3">
                          <p className="text-xs text-[#6b705c]">
                            Avg Customer Value
                          </p>
                          <p className="mt-1 font-bold">
                            {formatCurrency(market.averageCustomerValue)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>
        </div>
      </main>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Customer intelligence could not be loaded.";

    return (
      <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl bg-white p-8 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Customer Intelligence could not be loaded
            </h1>

            <p className="mt-4 text-[#6b705c]">{message}</p>

            <Link
              href="/customers"
              className="mt-6 inline-block rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
            >
              Customer Directory
            </Link>
          </section>
        </div>
      </main>
    );
  }
}