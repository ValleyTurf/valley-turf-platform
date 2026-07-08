import { supabaseServer } from "@/lib/supabase-server";

export default async function Dashboard() {
  const supabase = supabaseServer;

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: scans } = await supabase
    .from("scans")
    .select("*")
    .order("scanned_at", { ascending: false });

  const totalScans = scans?.length ?? 0;

  const campaignStats =
    campaigns?.map((campaign) => {
      const count =
        scans?.filter((scan) => scan.campaign_id === campaign.id).length ?? 0;

      return {
        ...campaign,
        scans: count,
      };
    }) ?? [];

  return (
    <main className="min-h-screen bg-green-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold text-green-900">
          Valley Turf Revival Dashboard
        </h1>

        <p className="mt-2 text-gray-600">
          QR scan tracking and campaign performance
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Total Scans</p>
            <p className="mt-2 text-4xl font-bold text-green-900">
              {totalScans}
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Campaigns</p>
            <p className="mt-2 text-4xl font-bold text-green-900">
              {campaigns?.length ?? 0}
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Latest Scan</p>
            <p className="mt-2 text-lg font-semibold text-green-900">
              {scans?.[0]?.scanned_at
                ? new Date(scans[0].scanned_at).toLocaleString()
                : "No scans yet"}
            </p>
          </div>
        </div>

        <section className="mt-10 rounded-xl bg-white p-6 shadow">
          <h2 className="text-2xl font-bold text-green-900">
            Campaign Performance
          </h2>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="py-3">Campaign</th>
                  <th className="py-3">Slug</th>
                  <th className="py-3">Destination</th>
                  <th className="py-3 text-right">Scans</th>
                </tr>
              </thead>
              <tbody>
                {campaignStats.map((campaign) => (
                  <tr key={campaign.id} className="border-b">
                    <td className="py-3 font-medium">{campaign.name}</td>
                    <td className="py-3">/{campaign.slug}</td>
                    <td className="py-3 text-sm text-gray-600">
                      {campaign.destination}
                    </td>
                    <td className="py-3 text-right font-bold">
                      {campaign.scans}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 rounded-xl bg-white p-6 shadow">
          <h2 className="text-2xl font-bold text-green-900">Recent Scans</h2>

          <div className="mt-4 space-y-3">
            {scans?.slice(0, 25).map((scan) => {
              const campaign = campaigns?.find(
                (campaign) => campaign.id === scan.campaign_id
              );

              return (
                <div
                  key={scan.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">
                      {campaign?.name ?? "Unknown Campaign"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {scan.user_agent ?? "No device info"}
                    </p>
                  </div>

                  <p className="text-sm text-gray-500">
                    {scan.scanned_at
                      ? new Date(scan.scanned_at).toLocaleString()
                      : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}