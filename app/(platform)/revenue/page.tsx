export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getFinancialMetrics } from "@/lib/financial/metrics";
import { supabaseServer } from "@/lib/supabase-server";

type MonthlyFinancial = {
  month: string;
  invoice_count: number | string;
  invoiced_revenue: number | string;
  payment_count: number | string;
  cash_collected: number | string;
  monthly_difference: number | string;
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

export default async function RevenuePage() {
  try {
    const [
      metrics,
      monthlyResult,
      topCustomersResult,
      outstandingResult,
      serviceCategoryResult,
      customerValueResult,
      forecastResult,
    ] = await Promise.all([
      getFinancialMetrics(),

      supabaseServer
        .from("monthly_financials")
        .select(
          `
            month,
            invoice_count,
            invoiced_revenue,
            payment_count,
            cash_collected,
            monthly_difference
          `
        )
        .order("month", { ascending: false })
        .limit(12),

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
          `
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
          `
        )
        .order("outstanding_balance", { ascending: false })
        .limit(15),

      supabaseServer
        .from("service_category_summary")
        .select(
          "service_category, job_count, recurring_count, one_off_count, customer_count"
        )
        .order("job_count", { ascending: false }),

      supabaseServer
        .from("customer_value_summary")
        .select(
          "total_customers, one_time_customers, repeat_customers, avg_customer_value, avg_invoices_per_customer"
        )
        .single(),

      supabaseServer
        .from("forecast_next_12_months_final")
        .select(
          "month, recurring_revenue_projected, seasonal_one_off_estimate, projected_total_revenue"
        )
        .order("month", { ascending: true }),
    ]);

    const queryErrors = [
      monthlyResult.error,
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
          .join(", ")
      );
    }

    const monthlyData = (monthlyResult.data ?? []) as MonthlyFinancial[];
    const topCustomers = (topCustomersResult.data ??
      []) as CustomerFinancial[];
    const outstandingInvoices = (outstandingResult.data ??
      []) as OutstandingInvoice[];
    const serviceCategories = (serviceCategoryResult.data ??
      []) as ServiceCategorySummary[];
    const customerValue = customerValueResult.data as CustomerValueSummary | null;
    const forecastMonths = (forecastResult.data ?? []) as ForecastMonth[];

    const maxForecastValue = Math.max(
      1,
      ...forecastMonths.map((m) => toNumber(m.projected_total_revenue))
    );

    const totalForecastRevenue = forecastMonths.reduce(
      (sum, m) => sum + toNumber(m.projected_total_revenue),
      0
    );

    const totalForecastRecurring = forecastMonths.reduce(
      (sum, m) => sum + toNumber(m.recurring_revenue_projected),
      0
    );

    const chronologicalMonths = [...monthlyData].reverse();

    const maxMonthlyValue = Math.max(
      1,
      ...chronologicalMonths.flatMap((month) => [
        toNumber(month.invoiced_revenue),
        toNumber(month.cash_collected),
      ])
    );

    const collectionRate =
      metrics.totalRevenue > 0
        ? metrics.totalCollected / metrics.totalRevenue
        : 0;

    const paidInvoiceRate =
      metrics.invoicesPaid + metrics.invoicesOutstanding > 0
        ? metrics.invoicesPaid /
          (metrics.invoicesPaid + metrics.invoicesOutstanding)
        : 0;

    const totalRecurringJobs = serviceCategories.reduce(
      (sum, c) => sum + toNumber(c.recurring_count),
      0
    );
    const totalOneOffJobs = serviceCategories.reduce(
      (sum, c) => sum + toNumber(c.one_off_count),
      0
    );
    const totalCategorizedJobs = totalRecurringJobs + totalOneOffJobs;

    const repeatCustomerRate =
      customerValue && toNumber(customerValue.total_customers) > 0
        ? toNumber(customerValue.repeat_customers) /
          toNumber(customerValue.total_customers)
        : 0;

    const primaryCards = [
      {
        title: "Total Invoiced",
        value: formatCurrency(metrics.totalRevenue),
        subtitle: "All synchronized invoices",
        icon: "🧾",
      },
      {
        title: "Cash Collected",
        value: formatCurrency(metrics.totalCollected),
        subtitle: `${formatPercent(collectionRate)} collection rate`,
        icon: "💵",
      },
      {
        title: "Accounts Receivable",
        value: formatCurrency(metrics.outstandingReceivables),
        subtitle: `${formatNumber(
          metrics.invoicesOutstanding
        )} invoices with balances`,
        icon: "📄",
      },
      {
        title: "Revenue This Month",
        value: formatCurrency(metrics.revenueThisMonth),
        subtitle: "Invoices issued this month",
        icon: "📈",
      },
    ];

    const secondaryCards = [
      {
        title: "Revenue This Year",
        value: formatCurrency(metrics.revenueThisYear),
        subtitle: "Year-to-date invoiced revenue",
      },
      {
        title: "Collected This Month",
        value: formatCurrency(metrics.collectedThisMonth),
        subtitle: "Payments recorded this month",
      },
      {
        title: "Average Invoice",
        value: formatCurrency(metrics.averageInvoice),
        subtitle: "Average invoice value",
      },
      {
        title: "Average Payment",
        value: formatCurrency(metrics.averagePayment),
        subtitle: "Average payment record",
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
                Financial Dashboard
              </h1>

              <p className="mt-2 max-w-2xl text-[#6b705c]">
                Revenue, payments, customer value, and accounts receivable
                from your synchronized Jobber data.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
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

          <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

                    <p className="mt-3 text-4xl font-bold">
                      {card.value}
                    </p>

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

          <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {secondaryCards.map((card) => (
              <article
                key={card.title}
                className="rounded-3xl border border-[#e3ded1] bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#6b705c]">
                  {card.title}
                </p>

                <p className="mt-3 text-3xl font-bold">{card.value}</p>

                <p className="mt-2 text-sm text-[#6b705c]">
                  {card.subtitle}
                </p>
              </article>
            ))}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-3xl bg-white p-8 shadow">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    Collection Performance
                  </h2>

                  <p className="mt-1 text-[#6b705c]">
                    How much invoiced revenue has been collected.
                  </p>
                </div>

                <p className="text-3xl font-bold text-[#9c7a20]">
                  {formatPercent(collectionRate)}
                </p>
              </div>

              <div className="mt-7 h-5 overflow-hidden rounded-full bg-[#eeeae0]">
                <div
                  className="h-full rounded-full bg-[#174734]"
                  style={{
                    width: `${Math.min(
                      Math.max(collectionRate * 100, 0),
                      100
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  <p className="text-sm text-[#6b705c]">Invoiced</p>
                  <p className="mt-2 text-2xl font-bold">
                    {formatCurrency(metrics.totalRevenue)}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  <p className="text-sm text-[#6b705c]">Collected</p>
                  <p className="mt-2 text-2xl font-bold">
                    {formatCurrency(metrics.totalCollected)}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  <p className="text-sm text-[#6b705c]">Outstanding</p>
                  <p className="mt-2 text-2xl font-bold">
                    {formatCurrency(metrics.outstandingReceivables)}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Invoice Health</h2>

              <p className="mt-1 text-[#6b705c]">
                Paid invoices compared with invoices still carrying a
                balance.
              </p>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-green-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-green-800">
                    Paid Invoices
                  </p>

                  <p className="mt-3 text-4xl font-bold text-green-900">
                    {formatNumber(metrics.invoicesPaid)}
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-800">
                    Outstanding
                  </p>

                  <p className="mt-3 text-4xl font-bold text-amber-900">
                    {formatNumber(metrics.invoicesOutstanding)}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-[#f7f6f1] p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">Invoice payment rate</p>

                  <p className="text-xl font-bold">
                    {formatPercent(paidInvoiceRate)}
                  </p>
                </div>
              </div>
            </article>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow">
            <div>
              <h2 className="text-2xl font-bold">
                Monthly Revenue and Collections
              </h2>

              <p className="mt-1 text-[#6b705c]">
                Invoiced revenue compared with payments collected over the
                last 12 months.
              </p>
            </div>

            <div className="mt-8 space-y-6">
              {chronologicalMonths.length === 0 ? (
                <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                  No monthly financial data found.
                </p>
              ) : (
                chronologicalMonths.map((month) => {
                  const invoiced = toNumber(month.invoiced_revenue);
                  const collected = toNumber(month.cash_collected);

                  const invoicedWidth = Math.max(
                    1,
                    (invoiced / maxMonthlyValue) * 100
                  );

                  const collectedWidth = Math.max(
                    collected > 0 ? 1 : 0,
                    (collected / maxMonthlyValue) * 100
                  );

                  return (
                    <div
                      key={month.month}
                      className="grid gap-3 md:grid-cols-[110px_1fr_150px]"
                    >
                      <p className="font-bold">
                        {formatMonth(month.month)}
                      </p>

                      <div className="space-y-2">
                        <div className="h-4 overflow-hidden rounded-full bg-[#eeeae0]">
                          <div
                            className="h-full rounded-full bg-[#174734]"
                            style={{ width: `${invoicedWidth}%` }}
                          />
                        </div>

                        <div className="h-4 overflow-hidden rounded-full bg-[#eeeae0]">
                          <div
                            className="h-full rounded-full bg-[#d4af37]"
                            style={{ width: `${collectedWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="text-sm">
                        <p className="font-semibold">
                          {formatCurrency(invoiced)} invoiced
                        </p>

                        <p className="text-[#6b705c]">
                          {formatCurrency(collected)} collected
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
                <span>Invoiced revenue</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#d4af37]" />
                <span>Cash collected</span>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Revenue Forecast — Next 12 Months
                </h2>

                <p className="mt-1 text-[#6b705c]">
                  Recurring revenue projected from active customer schedules,
                  plus seasonal one-off work estimated from last year's
                  pattern.
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
                  {formatCurrency(totalForecastRevenue - totalForecastRecurring)}
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
                    (recurring / maxForecastValue) * 100
                  );
                  const oneOffWidth = Math.max(
                    oneOff > 0 ? 1 : 0,
                    (oneOff / maxForecastValue) * 100
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
                    {formatCurrency(toNumber(customerValue?.avg_customer_value))}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  <p className="text-sm text-[#6b705c]">
                    Avg Invoices / Customer
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {toNumber(customerValue?.avg_invoices_per_customer).toFixed(1)}
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
                        customer.jobber_client_id
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
                            {formatNumber(
                              toNumber(customer.invoice_count)
                            )}{" "}
                            invoices
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="font-bold">
                          {formatCurrency(
                            toNumber(customer.lifetime_collected)
                          )}
                        </p>

                        <p className="mt-1 text-sm text-[#6b705c]">
                          collected
                        </p>
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
                              toNumber(invoice.outstanding_balance)
                            )}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm text-[#6b705c]">
                            Due {formatDate(invoice.due_date)}
                          </p>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
                              daysPastDue
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
