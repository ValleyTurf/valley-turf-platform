import QRCode from "qrcode";
import { supabaseServer } from "@/lib/supabase-server";

function formatArizonaTime(value: string | null) {
  if (!value) return "No scans yet";

  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function CampaignDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: campaign } = await supabaseServer
    .from("campaigns")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!campaign) {
    return (
      <main className="min-h-screen bg-[#F7F6F2] p-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-[#0E3B2E]">
            Campaign not found
          </h1>
          <p className="mt-2 text-[#6B7280]">
            No campaign exists for slug: {slug}
          </p>
        </div>
      </main>
    );
  }

  const { data: scans } = await supabaseServer
    .from("scans")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("scanned_at", { ascending: false });

  const campaignScans = scans ?? [];
  const trackingUrl = `https://go.valleyturfrevival.com/r/${campaign.slug}`;

  const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 420,
  });

  return (
    <main className="min-h-screen bg-[#F7F6F2] p-8 text-[#1F2937]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#0E3B2E] to-[#2E6B3F] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#F2C94C]">
            Campaign Details
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {campaign.alias ?? campaign.name}
          </h1>

          <p className="mt-3 max-w-2xl text-green-50">
            View QR code, tracking URL, destination, and scan activity for this
            campaign.
          </p>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-2xl font-bold text-[#0E3B2E]">
              Campaign Overview
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-[#F7F6F2] p-4">
                <p className="text-xs text-[#6B7280]">Total Scans</p>
                <p className="mt-2 text-4xl font-bold text-[#0E3B2E]">
                  {campaignScans.length}
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F6F2] p-4">
                <p className="text-xs text-[#6B7280]">Slug</p>
                <p className="mt-2 break-all text-lg font-bold text-[#0E3B2E]">
                  /r/{campaign.slug}
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F6F2] p-4">
                <p className="text-xs text-[#6B7280]">Last Scan</p>
                <p className="mt-2 text-sm font-bold text-[#0E3B2E]">
                  {formatArizonaTime(campaignScans[0]?.scanned_at ?? null)}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-[#F7F6F2] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                Tracking URL
              </p>
              <p className="mt-2 break-all text-sm text-[#1F2937]">
                {trackingUrl}
              </p>
            </div>

            <div className="mt-4 rounded-xl bg-[#F7F6F2] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                Destination
              </p>
              <p className="mt-2 break-all text-sm text-[#1F2937]">
                {campaign.destination}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-[#0E3B2E]">QR Code</h2>

            <div className="mt-5 flex justify-center rounded-xl border border-[#D9E4D4] bg-white p-4">
              <img
                src={qrDataUrl}
                alt={`${campaign.alias ?? campaign.name} QR code`}
                className="h-72 w-72"
              />
            </div>

            <a
              href={qrDataUrl}
              download={`${campaign.slug}-qr.png`}
              className="mt-5 inline-flex w-full justify-center rounded-xl bg-[#0E3B2E] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2E6B3F]"
            >
              Download PNG
            </a>

            <a
              href="/codes"
              className="mt-3 inline-flex w-full justify-center rounded-xl border border-[#0E3B2E] bg-white px-4 py-3 text-sm font-semibold text-[#0E3B2E] transition hover:bg-[#F7F6F2]"
            >
              Back to QR Library
            </a>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#0E3B2E]">
            Recent Activity
          </h2>

          <div className="mt-5 space-y-3">
            {campaignScans.slice(0, 50).map((scan) => (
              <div
                key={scan.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-[#D9E4D4] bg-[#F7F6F2] p-4 md:flex-row md:items-center"
              >
                <div>
                  <p className="font-semibold text-[#0E3B2E]">
                    QR Scan Recorded
                  </p>
                  <p className="text-sm text-[#6B7280]">
                    {scan.user_agent ?? "No device info"}
                  </p>
                </div>

                <p className="text-sm font-medium text-[#1F2937]">
                  {formatArizonaTime(scan.scanned_at)}
                </p>
              </div>
            ))}

            {campaignScans.length === 0 && (
              <p className="text-[#6B7280]">No scans recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
