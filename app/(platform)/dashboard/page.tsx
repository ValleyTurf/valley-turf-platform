export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import KpiCard from "@/app/components/dashboard/KpiCard";
import ActivityFeed from "@/app/components/dashboard/ActivityFeed";
import { supabaseServer } from "@/lib/supabase-server";

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

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Customers"
            value={data.customers}
            icon="👥"
            subtitle="Synced from Jobber"
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
            <h2 className="text-2xl font-bold">Coming Next</h2>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-[#f7f6f1] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Revenue
                </p>

                <p className="mt-2 text-[#6b705c]">
                  Revenue this month, average ticket, and lifetime value.
                </p>
              </div>

              <div className="rounded-2xl bg-[#f7f6f1] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Subscriptions
                </p>

                <p className="mt-2 text-[#6b705c]">
                  Active recurring customers and service-plan breakdown.
                </p>
              </div>

              <div className="rounded-2xl bg-[#f7f6f1] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Campaign ROI
                </p>

                <p className="mt-2 text-[#6b705c]">
                  Scans, leads, customers, revenue, and conversion rates.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}