export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

const pages = [
  {
    title: "Dashboard",
    icon: "📊",
    href: "/dashboard",
    description: "View scan analytics and business metrics",
  },
  {
    title: "QR Library",
    icon: "📚",
    href: "/codes",
    description: "Create and manage QR codes",
  },
  {
    title: "Campaigns",
    icon: "📣",
    href: "/campaigns",
    description: "Organize marketing campaigns",
  },
  {
    title: "Leads",
    icon: "👥",
    href: "/leads",
    description: "Track incoming customers",
  },
  {
    title: "Settings",
    icon: "⚙️",
    href: "/settings",
    description: "Platform configuration",
  },
];

function formatActivityDate(dateString: string | null) {
  if (!dateString) return "Recently";

  const date = new Date(dateString);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "Yesterday";

  return `${diffDays} days ago`;
}

export default async function Home() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [
    { count: totalScans },
    { count: todayScans },
    { count: weekScans },
    { count: totalCampaigns },
    { data: recentScans },
    { data: campaignsWithScans },
  ] = await Promise.all([
    supabaseServer.from("scans").select("*", { count: "exact", head: true }),

    supabaseServer
      .from("scans")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString()),

    supabaseServer
      .from("scans")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStart.toISOString()),

    supabaseServer.from("campaigns").select("*", {
      count: "exact",
      head: true,
    }),

    supabaseServer
      .from("scans")
      .select(
        `
        id,
        campaign_id,
        created_at,
        campaigns (
          id,
          name,
          alias,
          slug
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(6),

    supabaseServer
      .from("campaigns")
      .select(
        `
        id,
        name,
        alias,
        slug,
        scans (
          id
        )
      `
      ),
  ]);

  const topCampaign =
    campaignsWithScans
      ?.map((campaign) => ({
        ...campaign,
        scanCount: campaign.scans?.length ?? 0,
      }))
      .sort((a, b) => b.scanCount - a.scanCount)[0] ?? null;

  const stats = [
    {
      title: "Total Scans",
      value: totalScans ?? 0,
      helper: "All-time QR activity",
    },
    {
      title: "Today’s Scans",
      value: todayScans ?? 0,
      helper: "Since midnight",
    },
    {
      title: "This Week",
      value: weekScans ?? 0,
      helper: "Last 7 days",
    },
    {
      title: "Campaigns",
      value: totalCampaigns ?? 0,
      helper: "Active QR campaigns",
    },
  ];

  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#174734]">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <section className="rounded-3xl bg-[#174734] p-8 text-white shadow-xl lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#d4af37]">
                Marketing & Business Intelligence
              </p>

              <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
                Valley Turf Revival Platform
              </h1>

              <p className="mt-4 max-w-2xl text-white/75">
                Your command center for QR codes, campaigns, scans, and lead
                tracking.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/codes"
                className="rounded-xl bg-[#d4af37] px-5 py-3 text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
              >
                + Create QR
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-white/25 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View Dashboard
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.title}
                className="rounded-2xl bg-white/10 p-6 backdrop-blur"
              >
                <p className="text-sm text-white/70">{stat.title}</p>
                <p className="mt-2 text-5xl font-bold">{stat.value}</p>
                <p className="mt-2 text-sm text-white/55">{stat.helper}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl bg-white p-7 shadow">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold">Recent Activity</h2>

              <Link
                href="/dashboard"
                className="text-sm font-bold text-[#9c7a20] hover:underline"
              >
                View all
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              {recentScans && recentScans.length > 0 ? (
                recentScans.map((scan) => {
                  const campaign = Array.isArray(scan.campaigns)
                    ? scan.campaigns[0]
                    : scan.campaigns;

                  const campaignName =
                    campaign?.alias ||
                    campaign?.name ||
                    campaign?.slug ||
                    "QR code";

                  return (
                    <Link
                      key={scan.id}
                      href={
                        campaign?.slug
                          ? `/campaigns/${campaign.slug}`
                          : "/dashboard"
                      }
                      className="block rounded-2xl bg-[#f7f6f1] p-5 transition hover:bg-[#efeadf]"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-bold">{campaignName}</p>

                        <p className="text-sm text-[#6b705c]">
                          {formatActivityDate(scan.created_at)}
                        </p>
                      </div>

                      <p className="mt-1 text-sm text-[#6b705c]">
                        QR code scanned
                      </p>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-2xl bg-[#f7f6f1] p-5">
                  No scans yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-7 shadow">
            <h2 className="text-2xl font-bold">Top QR Code</h2>

            {topCampaign && topCampaign.scanCount > 0 ? (
              <div className="mt-6 rounded-2xl bg-[#f7f6f1] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                  Most Active
                </p>

                <h3 className="mt-3 text-3xl font-bold">
                  {topCampaign.alias || topCampaign.name || topCampaign.slug}
                </h3>

                <p className="mt-2 text-[#6b705c]">
                  {topCampaign.scanCount} total scans
                </p>

                <Link
                  href={`/campaigns/${topCampaign.slug}`}
                  className="mt-5 inline-block rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
                >
                  View Campaign
                </Link>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-[#f7f6f1] p-6 text-[#6b705c]">
                No campaign scan data yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-5 text-2xl font-bold">Platform</h2>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => (
              <Link
                key={page.title}
                href={page.href}
                className="rounded-2xl border border-[#d9d4c6] bg-white p-7 shadow transition hover:-translate-y-1 hover:border-[#d4af37] hover:shadow-lg"
              >
                <div className="text-4xl">{page.icon}</div>

                <h3 className="mt-4 text-2xl font-bold">{page.title}</h3>

                <p className="mt-2 text-[#6b705c]">{page.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}