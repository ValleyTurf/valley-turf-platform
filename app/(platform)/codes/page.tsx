export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { generateBrandedQrCode } from "@/lib/qrcode";
import { getAllCampaignRoi } from "@/lib/campaignRoi";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import { formatCurrency } from "@/lib/format";

type Channel = "qr" | "social";

function formatArizonaTime(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;

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

function normalizeChannel(value: unknown): Channel {
  return value === "social" ? "social" : "qr";
}

async function createCampaign(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const destination = String(formData.get("destination") ?? "").trim();
  const captureLeads = formData.get("capture_leads") === "on";
  const channel = normalizeChannel(formData.get("channel"));

  if (!name || !slug || !destination) return;

  await supabaseServer.from("campaigns").insert({
    name,
    alias: alias || null,
    slug,
    destination,
    capture_leads: captureLeads,
    channel,
  });

  revalidatePath("/codes");
  revalidatePath("/dashboard");
}

export default async function CodesPage() {
  const { data: campaigns } = await supabaseServer
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: scans } = await supabaseServer
    .from("scans")
    .select("*")
    .order("scanned_at", { ascending: false });

  const roiByCampaign = await getAllCampaignRoi();

  const baseUrl = "https://go.valleyturfrevival.com/r";

  const campaignsWithStats = await Promise.all(
    (campaigns ?? []).map(async (campaign) => {
      const trackingUrl = `${baseUrl}/${campaign.slug}`;
      const channel = normalizeChannel(campaign.channel);

      const campaignScans =
        scans?.filter((scan) => scan.campaign_id === campaign.id) ?? [];

      // Only QR-channel campaigns need a rendered code — social/bio links
      // are shared as plain URLs, so skip the (relatively expensive) render.
      const qrDataUrl =
        channel === "qr" ? await generateBrandedQrCode(trackingUrl) : null;

      const roi = roiByCampaign.get(campaign.id) ?? null;

      return {
        ...campaign,
        channel,
        displayName: campaign.alias ?? campaign.name,
        trackingUrl,
        qrDataUrl,
        totalScans: campaignScans.length,
        lastScan: campaignScans[0]?.scanned_at ?? null,
        revenue: roi?.revenue ?? 0,
        roiPercent: roi?.roiPercent ?? null,
      };
    })
  );

  const qrCampaigns = campaignsWithStats.filter((c) => c.channel === "qr");
  const socialCampaigns = campaignsWithStats.filter(
    (c) => c.channel === "social"
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] p-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#174734] to-[#226246] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#d4af37]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-4xl font-bold">Links & QR Codes</h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Create, download, and track every trackable link — printed QR
            codes and social/bio links alike.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">
            New Campaign
          </h2>

          <form action={createCampaign} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Type
              </label>
              <select
                name="channel"
                defaultValue="qr"
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] bg-white p-3 outline-none focus:border-[#d4af37]"
              >
                <option value="qr">QR Code (printed / physical)</option>
                <option value="social">Social Media / Bio Link</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Campaign Name
              </label>
              <input
                name="name"
                placeholder="Truck 3 QR"
                required
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Display Alias
              </label>
              <input
                name="alias"
                placeholder="Ford F-250 / Instagram Bio"
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Slug
              </label>
              <input
                name="slug"
                placeholder="truck3"
                required
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
              <p className="mt-1 text-xs text-[#6b705c]">
                Creates: go.valleyturfrevival.com/r/truck3
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Destination URL
              </label>
              <input
                name="destination"
                placeholder="https://valleyturfrevival.com"
                required
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="capture_leads"
                name="capture_leads"
                className="h-4 w-4 rounded border-[#e7e2d5] text-[#174734] focus:ring-[#d4af37]"
              />
              <label
                htmlFor="capture_leads"
                className="text-sm font-semibold text-[#174734]"
              >
                Capture lead info before redirecting (shows a quick
                name/phone/email form with a skip option — leave off for
                review or social links)
              </label>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-[#174734] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#226246]"
              >
                + Create Campaign
              </button>
            </div>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-[#174734]">QR Codes</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Printed on trucks, flyers, and signage.
          </p>

          {qrCampaigns.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-[#e7e2d5] bg-white p-6 text-sm text-[#6b705c] shadow-sm">
              No QR code campaigns yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {qrCampaigns.map((code) => (
                <article
                  key={code.id}
                  className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-[#174734]">
                        {code.displayName}
                      </h3>
                      <p className="mt-1 text-sm text-[#6b705c]">
                        Campaign: {code.name}
                      </p>
                      <p className="mt-1 text-sm text-[#6b705c]">
                        /r/{code.slug}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="rounded-full bg-[#d4af37] px-3 py-1 text-xs font-bold text-[#174734]">
                        QR
                      </div>
                      {code.capture_leads && (
                        <div className="rounded-full bg-[#174734] px-3 py-1 text-xs font-bold text-white">
                          Capturing Leads
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#f5f4ef] p-3">
                      <p className="text-xs text-[#6b705c]">Total Scans</p>
                      <p className="text-3xl font-bold text-[#174734]">
                        {code.totalScans}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#f5f4ef] p-3">
                      <p className="text-xs text-[#6b705c]">Last Scan</p>
                      <p className="text-sm font-semibold text-[#174734]">
                        {formatArizonaTime(code.lastScan, "No scans yet")}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#f5f4ef] p-3">
                      <p className="text-xs text-[#6b705c]">Revenue</p>
                      <p className="text-lg font-bold text-[#174734]">
                        {formatCurrency(code.revenue)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#f5f4ef] p-3">
                      <p className="text-xs text-[#6b705c]">ROI</p>
                      <p
                        className={`text-lg font-bold ${
                          code.roiPercent !== null && code.roiPercent < 0
                            ? "text-red-600"
                            : "text-[#174734]"
                        }`}
                      >
                        {code.roiPercent === null
                          ? "—"
                          : `${code.roiPercent >= 0 ? "+" : ""}${code.roiPercent.toFixed(0)}%`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-center rounded-xl border border-[#e7e2d5] bg-white p-4">
                    {code.qrDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={code.qrDataUrl}
                        alt={`${code.displayName} QR code`}
                        className="h-56 w-56"
                      />
                    )}
                  </div>

                  <div className="mt-5 rounded-xl bg-[#f5f4ef] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6b705c]">
                      Tracking URL
                    </p>
                    <p className="mt-1 break-all text-sm text-[#174734]">
                      {code.trackingUrl}
                    </p>
                  </div>

                  <div className="mt-3 rounded-xl bg-[#f5f4ef] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6b705c]">
                      Destination
                    </p>
                    <p className="mt-1 break-all text-sm text-[#174734]">
                      {code.destination}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <Link
                      href={`/campaigns/${code.slug}`}
                      className="inline-flex w-full justify-center rounded-xl bg-[#d4af37] px-4 py-3 text-sm font-semibold text-[#174734] shadow-sm transition hover:bg-[#d4af37]"
                    >
                      View Details
                    </Link>

                    <CopyLinkButton url={code.trackingUrl} />

                    {code.qrDataUrl && (
                      <a
                        href={code.qrDataUrl}
                        download={`${code.slug}-qr.png`}
                        className="inline-flex w-full justify-center rounded-xl bg-[#174734] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#226246]"
                      >
                        Download PNG
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-[#174734]">
            Social & Bio Links
          </h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Trackable short links for Instagram, Facebook, Google, and
            anywhere else you can drop a URL.
          </p>

          {socialCampaigns.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-[#e7e2d5] bg-white p-6 text-sm text-[#6b705c] shadow-sm">
              No social/bio link campaigns yet. Create one above with type
              "Social Media / Bio Link".
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {socialCampaigns.map((code) => (
                <div
                  key={code.id}
                  className="flex flex-col gap-4 rounded-2xl border border-[#e7e2d5] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-[#174734]">
                        {code.displayName}
                      </h3>
                      {code.capture_leads && (
                        <span className="rounded-full bg-[#174734] px-2 py-1 text-xs font-bold text-white">
                          Capturing Leads
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-all text-sm text-[#6b705c]">
                      {code.trackingUrl}
                    </p>
                    <p className="mt-1 truncate text-xs text-[#6b705c]">
                      → {code.destination}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-[#6b705c]">Clicks</p>
                      <p className="text-2xl font-bold text-[#174734]">
                        {code.totalScans}
                      </p>
                      <p className="text-xs text-[#6b705c]">
                        {formatArizonaTime(code.lastScan, "No clicks yet")}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-[#6b705c]">Revenue</p>
                      <p className="text-lg font-bold text-[#174734]">
                        {formatCurrency(code.revenue)}
                      </p>
                      <p
                        className={`text-xs font-semibold ${
                          code.roiPercent !== null && code.roiPercent < 0
                            ? "text-red-600"
                            : "text-[#6b705c]"
                        }`}
                      >
                        {code.roiPercent === null
                          ? "No spend logged"
                          : `${code.roiPercent >= 0 ? "+" : ""}${code.roiPercent.toFixed(0)}% ROI`}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <CopyLinkButton
                        url={code.trackingUrl}
                        className="rounded-xl border border-[#174734] px-4 py-2 text-xs font-semibold text-[#174734] shadow-sm transition hover:bg-[#174734] hover:text-white"
                      />
                      <Link
                        href={`/campaigns/${code.slug}`}
                        className="rounded-xl bg-[#d4af37] px-4 py-2 text-center text-xs font-semibold text-[#174734] shadow-sm transition hover:bg-[#c49f2f]"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
