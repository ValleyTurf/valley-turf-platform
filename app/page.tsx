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
    description: "Manage your QR codes",
  },
  {
    title: "Campaigns",
    icon: "📣",
    href: "/campaigns",
    description: "Create and organize campaigns",
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
  const [
    { count: totalScans },
    { count: totalCampaigns },
    { data: recentScans },
  ] = await Promise.all([
    supabaseServer.from("scans").select("*", { count: "exact", head: true }),
    supabaseServer.from("campaigns").select("*", {
      count: "exact",
      head: true,
    }),
    supabaseServer
      .from("scans")
      .select(
        `
        id,
        created_at,
        campaigns (
          name,
          alias,
          slug
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const stats = [
    {
      title: "Total Scans",
      value: totalScans ?? 0,
    },
    {
      title: "Campaigns",
      value: totalCampaigns ?? 0,
    },
    {
      title: "Leads",
      value: 0,
    },
  ];

  return (
    <main className="min-h-screen bg-[#f5f4ef]">
      <div className="mx-auto max-w-7xl px-8 py-10">
        <div className="rounded-3xl bg-[#174734] p-10 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.35em] text-[#d4af37]">
            Marketing & Business Intelligence
          </p>

          <h1 className="mt-2 text-5xl font-bold">
            Valley Turf Revival Platform
          </h1>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.title}
                className="rounded-2xl bg-white/10 p-6 backdrop-blur"
              >
                <p className="text-sm text-white/70">{stat.title}</p>
                <p className="mt-2 text-5xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="mb-5 text-2xl font-bold text-[#174734]">Platform</h2>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => (
              <Link
                key={page.title}
                href={page.href}
                className="rounded-2xl border border-[#d9d4c6] bg-white p-7 shadow transition hover:-translate-y-1 hover:border-[#d4af37] hover:shadow-lg"
              >
                <div className="text-4xl">{page.icon}</div>

                <h3 className="mt-4 text-2xl font-bold text-[#174734]">
                  {page.title}
                </h3>

                <p className="mt-2 text-gray-600">{page.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-3xl bg-white p-8 shadow">
          <h2 className="text-2xl font-bold text-[#174734]">Recent Activity</h2>

          <div className="mt-6 space-y-4">
            {recentScans && recentScans.length > 0 ? (
              recentScans.map((scan) => {
                const campaign = Array.isArray(scan.campaigns)
                  ? scan.campaigns[0]
                  : scan.campaigns;

                const campaignName =
                  campaign?.alias || campaign?.name || campaign?.slug || "QR code";

                return (
                  <div
                    key={scan.id}
                    className="rounded-xl bg-[#f7f6f1] p-4 text-[#174734]"
                  >
                    <span className="font-semibold">{campaignName}</span>{" "}
                    scanned {formatActivityDate(scan.created_at)}
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl bg-[#f7f6f1] p-4 text-[#174734]">
                No scans yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}