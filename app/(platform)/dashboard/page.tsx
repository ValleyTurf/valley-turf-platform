export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import KpiCard from "@/app/components/dashboard/KpiCard";
import ActivityFeed from "@/app/components/dashboard/ActivityFeed";
import { supabaseServer } from "@/lib/supabase-server";
import { getAllCampaignRoi } from "@/lib/campaignRoi";
import { formatCurrency, formatNumber } from "@/lib/format";

const PHOENIX_TIME_ZONE = "America/Phoenix";

type ActivityItem = {
  id: string;
  scanned_at: string;
  city: string | null;
  region: string | null;
  country: string | null;
  campaigns:
    | Array<{
        name: string | null;
        alias: string | null;
        slug: string;
      }>
    | null;
};

type DashboardData = {
  customers: number;
  campaigns: number;
  leads: number;
  scansToday: number;
  scansWeek: number;
  activity: ActivityItem[];
  outstandingBalance: number;
  outstandingCount: number;
  revenueThisMonth: number;
  revenueLastMonthToDate: number;
  recurringCustomersThisMonth: number;
  campaignRevenue: number;
  campaignLeads: number;
};

function getPhoenixDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(
      parts.find((part) => part.type === "year")?.value ?? 0
    ),
    month: Number(
      parts.find((part) => part.type === "month")?.value ?? 1
    ),
    day: Number(
      parts.find((part) => part.type === "day")?.value ?? 1
    ),
  };
}

function getPhoenixStartOfDayUtc(date = new Date()): Date {
  const { year, month, day } = getPhoenixDateParts(date);

  return new Date(
    Date.UTC(year, month - 1, day, 7, 0, 0, 0)
  );
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRevenueComparison(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "No change" : "New";
  }

  const change = (current - previous) / previous;

  if (change > 0) return `↑ ${Math.round(change * 100)}%`;
  if (change < 0) return `↓ ${Math.round(Math.abs(change) * 100)}%`;

  return "No change";
}

async function fetchOutstandingSummary(): Promise<{
  total: number;
  count: number;
}> {
  const { data, error } = await supabaseServer
    .from("outstanding_invoices")
    .select("outstanding_balance");

  if (error) throw error;

  const rows = (data ?? []) as { outstanding_balance: number | string }[];

  return {
    total: rows.reduce((sum, row) => sum + toNumber(row.outstanding_balance), 0),
    count: rows.length,
  };
}

// This-month-to-date vs the same number of days into last month, so a
// snapshot taken on the 5th doesn't compare against a full prior month.
async function fetchMonthlyRevenue(): Promise<{
  thisMonth: number;
  lastMonthToDate: number;
}> {
  const { year, month, day } = getPhoenixDateParts();

  const thisMonthStart = formatDateInput(new Date(Date.UTC(year, month - 1, 1)));
  const today = formatDateInput(new Date(Date.UTC(year, month - 1, day)));
  const lastMonthStart = formatDateInput(new Date(Date.UTC(year, month - 2, 1)));
  const lastMonthSameDay = formatDateInput(new Date(Date.UTC(year, month - 2, day)));

  const [thisMonthResult, lastMonthResult] = await Promise.all([
    supabaseServer
      .from("invoice_financials")
      .select("invoice_total")
      .gte("issue_date", thisMonthStart)
      .lte("issue_date", today),
    supabaseServer
      .from("invoice_financials")
      .select("invoice_total")
      .gte("issue_date", lastMonthStart)
      .lte("issue_date", lastMonthSameDay),
  ]);

  if (thisMonthResult.error) throw thisMonthResult.error;
  if (lastMonthResult.error) throw lastMonthResult.error;

  const sum = (rows: { invoice_total: number | string }[] | null) =>
    (rows ?? []).reduce((total, row) => total + toNumber(row.invoice_total), 0);

  return {
    thisMonth: sum(thisMonthResult.data),
    lastMonthToDate: sum(lastMonthResult.data),
  };
}

// Same "is this job recurring" signal used on /recurring-services — a
// job's own job_type from Jobber, not the fragile category-keyword match.
async function fetchRecurringCustomersThisMonth(): Promise<number> {
  const { year, month } = getPhoenixDateParts();

  const monthStart = `${formatDateInput(
    new Date(Date.UTC(year, month - 1, 1)),
  )}T00:00:00-07:00`;
  const monthEnd = `${formatDateInput(
    new Date(Date.UTC(year, month, 0)),
  )}T23:59:59-07:00`;

  const { data: jobsData, error: jobsError } = await supabaseServer
    .from("job_service_category")
    .select("jobber_job_id")
    .ilike("job_type", "%recur%");

  if (jobsError) throw jobsError;

  const recurringJobIds = (jobsData ?? []).map(
    (row: { jobber_job_id: string }) => row.jobber_job_id,
  );

  if (recurringJobIds.length === 0) {
    return 0;
  }

  const { data: visitsData, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_client_id")
    .in("jobber_job_id", recurringJobIds)
    .gte("start_at", monthStart)
    .lte("start_at", monthEnd);

  if (visitsError) throw visitsError;

  const uniqueCustomers = new Set(
    (visitsData ?? [])
      .map((row: { jobber_client_id: string | null }) => row.jobber_client_id)
      .filter(Boolean),
  );

  return uniqueCustomers.size;
}

async function fetchCampaignSummary(): Promise<{
  revenue: number;
  leads: number;
}> {
  const allRoi = await getAllCampaignRoi();

  let revenue = 0;
  let leads = 0;

  for (const roi of allRoi.values()) {
    revenue += roi.revenue;
    leads += roi.totalLeads;
  }

  return { revenue, leads };
}

async function getDashboardData(): Promise<DashboardData> {
  const phoenixTodayStart = getPhoenixStartOfDayUtc();

  const phoenixWeekStart = new Date(phoenixTodayStart);

  phoenixWeekStart.setUTCDate(
    phoenixWeekStart.getUTCDate() - 7
  );

  const [
    customersResult,
    campaignsResult,
    leadsResult,
    scansTodayResult,
    scansWeekResult,
    activityResult,
    outstandingSummary,
    monthlyRevenue,
    recurringCustomersThisMonth,
    campaignSummary,
  ] = await Promise.all([
    supabaseServer
      .from("customers")
      .select("*", {
        count: "exact",
        head: true,
      }),

    supabaseServer
      .from("campaigns")
      .select("*", {
        count: "exact",
        head: true,
      }),

    supabaseServer
      .from("leads")
      .select("*", {
        count: "exact",
        head: true,
      }),

    supabaseServer
      .from("scans")
      .select("*", {
        count: "exact",
        head: true,
      })
      .gte(
        "scanned_at",
        phoenixTodayStart.toISOString()
      ),

    supabaseServer
      .from("scans")
      .select("*", {
        count: "exact",
        head: true,
      })
      .gte(
        "scanned_at",
        phoenixWeekStart.toISOString()
      ),

    supabaseServer
      .from("scans")
      .select(`
        id,
        scanned_at,
        city,
        region,
        country,
        campaigns (
          name,
          alias,
          slug
        )
      `)
      .order("scanned_at", {
        ascending: false,
      })
      .limit(10),

    fetchOutstandingSummary(),
    fetchMonthlyRevenue(),
    fetchRecurringCustomersThisMonth(),
    fetchCampaignSummary(),
  ]);

  const errors = [
    customersResult.error,
    campaignsResult.error,
    leadsResult.error,
    scansTodayResult.error,
    scansWeekResult.error,
    activityResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      errors
        .map((error) => error?.message)
        .filter(Boolean)
        .join(", ")
    );
  }

  return {
    customers: customersResult.count ?? 0,
    campaigns: campaignsResult.count ?? 0,
    leads: leadsResult.count ?? 0,
    scansToday: scansTodayResult.count ?? 0,
    scansWeek: scansWeekResult.count ?? 0,
    activity: (activityResult.data ?? []) as ActivityItem[],
    outstandingBalance: outstandingSummary.total,
    outstandingCount: outstandingSummary.count,
    revenueThisMonth: monthlyRevenue.thisMonth,
    revenueLastMonthToDate: monthlyRevenue.lastMonthToDate,
    recurringCustomersThisMonth,
    campaignRevenue: campaignSummary.revenue,
    campaignLeads: campaignSummary.leads,
  };
}

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  let errorMessage: string | null = null;

  try {
    data = await getDashboardData();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Dashboard data could not be loaded.";
  }

  if (!data || errorMessage) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl bg-white p-8 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Business Intelligence
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Dashboard could not be loaded
            </h1>

            <p className="mt-4 text-[#6b705c]">
              {errorMessage ?? "No dashboard data was returned."}
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
            >
              Back Home
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Business Intelligence
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Valley Turf Revival Dashboard
            </h1>

            <p className="mt-2 text-[#6b705c]">
              Live customer, campaign, lead, and QR scan metrics.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/customers"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              View Customers
            </Link>

            <Link
              href="/"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Home
            </Link>
          </div>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            title="Customers"
            value={data.customers}
            icon="👥"
            subtitle="Synced from Jobber"
          />

          <KpiCard
            title="Outstanding"
            value={formatCurrency(data.outstandingBalance)}
            icon="💸"
            subtitle={`${formatNumber(data.outstandingCount)} unpaid invoice${
              data.outstandingCount === 1 ? "" : "s"
            }`}
          />

          <KpiCard
            title="Scans Today"
            value={data.scansToday}
            icon="📱"
            subtitle="Since midnight Arizona time"
          />

          <KpiCard
            title="Scans This Week"
            value={data.scansWeek}
            icon="📅"
            subtitle="Last 7 days"
          />

          <KpiCard
            title="Campaigns"
            value={data.campaigns}
            icon="📣"
            subtitle="Marketing campaigns"
          />

          <KpiCard
            title="Leads"
            value={data.leads}
            icon="👤"
            subtitle="Stored in Supabase"
          />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <ActivityFeed activity={data.activity} />

          <div className="rounded-3xl bg-white p-8 shadow">
            <h2 className="text-2xl font-bold">Snapshot</h2>

            <div className="mt-6 space-y-4">
              <Link
                href="/revenue"
                className="block rounded-2xl bg-[#f7f6f1] p-5 transition hover:bg-[#eef4ee]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Revenue
                </p>

                <p className="mt-2 text-2xl font-bold text-[#174734]">
                  {formatCurrency(data.revenueThisMonth)}
                </p>

                <p className="mt-1 text-sm text-[#6b705c]">
                  {formatRevenueComparison(
                    data.revenueThisMonth,
                    data.revenueLastMonthToDate,
                  )}{" "}
                  vs last month to date
                </p>
              </Link>

              <Link
                href="/recurring-services"
                className="block rounded-2xl bg-[#f7f6f1] p-5 transition hover:bg-[#eef4ee]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Recurring Service
                </p>

                <p className="mt-2 text-2xl font-bold text-[#174734]">
                  {formatNumber(data.recurringCustomersThisMonth)} customer
                  {data.recurringCustomersThisMonth === 1 ? "" : "s"}
                </p>

                <p className="mt-1 text-sm text-[#6b705c]">
                  Scheduled for recurring service this month
                </p>
              </Link>

              <Link
                href="/codes"
                className="block rounded-2xl bg-[#f7f6f1] p-5 transition hover:bg-[#eef4ee]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Campaign ROI
                </p>

                <p className="mt-2 text-2xl font-bold text-[#174734]">
                  {formatCurrency(data.campaignRevenue)}
                </p>

                <p className="mt-1 text-sm text-[#6b705c]">
                  Attributed revenue from {formatNumber(data.campaignLeads)}{" "}
                  campaign lead{data.campaignLeads === 1 ? "" : "s"}
                </p>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}