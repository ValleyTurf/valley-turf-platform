import { supabaseServer } from "@/lib/supabase-server";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek() {
  const date = startOfToday();
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setDate(diff);
  return date;
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
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

  const allScans = scans ?? [];
  const allCampaigns = campaigns ?? [];

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

  return (
    <main className="min-h-screen bg-green-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-bold text-green-950">
              Valley Turf Revival Analytics
            </h1>
            <p className="mt-2 text-gray-600">
              QR scan performance across trucks, print pieces, and campaigns.
            </p>
          </div>

          <a
            href="/codes"
            className="rounded-lg bg-green-900 px-5 py-3 text-sm font-semibold text-white"
          >
            View QR Library
          </a>
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

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="py-3">Campaign</th>
                    <th className="py-3">Slug</th>
                    <th className="py-3">Last Scan</th>
                    <th className="py-3 text-right">Scans</th>
                  </tr>
                </thead>

                <tbody>
                  {campaignStats.map((campaign) => (
                    <tr key={campaign.id} className="border-b">
                      <td className="py-4">
                        <p className="font-semibold text-green-950">
                          {campaign.displayName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {campaign.name}
                        </p>
                      </td>

                      <td className="py-4 text-gray-600">
                        /r/{campaign.slug}
                      </td>

                      <td className="py-4 text-gray-600">
                        {formatDate(campaign.lastScan)}
                      </td>

                      <td className="py-4 text-right text-lg font-bold text-green-950">
                        {campaign.totalScans}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-2xl font-bold text-green-950">
              Top Campaign
            </h2>

            {campaignStats[0] ? (
              <div className="mt-5 rounded-lg border bg-green-50 p-5">
                <p className="text-sm text-gray-500">Current leader</p>
                <p className="mt-2 text-2xl font-bold text-green-950">
                  {campaignStats[0].displayName}
                </p>
                <p className="mt-2 text-4xl font-bold text-green-950">
                  {campaignStats[0].totalScans}
                </p>
                <p className="text-sm text-gray-500">total scans</p>
              </div>
            ) : (
              <p className="mt-4 text-gray-500">No campaigns yet.</p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-2xl font-bold text-green-950">
            Latest Scan Activity
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