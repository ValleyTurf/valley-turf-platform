export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type RangeKey = "7" | "30" | "90" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7", label: "7 Days" },
  { key: "30", label: "30 Days" },
  { key: "90", label: "90 Days" },
  { key: "all", label: "All Time" },
];

function getCutoffDate(range: RangeKey): Date | null {
  if (range === "all") return null;

  const days = Number(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function parseDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown";
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Mobile/i.test(userAgent)) return "Mobile";
  return "Desktop";
}

function getArizonaDayKey(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
  });
}

function getArizonaWeekKey(value: string) {
  const date = new Date(value);
  const phoenixDate = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
  const dayOfWeek = phoenixDate.getDay();
  const weekStart = new Date(phoenixDate);
  weekStart.setDate(phoenixDate.getDate() - dayOfWeek);

  return weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const resolvedParams = await searchParams;
  const range = (["7", "30", "90", "all"].includes(resolvedParams.range ?? "")
    ? resolvedParams.range
    : "30") as RangeKey;

  const cutoff = getCutoffDate(range);

  let query = supabaseServer
    .from("scans")
    .select(
      `
      id,
      campaign_id,
      scanned_at,
      city,
      region,
      country,
      user_agent,
      referrer,
      campaigns (
        id,
        name,
        alias,
        slug
      )
    `
    )
    .order("scanned_at", { ascending: true });

  if (cutoff) {
    query = query.gte("scanned_at", cutoff.toISOString());
  }

  const { data: scans } = await query;

  const allScans = scans ?? [];
  const totalScans = allScans.length;

  const useWeeklyBuckets = range === "90" || range === "all";

  const bucketMap = new Map<string, number>();
  for (const scan of allScans) {
    const key = useWeeklyBuckets
      ? getArizonaWeekKey(scan.scanned_at)
      : getArizonaDayKey(scan.scanned_at);
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
  }
  const buckets = Array.from(bucketMap.entries()).slice(-30);
  const maxBucketCount = Math.max(1, ...buckets.map(([, count]) => count));

  const campaignMap = new Map<
    string,
    { name: string; slug: string; count: number }
  >();
  for (const scan of allScans) {
    const campaign = Array.isArray(scan.campaigns)
      ? scan.campaigns[0]
      : scan.campaigns;
    if (!campaign) continue;

    const key = campaign.id;
    const existing = campaignMap.get(key);
    const displayName = campaign.alias || campaign.name || campaign.slug;

    if (existing) {
      existing.count += 1;
    } else {
      campaignMap.set(key, {
        name: displayName,
        slug: campaign.slug,
        count: 1,
      });
    }
  }
  const campaignBreakdown = Array.from(campaignMap.values()).sort(
    (a, b) => b.count - a.count
  );
  const maxCampaignCount = Math.max(
    1,
    ...campaignBreakdown.map((c) => c.count)
  );

  const locationMap = new Map<string, number>();
  for (const scan of allScans) {
    const label =
      [scan.city, scan.region].filter(Boolean).join(", ") ||
      scan.country ||
      "Unknown";
    locationMap.set(label, (locationMap.get(label) ?? 0) + 1);
  }
  const topLocations = Array.from(locationMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxLocationCount = Math.max(1, ...topLocations.map(([, c]) => c));

  const deviceMap = new Map<string, number>();
  for (const scan of allScans) {
    const device = parseDevice(scan.user_agent);
    deviceMap.set(device, (deviceMap.get(device) ?? 0) + 1);
  }
  const deviceBreakdown = Array.from(deviceMap.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <main className="min-h-screen bg-[#F7F6F2] p-8 text-[#1F2937]">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-[#0E3B2E] hover:underline"
        >
          ? Back to Dashboard
        </Link>

        <section className="mt-4 rounded-3xl bg-gradient-to-r from-[#0E3B2E] to-[#2E6B3F] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#F2C94C]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-4xl font-bold">Analytics</h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Scan trends, campaign performance, and audience insights.
          </p>
        </section>

        <section className="mt-6 flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option.key}
              href={`/analytics?range=${option.key}`}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                range === option.key
                  ? "bg-[#0E3B2E] text-white"
                  : "border border-[#D9E4D4] bg-white text-[#0E3B2E] hover:bg-[#F0EEE8]"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
          <p className="text-xs text-[#6B7280]">Total Scans</p>
          <p className="mt-1 text-4xl font-bold text-[#0E3B2E]">
            {totalScans}
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#0E3B2E]">
            Scans Over Time
          </h2>

          {buckets.length > 0 ? (
            <div className="mt-6 flex items-end gap-2 overflow-x-auto pb-2">
              {buckets.map(([label, count]) => (
                <div
                  key={label}
                  className="flex min-w-[36px] flex-col items-center gap-2"
                >
                  <div className="flex h-40 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-[#2E6B3F]"
                      style={{
                        height: `${(count / maxBucketCount) * 100}%`,
                      }}
                      title={`${label}: ${count} scans`}
                    />
                  </div>
                  <p className="text-[10px] text-[#6B7280]">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6B7280]">
              No scan data in this range.
            </p>
          )}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#0E3B2E]">
              Scans by Campaign
            </h2>

            <div className="mt-5 space-y-3">
              {campaignBreakdown.length > 0 ? (
                campaignBreakdown.map((campaign) => (
                  <Link
                    key={campaign.slug}
                    href={`/campaigns/${campaign.slug}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-[#1F2937]">
                        {campaign.name}
                      </p>
                      <p className="text-[#6B7280]">{campaign.count}</p>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-[#F0EEE8]">
                      <div
                        className="h-2 rounded-full bg-[#D4A32A]"
                        style={{
                          width: `${
                            (campaign.count / maxCampaignCount) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-[#6B7280]">No data yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#0E3B2E]">
              Top Locations
            </h2>

            <div className="mt-5 space-y-3">
              {topLocations.length > 0 ? (
                topLocations.map(([label, count]) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-[#1F2937]">{label}</p>
                      <p className="text-[#6B7280]">{count}</p>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-[#F0EEE8]">
                      <div
                        className="h-2 rounded-full bg-[#2E6B3F]"
                        style={{
                          width: `${(count / maxLocationCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6B7280]">No data yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#0E3B2E]">
            Device Breakdown
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {deviceBreakdown.length > 0 ? (
              deviceBreakdown.map(([device, count]) => (
                <div
                  key={device}
                  className="rounded-xl bg-[#F7F6F2] p-4 text-center"
                >
                  <p className="text-2xl font-bold text-[#0E3B2E]">
                    {count}
                  </p>
                  <p className="mt-1 text-sm text-[#6B7280]">{device}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#6B7280]">No data yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

