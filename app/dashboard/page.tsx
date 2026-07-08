import { supabaseServer } from "@/lib/supabase-server";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek() {
  const date = startOfToday();
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value: string | null) {
  if (!value) return "No scans yet";
  return new Date(value).toLocaleString();
}

export default async function DashboardPage() {
  const { data: campaigns } = await supabaseServer
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: scans } = await supabaseServer
    .from("scans")
    .select("*")
    .order("scanned_at", { ascending: false });

  const allCampaigns = campaigns ?? [];
  const allScans = scans ?? [];

  const scansToday = allScans.filter(
    (scan) => scan.scanned_at && new Date(scan.scanned_at) >= startOfToday()
  ).length;

  const scansThisWeek = allScans.filter(
    (scan) => scan.scanned_at && new Date(scan.scanned_at) >= startOfWeek()
  ).length;

  const scansThisMonth = allScans.filter(
    (scan) => scan.scanned_at && new Date(scan.scanned_at) >= startOfMonth()
  ).length;

  const campaignStats = allCampaigns
    .map((campaign) => {
      const campaignScans = allScans.filter(
        (scan) => scan.campaign_id === campaign.id
      );

      return {
        ...campaign,
        displayName: campaign.alias ?? campaign.name,
        totalScans: campaignScans.length,
        lastScan: campaignScans[0]?.scanned_at ?? null,
      };
    })
    .sort((a, b) => b.totalScans - a.totalScans);

  const topCampaign = campaignStats[0];
  const maxScans = Math.max(...campaignStats.map((c) => c.totalScans), 1);

  return (
    <main className="min-h-screen bg-[var(--vtr-background)] p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#0E3B2E] to-[#2E6B3F] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#F2C94C]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            Marketing Dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Track QR scans, campaign performance, and truck marketing activity.
          </p>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-4">
          {[
            ["Today", scansToday],
            ["This Week", scansThisWeek],
            ["This Month", scansThisMonth],
            ["Total Scans", allScans.length],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--vtr-border)] bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-semibold text-[var(--vtr-text-light)]">
                {label}
              </p>
              <p className="mt-3 text-4xl font-bold text-[var(--vtr-green-dark)]">
                {value}
              </p>
              <div className="mt-4 h-1 w-16 rounded-full bg-[var(--vtr-gold)]" />
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--vtr-border)] bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-2xl font-bold text-[var(--vtr-green-dark)]">
              Campaign Leaderboard
            </h2>

            <div className="mt-6 space-y-5">
              {campaignStats.map((campaign) => {
                const percentage = Math.round(
                  (campaign.totalScans / maxScans) * 100
                );

                return (
                  <div key={campaign.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[var(--vtr-text)]">
                          {campaign.displayName}
                        </p>
                        <p className="text-xs text-[var(--vtr-text-light)]">
                          /r/{campaign.slug}
                        </p>
                      </div>

                      <p className="text-lg font-bold text-[var(--vtr-green-dark)]">
                        {campaign.totalScans}
                      </p>
                    </div>

                    <div className="mt-2 h-3 rounded-full bg-[#EAF3E4]">
                      <div
                        className="h-3 rounded-full bg-[var(--vtr-green-dark)]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <p className="mt-1 text-xs text-[var(--vtr-text-light)]">
                      Last scan: {formatDate(campaign.lastScan)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--vtr-border)] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-[var(--vtr-green-dark)]">
              Top Campaign
            </h2>

            {topCampaign ? (
              <div className="mt-6 rounded-2xl border border-[var(--vtr-border)] bg-[var(--vtr-background)] p-5">
                <p className="text-sm text-[var(--vtr-text-light)]">
                  Current leader
                </p>
                <p className="mt-2 text-2xl font-bold text-[var(--vtr-green-dark)]">
                  {topCampaign.displayName}
                </p>
                <p className="mt-4 text-5xl font-bold text-[var(--vtr-green-dark)]">
                  {topCampaign.totalScans}
                </p>
                <p className="text-sm text-[var(--vtr-text-light)]">
                  total scans
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[var(--vtr-text-light)]">
                No campaigns yet.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--vtr-border)] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[var(--vtr-green-dark)]">
            Latest Activity
          </h2>

          <div className="mt-5 space-y-3">
            {allScans.slice(0, 25).map((scan) => {
              const campaign = allCampaigns.find(
                (campaign) => campaign.id === scan.campaign_id
              );

              return (
                <div
                  key={scan.id}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--vtr-border)] bg-[var(--vtr-background)] p-4 md:flex-row md:items-center"
                >
                  <div>
                    <p className="font-semibold text-[var(--vtr-green-dark)]">
                      {campaign?.alias ?? campaign?.name ?? "Unknown Campaign"}
                    </p>
                    <p className="text-sm text-[var(--vtr-text-light)]">
                      {campaign?.slug ? `/r/${campaign.slug}` : "No slug"}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm font-medium text-[var(--vtr-text)]">
                      {formatDate(scan.scanned_at)}
                    </p>
                    <p className="text-xs text-[var(--vtr-text-light)]">
                      {scan.user_agent ?? "No device info"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}