import { supabaseServer } from "@/lib/supabase-server";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek() {
  const date = startOfToday();
  const day = date.getDay();
  date.setDate(date.getDate() - day);
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

  const todayStart = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();

  const scansToday = allScans.filter(
    (scan) => scan.scanned_at && new Date(scan.scanned_at) >= todayStart
  ).length;

  const scansThisWeek = allScans.filter(
    (scan) => scan.scanned_at && new Date(scan.scanned_at) >= weekStart
  ).length;

  const scansThisMonth = allScans.filter(
    (scan) => scan.scanned_at && new Date(scan.scanned_at) >= monthStart
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

  const truckCampaigns = campaignStats.filter((campaign) =>
    ["truck", "truck2"].includes(campaign.slug)
  );

  const inactiveCampaigns = campaignStats.filter(
    (campaign) => campaign.totalScans === 0
  );

  return (
    <main className="min-h-screen bg-green-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-bold text-green-950">
              Valley Turf Revival Dashboard
            </h1>
            <p className="mt-2 text-gray-600">
              Marketing performance, QR scans, and campaign activity.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href="/codes"
              className="rounded-lg bg-green-900 px-5 py-3 text-sm font-semibold text-white"
            >
              QR Code Library
            </a>
          </div>
        </div>

        <section className="mt-8 grid gap-6 md:grid-cols-4">
          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Today</p>
            <p className="mt-2 text-4xl font-bold text-green-950">
              {scansToday}
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">This Week</p>
            <p className="mt-2 text-4xl font-bold text-green-950">
              {scansThisWeek}
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">This Month</p>
            <p className="mt-2 text-4xl font-bold text-green-950">
              {scansThisMonth}
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Total Scans</p>
            <p className="mt-2 text-4xl font-bold text-green-950">
              {allScans.length}
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow lg:col-span-2">
            <h2 className="text-2xl font-bold text-green-950">
              Campaign Leaderboard
            </h2>

            <div className="mt-5 space-y-5">
              {campaignStats.map((campaign) => {
                const percentage = Math.round(
                  (campaign.totalScans / maxScans) * 100
                );

                return (
                  <div key={campaign.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-green-950">
                          {campaign.displayName}
                        </p>
                        <p className="text-xs text-gray-500">
                          /r/{campaign.slug}
                        </p>
                      </div>

                      <p className="text-lg font-bold text-green-950">
                        {campaign.totalScans}
                      </p>
                    </div>

                    <div className="mt-2 h-3 rounded-full bg-green-100">
                      <div
                        className="h-3 rounded-full bg-green-900"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <p className="mt-1 text-xs text-gray-500">
                      Last scan: {formatDate(campaign.lastScan)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow">
              <h2 className="text-2xl font-bold text-green-950">
                Top Campaign
              </h2>

              {topCampaign ? (
                <div className="mt-5 rounded-lg border bg-green-50 p-5">
                  <p className="text-sm text-gray-500">Current leader</p>
                  <p className="mt-2 text-2xl font-bold text-green-950">
                    {topCampaign.displayName}
                  </p>
                  <p className="mt-3 text-5xl font-bold text-green-950">
                    {topCampaign.totalScans}
                  </p>
                  <p className="text-sm text-gray-500">total scans</p>
                </div>
              ) : (
                <p className="mt-4 text-gray-500">No campaigns yet.</p>
              )}
            </div>

            <div className="rounded-xl bg-white p-6 shadow">
              <h2 className="text-2xl font-bold text-green-950">
                Needs Attention
              </h2>

              {inactiveCampaigns.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {inactiveCampaigns.slice(0, 5).map((campaign) => (
                    <div
                      key={campaign.id}
                      className="rounded-lg border bg-gray-50 p-3"
                    >
                      <p className="font-semibold text-green-950">
                        {campaign.displayName}
                      </p>
                      <p className="text-xs text-gray-500">
                        No scans recorded yet.
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-gray-500">
                  All campaigns have at least one scan.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-2xl font-bold text-green-950">
            Truck Performance
          </h2>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {truckCampaigns.map((truck) => (
              <div key={truck.id} className="rounded-xl border bg-green-50 p-5">
                <p className="text-sm text-gray-500">Vehicle campaign</p>
                <p className="mt-2 text-2xl font-bold text-green-950">
                  {truck.displayName}
                </p>
                <p className="mt-3 text-5xl font-bold text-green-950">
                  {truck.totalScans}
                </p>
                <p className="text-sm text-gray-500">total scans</p>
                <p className="mt-3 text-xs text-gray-500">
                  Last scan: {formatDate(truck.lastScan)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-2xl font-bold text-green-950">
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
                  className="flex flex-col justify-between gap-2 rounded-lg border p-4 md:flex-row md:items-center"
                >
                  <div>
                    <p className="font-semibold text-green-950">
                      {campaign?.alias ?? campaign?.name ?? "Unknown Campaign"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {campaign?.slug ? `/r/${campaign.slug}` : "No slug"}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm font-medium text-gray-700">
                      {formatDate(scan.scanned_at)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {scan.user_agent ?? "No device info"}
                    </p>
                  </div>
                </div>
              );
            })}

            {allScans.length === 0 && (
              <p className="text-gray-500">No scans recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}