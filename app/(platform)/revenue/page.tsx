export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type MarketInvoice = {
  jobber_client_id: string | null;
  issue_date: string | null;
  invoice_total: number | string;
  outstanding_balance: number | string;
};

type DashboardPayment = {
  amount: number | string;
  payment_date: string | null;
};

type MarketCustomer = {
  jobber_client_id: string;
  city: string | null;
  postal_code: string | null;
};

type Timeframe =
  | "last-7-days"
  | "last-month"
  | "this-month"
  | "last-90-days"
  | "ytd"
  | "custom";

type MarketMode = "zip" | "city";
type RankMetric =
  | "revenue"
  | "invoices"
  | "average-ticket"
  | "customers"
  | "revenue-per-customer";

type MarketSummary = {
  market: string;
  revenue: number;
  invoiceCount: number;
  customerIds: Set<string>;
  averageTicket: number;
  revenuePerCustomer: number;
};

type RevenuePageProps = {
  searchParams: Promise<{
    timeframe?: string;
    market?: string;
    rank?: string;
    start?: string;
    end?: string;
  }>;
};


type CustomerFinancial = {
  jobber_client_id: string;
  customer_name: string | null;
  invoice_count: number | string;
  lifetime_invoiced: number | string;
  lifetime_collected: number | string;
  outstanding_balance: number | string;
  average_invoice: number | string;
  first_invoice_date: string | null;
  latest_invoice_date: string | null;
};

type OutstandingInvoice = {
  id: string;
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  invoice_total: number | string;
  amount_paid: number | string;
  outstanding_balance: number | string;
  payment_status: string | null;
  days_past_due: number | string | null;
};

type ServiceCategorySummary = {
  service_category: string;
  job_count: number | string;
  recurring_count: number | string;
  one_off_count: number | string;
  customer_count: number | string;
};

type CustomerValueSummary = {
  total_customers: number | string;
  one_time_customers: number | string;
  repeat_customers: number | string;
  avg_customer_value: number | string;
  avg_invoices_per_customer: number | string;
};

type ForecastMonth = {
  month: string;
  recurring_revenue_projected: number | string;
  seasonal_one_off_estimate: number | string;
  projected_total_revenue: number | string;
};

type OverheadCostRow = {
  cost_type: string;
  amount: number | string;
  start_date: string;
  end_date: string | null;
};

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
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

function isMarketMode(value: string | undefined): value is MarketMode {
  return value === "zip" || value === "city";
}

function isRankMetric(value: string | undefined): value is RankMetric {
  return [
    "revenue",
    "invoices",
    "average-ticket",
    "customers",
    "revenue-per-customer",
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

  const startDate = formatDateInput(start);
  const endDate = formatDateInput(end);
  const label = `${formatDate(startDate)} – ${formatDate(endDate)}`;

  return { startDate, endDate, label };
}


function getPreviousDateRange(
  timeframe: Timeframe,
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string; label: string } {
  const currentStart = new Date(`${startDate}T00:00:00Z`);
  const currentEnd = new Date(`${endDate}T00:00:00Z`);

  let previousStart = new Date(currentStart);
  let previousEnd = new Date(currentEnd);

  if (timeframe === "last-month") {
    previousStart = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1),
    );
    previousEnd = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0),
    );
  } else if (timeframe === "this-month") {
    previousStart = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1),
    );
    previousEnd = new Date(
      Date.UTC(
        currentStart.getUTCFullYear(),
        currentStart.getUTCMonth() - 1,
        currentEnd.getUTCDate(),
      ),
    );

    const lastDayOfPreviousMonth = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0),
    );

    if (previousEnd > lastDayOfPreviousMonth) {
      previousEnd = lastDayOfPreviousMonth;
    }
  } else if (timeframe === "ytd") {
    previousStart = new Date(
      Date.UTC(currentStart.getUTCFullYear() - 1, 0, 1),
    );
    previousEnd = new Date(
      Date.UTC(
        currentEnd.getUTCFullYear() - 1,
        currentEnd.getUTCMonth(),
        currentEnd.getUTCDate(),
      ),
    );
  } else {
    const dayCount =
      Math.floor(
        (currentEnd.getTime() - currentStart.getTime()) / 86_400_000,
      ) + 1;

    previousEnd = new Date(currentStart);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

    previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - dayCount + 1);
  }

  const previousStartDate = formatDateInput(previousStart);
  const previousEndDate = formatDateInput(previousEnd);

  return {
    startDate: previousStartDate,
    endDate: previousEndDate,
    label: `${formatDate(previousStartDate)} – ${formatDate(previousEndDate)}`,
  };
}

function buildMarketSummaries(
  invoices: MarketInvoice[],
  customerLocationMap: Map<string, MarketCustomer>,
  marketMode: MarketMode,
): MarketSummary[] {
  const summaryMap = new Map<string, MarketSummary>();

  for (const invoice of invoices) {
    if (!invoice.jobber_client_id) continue;

    const customer = customerLocationMap.get(invoice.jobber_client_id);
    const rawMarket =
      marketMode === "zip" ? customer?.postal_code : customer?.city;
    const market = rawMarket?.trim();

    if (!market) continue;

    const normalizedMarket =
      marketMode === "city" ? market.toUpperCase() : market;

    const existing = summaryMap.get(normalizedMarket) ?? {
      market:
        marketMode === "city"
          ? market.replace(/\b\w/g, (character) => character.toUpperCase())
          : market,
      revenue: 0,
      invoiceCount: 0,
      customerIds: new Set<string>(),
      averageTicket: 0,
      revenuePerCustomer: 0,
    };

    existing.revenue += toNumber(invoice.invoice_total);
    existing.invoiceCount += 1;
    existing.customerIds.add(invoice.jobber_client_id);

    summaryMap.set(normalizedMarket, existing);
  }

  return Array.from(summaryMap.values()).map((market) => ({
    ...market,
    averageTicket:
      market.invoiceCount > 0 ? market.revenue / market.invoiceCount : 0,
    revenuePerCustomer:
      market.customerIds.size > 0
        ? market.revenue / market.customerIds.size
        : 0,
  }));
}

function calculatePercentChange(
  currentValue: number,
  previousValue: number,
): number | null {
  if (previousValue === 0) {
    return currentValue === 0 ? 0 : null;
  }

  return (currentValue - previousValue) / previousValue;
}

function comparisonClasses(change: number | null): string {
  if (change === null) return "bg-blue-50 text-blue-800";
  if (change > 0) return "bg-green-50 text-green-800";
  if (change < 0) return "bg-red-50 text-red-800";

  return "bg-[#f7f6f1] text-[#6b705c]";
}

function formatComparison(change: number | null): string {
  if (change === null) return "New";
  if (change > 0) return `↑ ${formatPercent(Math.abs(change))}`;
  if (change < 0) return `↓ ${formatPercent(Math.abs(change))}`;

  return "No change";
}

function marketMetricValue(market: MarketSummary, metric: RankMetric): number {
  if (metric === "invoices") return market.invoiceCount;
  if (metric === "average-ticket") return market.averageTicket;
  if (metric === "customers") return market.customerIds.size;
  if (metric === "revenue-per-customer") return market.revenuePerCustomer;

  return market.revenue;
}

function formatMarketMetric(value: number, metric: RankMetric): string {
  if (metric === "invoices" || metric === "customers") {
    return formatNumber(value);
  }

  return formatCurrency(value);
}

function makeMarketHref(
  timeframe: Timeframe,
  marketMode: MarketMode,
  rankMetric: RankMetric,
  overrides: Partial<{
    timeframe: Timeframe;
    market: MarketMode;
    rank: RankMetric;
  }>,
  customStart?: string,
  customEnd?: string,
): string {
  const params = new URLSearchParams({
    timeframe: overrides.timeframe ?? timeframe,
    market: overrides.market ?? marketMode,
    rank: overrides.rank ?? rankMetric,
  });

  const nextTimeframe = overrides.timeframe ?? timeframe;

  if (nextTimeframe === "custom") {
    if (customStart) params.set("start", customStart);
    if (customEnd) params.set("end", customEnd);
  }

  return `/revenue?${params.toString()}`;
}

async function fetchMarketInvoices(
  startDate: string,
  endDate: string,
): Promise<MarketInvoice[]> {
  const pageSize = 1000;
  const rows: MarketInvoice[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select("jobber_client_id, issue_date, invoice_total, outstanding_balance")
      .gte("issue_date", startDate)
      .lte("issue_date", endDate)
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as MarketInvoice[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}


async function fetchDashboardPayments(
  startDate: string,
  endDate: string,
): Promise<DashboardPayment[]> {
  const pageSize = 1000;
  const rows: DashboardPayment[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("jobber_payments")
      .select("amount, payment_date")
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as DashboardPayment[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchCompletedJobsCount(
  startDate: string,
  endDate: string,
): Promise<number> {
  const startTimestamp = `${startDate}T00:00:00.000Z`;
  const endTimestamp = `${endDate}T23:59:59.999Z`;

  const { count, error } = await supabaseServer
    .from("jobber_jobs")
    .select("id", { count: "exact", head: true })
    .ilike("job_status", "%complete%")
    .gte("updated_at", startTimestamp)
    .lte("updated_at", endTimestamp);

  if (error) throw error;

  return count ?? 0;
}

async function fetchMarketCustomers(): Promise<MarketCustomer[]> {
  const pageSize = 1000;
  const rows: MarketCustomer[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, city, postal_code")
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as MarketCustomer[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchOverheadCosts(): Promise<OverheadCostRow[]> {
  const { data, error } = await supabaseServer
    .from("overhead_costs")
    .select("cost_type, amount, start_date, end_date");

  if (error) throw error;

  return (data ?? []) as OverheadCostRow[];
}

function daysBetweenInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function calculateOverheadForRange(
  costs: OverheadCostRow[],
  rangeStart: string,
  rangeEnd: string,
): number {
  const rangeStartDate = new Date(`${rangeStart}T00:00:00Z`);
  const rangeEndDate = new Date(`${rangeEnd}T00:00:00Z`);

  let total = 0;

  for (const cost of costs) {
    const amount = toNumber(cost.amount);
    const costStart = new Date(`${cost.start_date}T00:00:00Z`);
    const costEnd = cost.end_date
      ? new Date(`${cost.end_date}T00:00:00Z`)
      : null;

    if (cost.cost_type === "recurring") {
      // Smooth a monthly amount into a daily burn rate so it can be
      // prorated across any arbitrary date range, not just calendar months.
      const dailyRate = (amount * 12) / 365.25;

      const overlapStart =
        costStart > rangeStartDate ? costStart : rangeStartDate;
      const overlapEnd =
        costEnd && costEnd < rangeEndDate ? costEnd : rangeEndDate;

      if (overlapStart <= overlapEnd) {
        total += dailyRate * daysBetweenInclusive(overlapStart, overlapEnd);
      }
    } else if (cost.cost_type === "amortized" && costEnd) {
      const totalDays = daysBetweenInclusive(costStart, costEnd);
      const dailyRate = totalDays > 0 ? amount / totalDays : 0;

      const overlapStart =
        costStart > rangeStartDate ? costStart : rangeStartDate;
      const overlapEnd = costEnd < rangeEndDate ? costEnd : rangeEndDate;

      if (overlapStart <= overlapEnd) {
        total += dailyRate * daysBetweenInclusive(overlapStart, overlapEnd);
      }
    }
  }

  return total;
}

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

function formatMonth(value: string): string {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusClasses(daysPastDue: number): string {
  if (daysPastDue >= 60) {
    return "bg-red-100 text-red-800";
  }

  if (daysPastDue >= 30) {
    return "bg-orange-100 text-orange-800";
  }

  if (daysPastDue > 0) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-green-100 text-green-800";
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  try {
    const params = await searchParams;
    const timeframe: Timeframe = isTimeframe(params.timeframe)
      ? params.timeframe
      : "last-month";
    const marketMode: MarketMode = isMarketMode(params.market)
      ? params.market
      : "zip";
    const rankMetric: RankMetric = isRankMetric(params.rank)
      ? params.rank
      : "revenue";

    const {
      startDate,
      endDate,
      label: marketDateLabel,
    } = getDateRange(timeframe, params.start, params.end);

    const {
      startDate: previousStartDate,
      endDate: previousEndDate,
      label: previousMarketDateLabel,
    } = getPreviousDateRange(timeframe, startDate, endDate);
    const [
      topCustomersResult,
      outstandingResult,
      serviceCategoryResult,
      customerValueResult,
      forecastResult,
      overheadCosts,
      marketInvoices,
      previousMarketInvoices,
      marketCustomers,
      dashboardPayments,
      jobsCompleted,
    ] = await Promise.all([
      supabaseServer
        .from("customer_financials")
        .select(
          `
            jobber_client_id,
            customer_name,
            invoice_count,
            lifetime_invoiced,
            lifetime_collected,
            outstanding_balance,
            average_invoice,
            first_invoice_date,
            latest_invoice_date
          `,
        )
        .order("lifetime_collected", { ascending: false })
        .limit(10),

      supabaseServer
        .from("outstanding_invoices")
        .select(
          `
            id,
            jobber_invoice_id,
            jobber_client_id,
            invoice_number,
            customer_name,
            status,
            issue_date,
            due_date,
            invoice_total,
            amount_paid,
            outstanding_balance,
            payment_status,
            days_past_due
          `,
        )
        .order("outstanding_balance", { ascending: false })
        .limit(15),

      supabaseServer
        .from("service_category_summary")
        .select(
          "service_category, job_count, recurring_count, one_off_count, customer_count",
        )
        .order("job_count", { ascending: false }),

      supabaseServer
        .from("customer_value_summary")
        .select(
          "total_customers, one_time_customers, repeat_customers, avg_customer_value, avg_invoices_per_customer",
        )
        .single(),

      supabaseServer
        .from("forecast_next_12_months_final")
        .select(
          "month, recurring_revenue_projected, seasonal_one_off_estimate, projected_total_revenue",
        )
        .order("month", { ascending: true }),

      fetchOverheadCosts(),

      fetchMarketInvoices(startDate, endDate),
      fetchMarketInvoices(previousStartDate, previousEndDate),
      fetchMarketCustomers(),
      fetchDashboardPayments(startDate, endDate),
      fetchCompletedJobsCount(startDate, endDate),
    ]);

    const queryErrors = [
      topCustomersResult.error,
      outstandingResult.error,
      serviceCategoryResult.error,
      customerValueResult.error,
      forecastResult.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      throw new Error(
        queryErrors
          .map((error) => error?.message)
          .filter(Boolean)
          .join(", "),
      );
    }

    const topCustomers = (topCustomersResult.data ?? []) as CustomerFinancial[];
    const outstandingInvoices = (outstandingResult.data ??
      []) as OutstandingInvoice[];
    const serviceCategories = (serviceCategoryResult.data ??
      []) as ServiceCategorySummary[];
    const customerValue =
      customerValueResult.data as CustomerValueSummary | null;
    const forecastMonths = (forecastResult.data ?? []) as ForecastMonth[];

    const totalOverheadForRange = calculateOverheadForRange(
      overheadCosts,
      startDate,
      endDate,
    );

    const overheadPerJob =
      jobsCompleted > 0 ? totalOverheadForRange / jobsCompleted : null;

    const maxForecastValue = Math.max(
      1,
      ...forecastMonths.map((m) => toNumber(m.projected_total_revenue)),
    );

    const totalForecastRevenue = forecastMonths.reduce(
      (sum, m) => sum + toNumber(m.projected_total_revenue),
      0,
    );

    const totalForecastRecurring = forecastMonths.reduce(
      (sum, m) => sum + toNumber(m.recurring_revenue_projected),
      0,
    );

    const totalRecurringJobs = serviceCategories.reduce(
      (sum, c) => sum + toNumber(c.recurring_count),
      0,
    );
    const totalOneOffJobs = serviceCategories.reduce(
      (sum, c) => sum + toNumber(c.one_off_count),
      0,
    );
    const totalCategorizedJobs = totalRecurringJobs + totalOneOffJobs;

    const repeatCustomerRate =
      customerValue && toNumber(customerValue.total_customers) > 0
        ? toNumber(customerValue.repeat_customers) /
          toNumber(customerValue.total_customers)
        : 0;

    const dashboardRevenue = marketInvoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.invoice_total),
      0,
    );

    const dashboardOutstandingInvoices = marketInvoices.filter(
      (invoice) => toNumber(invoice.outstanding_balance) > 0,
    );

    const dashboardOutstandingBalance = dashboardOutstandingInvoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.outstanding_balance),
      0,
    );

    const totalPayments = dashboardPayments.reduce(
      (sum, payment) => sum + toNumber(payment.amount),
      0,
    );

    const averagePayment =
      dashboardPayments.length > 0
        ? totalPayments / dashboardPayments.length
        : 0;

    const customerLocationMap = new Map(
      marketCustomers.map((customer) => [customer.jobber_client_id, customer]),
    );

    const marketSummaries = buildMarketSummaries(
      marketInvoices,
      customerLocationMap,
      marketMode,
    );

    const previousMarketSummaries = buildMarketSummaries(
      previousMarketInvoices,
      customerLocationMap,
      marketMode,
    );

    const previousMarketMap = new Map(
      previousMarketSummaries.map((market) => [
        marketMode === "city" ? market.market.toUpperCase() : market.market,
        market,
      ]),
    );

    const totalMarketRevenue = marketSummaries.reduce(
      (sum, market) => sum + market.revenue,
      0,
    );

    const topMarkets = marketSummaries
      .sort(
        (a, b) =>
          marketMetricValue(b, rankMetric) - marketMetricValue(a, rankMetric),
      )
      .slice(0, 10);

    const maxMarketMetric = Math.max(
      1,
      ...topMarkets.map((market) => marketMetricValue(market, rankMetric)),
    );

    const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
      { value: "last-7-days", label: "Last 7 Days" },
      { value: "last-month", label: "Last Month" },
      { value: "this-month", label: "This Month" },
      { value: "last-90-days", label: "Last 90 Days" },
      { value: "ytd", label: "YTD" },
      { value: "custom", label: "Custom" },
    ];

    const rankOptions: Array<{ value: RankMetric; label: string }> = [
      { value: "revenue", label: "Revenue" },
      { value: "invoices", label: "Invoices" },
      { value: "average-ticket", label: "Average Ticket" },
      { value: "customers", label: "Customers" },
      { value: "revenue-per-customer", label: "Revenue / Customer" },
    ];

    const primaryCards = [
      {
        title: "Revenue",
        value: formatCurrency(dashboardRevenue),
        subtitle: `Invoices issued · ${marketDateLabel}`,
        icon: "📈",
      },
      {
        title: "Outstanding Invoices",
        value: formatCurrency(dashboardOutstandingBalance),
        subtitle: `${formatNumber(
          dashboardOutstandingInvoices.length,
        )} invoices with balances`,
        icon: "📄",
      },
      {
        title: "Jobs Completed",
        value: formatNumber(jobsCompleted),
        subtitle: `Completed-status jobs · ${marketDateLabel}`,
        icon: "✅",
      },
      {
        title: "Average Payment",
        value: formatCurrency(averagePayment),
        subtitle: `${formatNumber(dashboardPayments.length)} payments received`,
        icon: "💵",
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

              <h1 className="mt-2 text-4xl font-bold">Financial Dashboard</h1>

              <p className="mt-2 max-w-2xl text-[#6b705c]">
                Revenue, payments, customer value, and accounts receivable from
                your synchronized Jobber data.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/costs"
                className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
              >
                Manage Costs
              </Link>

              <Link
                href="/api/jobber/sync-invoices"
                className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
              >
                Sync Invoices
              </Link>

              <Link
                href="/api/jobber/sync-payments"
                className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
              >
                Sync Payments
              </Link>
            </div>
          </header>

          <section
            id="financial-snapshot"
            className="mt-8 scroll-mt-6 rounded-3xl bg-white p-6 shadow"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Financial Snapshot
                </p>
                <h2 className="mt-1 text-2xl font-bold">{marketDateLabel}</h2>
                <p className="mt-1 text-sm text-[#6b705c]">
                  The cards and market analytics below use this selected period.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {timeframeOptions.map((option) => (
                  <Link
                    key={option.value}
                    href={makeMarketHref(
                      timeframe,
                      marketMode,
                      rankMetric,
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
                action="/revenue#financial-snapshot"
                className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f7f6f1] p-4"
              >
                <input type="hidden" name="timeframe" value="custom" />
                <input type="hidden" name="market" value={marketMode} />
                <input type="hidden" name="rank" value={rankMetric} />

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
            {primaryCards.map((card) => (
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

          <section className="mt-6 rounded-3xl border border-[#e3ded1] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Job Costing
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  Overhead Cost Per Job
                </h2>

                <p className="mt-1 text-sm text-[#6b705c]">
                  Overhead for {marketDateLabel}, prorated by day and divided
                  across {formatNumber(jobsCompleted)} completed job
                  {jobsCompleted === 1 ? "" : "s"} in that period.{" "}
                  <Link
                    href="/costs"
                    className="font-semibold text-[#9c7a20] hover:underline"
                  >
                    Manage costs →
                  </Link>
                </p>
              </div>

              {overheadPerJob !== null ? (
                <div className="shrink-0 sm:text-right">
                  <p className="text-3xl font-bold">
                    {formatCurrency(overheadPerJob)}
                    <span className="ml-1 text-base font-normal text-[#6b705c]">
                      / job
                    </span>
                  </p>

                  <p className="mt-1 text-sm text-[#6b705c]">
                    {formatCurrency(totalOverheadForRange)} total ÷{" "}
                    {formatNumber(jobsCompleted)} jobs
                  </p>
                </div>
              ) : (
                <p className="shrink-0 text-sm text-[#6b705c]">
                  No completed jobs in this period yet.
                </p>
              )}
            </div>
          </section>

          <section
            id="revenue-by-market"
            className="mt-8 scroll-mt-6 rounded-3xl bg-white p-8 shadow"
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Market Intelligence
                </p>
                <h2 className="mt-2 text-2xl font-bold">Revenue by Market</h2>
                <p className="mt-1 text-[#6b705c]">
                  See which {marketMode === "zip" ? "ZIP codes" : "cities"}{" "}
                  generate the most financial value.
                </p>
                <p className="mt-2 text-sm font-semibold text-[#174734]">
                  {marketDateLabel}
                </p>
                <p className="mt-1 text-xs text-[#6b705c]">
                  Compared with {previousMarketDateLabel}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={makeMarketHref(
                    timeframe,
                    marketMode,
                    rankMetric,
                    { market: "zip" },
                    params.start,
                    params.end,
                  )}
                  scroll={false}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                    marketMode === "zip"
                      ? "bg-[#174734] text-white"
                      : "border border-[#d8d3c6] bg-[#f7f6f1] text-[#174734]"
                  }`}
                >
                  ZIP Codes
                </Link>
                <Link
                  href={makeMarketHref(
                    timeframe,
                    marketMode,
                    rankMetric,
                    { market: "city" },
                    params.start,
                    params.end,
                  )}
                  scroll={false}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                    marketMode === "city"
                      ? "bg-[#174734] text-white"
                      : "border border-[#d8d3c6] bg-[#f7f6f1] text-[#174734]"
                  }`}
                >
                  Cities
                </Link>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#6b705c]">
                Ranked by{" "}
                <span className="font-bold text-[#174734]">
                  {
                    rankOptions.find((option) => option.value === rankMetric)
                      ?.label
                  }
                </span>
              </p>

              <div className="flex flex-wrap gap-2">
                {rankOptions.map((option) => (
                  <Link
                    key={option.value}
                    href={makeMarketHref(
                      timeframe,
                      marketMode,
                      rankMetric,
                      { rank: option.value },
                      params.start,
                      params.end,
                    )}
                    scroll={false}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      rankMetric === option.value
                        ? "bg-[#174734] text-white"
                        : "bg-[#f7f6f1] text-[#6b705c] hover:text-[#174734]"
                    }`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>

            {topMarkets.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                No invoice revenue with customer location data was found for
                this timeframe.
              </p>
            ) : (
              <>
                <div className="mt-7 space-y-4">
                  {topMarkets.map((market, index) => {
                    const metricValue = marketMetricValue(market, rankMetric);
                    const width = Math.max(
                      2,
                      (metricValue / maxMarketMetric) * 100,
                    );
                    const revenueShare =
                      totalMarketRevenue > 0
                        ? market.revenue / totalMarketRevenue
                        : 0;
                    const marketKey =
                      marketMode === "city"
                        ? market.market.toUpperCase()
                        : market.market;
                    const previousMarket = previousMarketMap.get(marketKey);
                    const previousMetricValue = previousMarket
                      ? marketMetricValue(previousMarket, rankMetric)
                      : 0;
                    const metricChange = calculatePercentChange(
                      metricValue,
                      previousMetricValue,
                    );

                    return (
                      <div
                        key={market.market}
                        className="rounded-2xl border border-[#e7e2d5] p-5"
                      >
                        <div className="grid gap-4 lg:grid-cols-[44px_120px_1fr_180px] lg:items-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f6f1] font-bold">
                            {index + 1}
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
                              {marketMode === "zip" ? "ZIP Code" : "City"}
                            </p>
                            <p className="mt-1 text-lg font-bold">
                              {market.market}
                            </p>
                          </div>

                          <div>
                            <div className="h-4 overflow-hidden rounded-full bg-[#eeeae0]">
                              <div
                                className="h-full rounded-full bg-[#174734]"
                                style={{ width: `${width}%` }}
                              />
                            </div>

                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#6b705c]">
                              <span>
                                {formatCurrency(market.revenue)} revenue
                              </span>
                              <span>
                                {formatNumber(market.invoiceCount)} invoices
                              </span>
                              <span>
                                {formatNumber(market.customerIds.size)}{" "}
                                customers
                              </span>
                              <span>
                                {formatCurrency(market.averageTicket)} avg
                                ticket
                              </span>
                            </div>
                          </div>

                          <div className="text-left lg:text-right">
                            <p className="text-2xl font-bold text-[#9c7a20]">
                              {formatMarketMetric(metricValue, rankMetric)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 lg:justify-end">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-bold ${comparisonClasses(
                                  metricChange,
                                )}`}
                              >
                                {formatComparison(metricChange)}
                              </span>
                              <span className="text-xs text-[#6b705c]">
                                vs previous period
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-[#6b705c]">
                              {formatPercent(revenueShare)} of located revenue
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-2xl bg-[#f7f6f1] p-5 text-sm text-[#6b705c]">
                  Market revenue includes invoices whose customer record has a{" "}
                  {marketMode === "zip" ? "postal code" : "city"}. Customers
                  without location data are excluded. Comparison percentages
                  use the currently selected ranking metric against the matching
                  previous period.
                </div>
              </>
            )}
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Revenue Forecast — Next 12 Months
                </h2>

                <p className="mt-1 text-[#6b705c]">
                  Recurring revenue projected from active customer schedules,
                  plus seasonal one-off work estimated from last year's pattern.
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-[#6b705c]">Projected 12-mo total</p>
                <p className="text-3xl font-bold text-[#9c7a20]">
                  {formatCurrency(totalForecastRevenue)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#eef4ee] p-5">
                <p className="text-sm text-[#174734]">
                  Locked-in recurring (12mo)
                </p>
                <p className="mt-2 text-2xl font-bold text-[#174734]">
                  {formatCurrency(totalForecastRecurring)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#faf4e3] p-5">
                <p className="text-sm text-[#9c7a20]">
                  Seasonal / one-off estimate (12mo)
                </p>
                <p className="mt-2 text-2xl font-bold text-[#9c7a20]">
                  {formatCurrency(
                    totalForecastRevenue - totalForecastRecurring,
                  )}
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              {forecastMonths.length === 0 ? (
                <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                  No forecast data available yet.
                </p>
              ) : (
                forecastMonths.map((month) => {
                  const recurring = toNumber(month.recurring_revenue_projected);
                  const oneOff = toNumber(month.seasonal_one_off_estimate);
                  const total = recurring + oneOff;

                  const recurringWidth = Math.max(
                    1,
                    (recurring / maxForecastValue) * 100,
                  );
                  const oneOffWidth = Math.max(
                    oneOff > 0 ? 1 : 0,
                    (oneOff / maxForecastValue) * 100,
                  );

                  return (
                    <div
                      key={month.month}
                      className="grid gap-3 md:grid-cols-[110px_1fr_170px]"
                    >
                      <p className="font-bold">{formatMonth(month.month)}</p>

                      <div className="space-y-2">
                        <div className="h-4 overflow-hidden rounded-full bg-[#eeeae0]">
                          <div className="flex h-full">
                            <div
                              className="h-full rounded-l-full bg-[#174734]"
                              style={{ width: `${recurringWidth}%` }}
                            />
                            <div
                              className="h-full rounded-r-full bg-[#d4af37]"
                              style={{ width: `${oneOffWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="text-sm">
                        <p className="font-semibold">
                          {formatCurrency(total)} total
                        </p>
                        <p className="text-[#6b705c]">
                          {formatCurrency(recurring)} recurring
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-7 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#174734]" />
                <span>Recurring (locked-in)</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#d4af37]" />
                <span>Seasonal / one-off (estimated)</span>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Customer Value Depth</h2>

              <p className="mt-1 text-[#6b705c]">
                How many customers come back, and what they're worth.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-green-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-green-800">
                    Repeat Customers
                  </p>
                  <p className="mt-3 text-4xl font-bold text-green-900">
                    {formatNumber(toNumber(customerValue?.repeat_customers))}
                  </p>
                  <p className="mt-1 text-sm text-green-800">
                    {formatPercent(repeatCustomerRate)} of all customers
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-800">
                    One-Time Customers
                  </p>
                  <p className="mt-3 text-4xl font-bold text-amber-900">
                    {formatNumber(toNumber(customerValue?.one_time_customers))}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  <p className="text-sm text-[#6b705c]">
                    Average Customer Value
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {formatCurrency(
                      toNumber(customerValue?.avg_customer_value),
                    )}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  <p className="text-sm text-[#6b705c]">
                    Avg Invoices / Customer
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {toNumber(customerValue?.avg_invoices_per_customer).toFixed(
                      1,
                    )}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Jobs by Service Type</h2>

              <p className="mt-1 text-[#6b705c]">
                Recurring vs. one-time work, grouped by actual service.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#eef4ee] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#174734]">
                    Recurring
                  </p>
                  <p className="mt-3 text-4xl font-bold text-[#174734]">
                    {formatNumber(totalRecurringJobs)}
                  </p>
                  <p className="mt-1 text-sm text-[#174734]">
                    {totalCategorizedJobs > 0
                      ? formatPercent(totalRecurringJobs / totalCategorizedJobs)
                      : "—"}{" "}
                    of jobs
                  </p>
                </div>

                <div className="rounded-2xl bg-[#faf4e3] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
                    One-Time
                  </p>
                  <p className="mt-3 text-4xl font-bold text-[#9c7a20]">
                    {formatNumber(totalOneOffJobs)}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                {serviceCategories.length === 0 ? (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No job data synced yet.
                  </p>
                ) : (
                  serviceCategories.map((category) => {
                    const recurring = toNumber(category.recurring_count);
                    const oneOff = toNumber(category.one_off_count);
                    const isRecurring = recurring > oneOff;

                    return (
                      <div
                        key={category.service_category}
                        className="flex items-center justify-between gap-4 rounded-xl border border-[#e7e2d5] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {category.service_category}
                          </p>
                          <p className="text-sm text-[#6b705c]">
                            {formatNumber(toNumber(category.customer_count))}{" "}
                            customers
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              isRecurring
                                ? "bg-[#eef4ee] text-[#174734]"
                                : "bg-[#faf4e3] text-[#9c7a20]"
                            }`}
                          >
                            {isRecurring ? "Recurring" : "One-Time"}
                          </span>

                          <p className="font-bold">
                            {formatNumber(toNumber(category.job_count))}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl bg-white p-8 shadow">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Top Customers</h2>

                  <p className="mt-1 text-[#6b705c]">
                    Ranked by lifetime cash collected.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {topCustomers.length === 0 ? (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No customer financial data found.
                  </p>
                ) : (
                  topCustomers.map((customer, index) => (
                    <Link
                      key={customer.jobber_client_id}
                      href={`/customers/${encodeURIComponent(
                        customer.jobber_client_id,
                      )}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f7f6f1] font-bold">
                          {index + 1}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-bold">
                            {customer.customer_name || "Unnamed Customer"}
                          </p>

                          <p className="mt-1 text-sm text-[#6b705c]">
                            {formatNumber(toNumber(customer.invoice_count))}{" "}
                            invoices
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="font-bold">
                          {formatCurrency(
                            toNumber(customer.lifetime_collected),
                          )}
                        </p>

                        <p className="mt-1 text-sm text-[#6b705c]">collected</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-3xl bg-white p-8 shadow">
              <div>
                <h2 className="text-2xl font-bold">
                  Largest Outstanding Invoices
                </h2>

                <p className="mt-1 text-[#6b705c]">
                  Highest remaining invoice balances requiring attention.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                {outstandingInvoices.length === 0 ? (
                  <p className="rounded-2xl bg-green-50 p-5 text-green-800">
                    No outstanding invoices found.
                  </p>
                ) : (
                  outstandingInvoices.map((invoice) => {
                    const daysPastDue = toNumber(invoice.days_past_due);

                    return (
                      <div
                        key={invoice.jobber_invoice_id}
                        className="rounded-2xl border border-[#e7e2d5] p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-bold">
                              {invoice.customer_name || "Unnamed Customer"}
                            </p>

                            <p className="mt-1 text-sm text-[#6b705c]">
                              Invoice #{invoice.invoice_number || "—"}
                            </p>
                          </div>

                          <p className="text-xl font-bold">
                            {formatCurrency(
                              toNumber(invoice.outstanding_balance),
                            )}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm text-[#6b705c]">
                            Due {formatDate(invoice.due_date)}
                          </p>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
                              daysPastDue,
                            )}`}
                          >
                            {daysPastDue > 0
                              ? `${formatNumber(daysPastDue)} days past due`
                              : "Not past due"}
                          </span>
                        </div>
                      </div>
                    );
                  })
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
        : "Financial metrics could not be loaded.";

    return (
      <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl bg-white p-8 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Financial dashboard could not be loaded
            </h1>

            <p className="mt-4 text-[#6b705c]">{message}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/api/jobber/sync-invoices"
                className="rounded-xl bg-[#d4af37] px-5 py-3 text-sm font-bold text-[#174734]"
              >
                Sync Invoices
              </Link>

              <Link
                href="/api/jobber/sync-payments"
                className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
              >
                Sync Payments
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }
}
