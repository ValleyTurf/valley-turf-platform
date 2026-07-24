export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { generateBrandedQrCode } from "@/lib/qrcode";
import { getCampaignRoi } from "@/lib/campaignRoi";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import { formatCurrency } from "@/lib/format";

type Channel = "qr" | "social";

function normalizeChannel(value: unknown): Channel {
  return value === "social" ? "social" : "qr";
}

function formatArizonaTime(value: string | null, emptyLabel = "No scans yet") {
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

function parseDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown";

  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Mobile/i.test(userAgent)) return "Mobile";

  return "Desktop";
}

async function updateCampaign(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const destination = String(formData.get("destination") ?? "").trim();
  const captureLeads = formData.get("capture_leads") === "on";
  const channel = normalizeChannel(formData.get("channel"));
  const spendRaw = Number(formData.get("spend"));
  const spend = Number.isFinite(spendRaw) && spendRaw >= 0 ? spendRaw : 0;

  if (!id || !name || !slug || !destination) return;

  await supabaseServer
    .from("campaigns")
    .update({
      name,
      alias: alias || null,
      slug,
      destination,
      capture_leads: captureLeads,
      channel,
      spend,
    })
    .eq("id", id);

  revalidatePath("/codes");
  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${slug}`);

  redirect(`/campaigns/${slug}`);
}

export default async function CampaignDetailPage({
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
    notFound();
  }

  const { data: scans } = await supabaseServer
    .from("scans")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("scanned_at", { ascending: false });

  const { data: leads } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: false });

  const totalScans = scans?.length ?? 0;
  const lastScan = scans?.[0]?.scanned_at ?? null;
  const totalLeads = leads?.length ?? 0;

  const roi = await getCampaignRoi(campaign.id);

  const channel = normalizeChannel(campaign.channel);
  const trackingUrl = `https://go.valleyturfrevival.com/r/${campaign.slug}`;
  const qrDataUrl =
    channel === "qr" ? await generateBrandedQrCode(trackingUrl) : null;

  return (
    <main className="min-h-screen bg-[#f5f4ef] p-8 text-[#174734]">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/codes"
          className="text-sm font-semibold text-[#174734] hover:underline"
        >
          ← Back to Links & QR Codes
        </Link>

        <section className="mt-4 rounded-3xl bg-gradient-to-r from-[#174734] to-[#226246] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#d4af37]">
            Campaign
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            {campaign.alias || campaign.name}
          </h1>
          <p className="mt-3 text-green-50">/r/{campaign.slug}</p>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">
              Total {channel === "social" ? "Clicks" : "Scans"}
            </p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {totalScans}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Leads Captured</p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {totalLeads}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">
              Last {channel === "social" ? "Click" : "Scan"}
            </p>
            <p className="mt-1 text-lg font-semibold text-[#174734]">
              {formatArizonaTime(
                lastScan,
                channel === "social" ? "No clicks yet" : "No scans yet"
              )}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">
            Campaign ROI
          </h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Revenue counts invoices billed on or after each customer's first
            touch on this campaign — not their full history.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#f5f4ef] p-4">
              <p className="text-xs text-[#6b705c]">Spend to Date</p>
              <p className="mt-1 text-2xl font-bold text-[#174734]">
                {formatCurrency(roi?.spend ?? 0)}
              </p>
            </div>

            <div className="rounded-xl bg-[#f5f4ef] p-4">
              <p className="text-xs text-[#6b705c]">Revenue Attributed</p>
              <p className="mt-1 text-2xl font-bold text-[#174734]">
                {formatCurrency(roi?.revenue ?? 0)}
              </p>
            </div>

            <div className="rounded-xl bg-[#f5f4ef] p-4">
              <p className="text-xs text-[#6b705c]">ROI</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  roi?.roiPercent !== null &&
                  roi?.roiPercent !== undefined &&
                  roi.roiPercent < 0
                    ? "text-red-600"
                    : "text-[#174734]"
                }`}
              >
                {roi?.roiPercent === null || roi?.roiPercent === undefined
                  ? "—"
                  : `${roi.roiPercent >= 0 ? "+" : ""}${roi.roiPercent.toFixed(0)}%`}
              </p>
            </div>

            <div className="rounded-xl bg-[#f5f4ef] p-4">
              <p className="text-xs text-[#6b705c]">Converted Customers</p>
              <p className="mt-1 text-2xl font-bold text-[#174734]">
                {roi?.matchedCustomers.length ?? 0}
              </p>
            </div>
          </div>

          {roi && roi.matchedCustomers.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e7e2d5] text-[#6b705c]">
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4">First Touch</th>
                    <th className="pb-2 pr-4">Revenue Since</th>
                  </tr>
                </thead>
                <tbody>
                  {roi.matchedCustomers.map((match) => (
                    <tr
                      key={match.jobberClientId}
                      className="border-b border-[#f0eee6]"
                    >
                      <td className="py-2 pr-4">
                        <Link
                          href={`/customers/${encodeURIComponent(
                            match.jobberClientId
                          )}`}
                          className="font-semibold text-[#174734] hover:underline"
                        >
                          {match.fullName || "View Customer"}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {formatArizonaTime(match.firstTouch)}
                      </td>
                      <td className="py-2 pr-4">
                        {formatCurrency(match.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">Tracking Link</h2>

          <div className="mt-5 flex flex-col gap-6 sm:flex-row">
            {qrDataUrl && (
              <div className="flex shrink-0 justify-center rounded-xl border border-[#e7e2d5] bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`${campaign.alias || campaign.name} QR code`}
                  className="h-40 w-40"
                />
              </div>
            )}

            <div className="flex-1 space-y-3">
              <div className="rounded-xl bg-[#f5f4ef] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b705c]">
                  Tracking URL
                </p>
                <p className="mt-1 break-all text-sm text-[#174734]">
                  {trackingUrl}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <CopyLinkButton
                  url={trackingUrl}
                  className="rounded-xl border border-[#174734] px-4 py-2 text-sm font-semibold text-[#174734] shadow-sm transition hover:bg-[#174734] hover:text-white"
                />

                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download={`${campaign.slug}-qr.png`}
                    className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#226246]"
                  >
                    Download PNG
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">Edit Campaign</h2>

          <form
            action={updateCampaign}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={campaign.id} />

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Type
              </label>
              <select
                name="channel"
                defaultValue={channel}
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
                defaultValue={campaign.name}
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
                defaultValue={campaign.alias ?? ""}
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Slug
              </label>
              <input
                name="slug"
                defaultValue={campaign.slug}
                required
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
              <p className="mt-1 text-xs text-[#6b705c]">
                Changing this changes the tracking URL and this page's address.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Destination URL
              </label>
              <input
                name="destination"
                defaultValue={campaign.destination}
                required
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#174734]">
                Spend to Date ($)
              </label>
              <input
                name="spend"
                type="number"
                step="0.01"
                min="0"
                defaultValue={campaign.spend ?? 0}
                className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
              />
              <p className="mt-1 text-xs text-[#6b705c]">
                Running total — printing, signage, ad boosts, etc.
              </p>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="capture_leads"
                name="capture_leads"
                defaultChecked={campaign.capture_leads ?? false}
                className="h-4 w-4 rounded border-[#e7e2d5] text-[#174734] focus:ring-[#d4af37]"
              />
              <label
                htmlFor="capture_leads"
                className="text-sm font-semibold text-[#174734]"
              >
                Capture lead info before redirecting (shows a quick
                name/phone/email form with a skip option)
              </label>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-[#174734] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#226246]"
              >
                Save Changes
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">
            Leads Captured
          </h2>

          <div className="mt-5 overflow-x-auto">
            {leads && leads.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e7e2d5] text-[#6b705c]">
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Phone</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-[#f0eee6]">
                      <td className="py-2 pr-4">
                        {formatArizonaTime(lead.created_at)}
                      </td>
                      <td className="py-2 pr-4">
                        {[lead.first_name, lead.last_name]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>
                      <td className="py-2 pr-4">{lead.phone || "—"}</td>
                      <td className="py-2 pr-4">{lead.email || "—"}</td>
                      <td className="py-2 pr-4">{lead.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[#6b705c]">
                {campaign.capture_leads
                  ? "No leads captured yet."
                  : "Lead capture is off for this campaign."}
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">
            {channel === "social" ? "Click History" : "Scan History"}
          </h2>

          <div className="mt-5 overflow-x-auto">
            {scans && scans.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e7e2d5] text-[#6b705c]">
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">Location</th>
                    <th className="pb-2 pr-4">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id} className="border-b border-[#f0eee6]">
                      <td className="py-2 pr-4">
                        {formatArizonaTime(scan.scanned_at)}
                      </td>
                      <td className="py-2 pr-4">
                        {[scan.city, scan.region, scan.country]
                          .filter(Boolean)
                          .join(", ") || "Unknown"}
                      </td>
                      <td className="py-2 pr-4">
                        {parseDevice(scan.user_agent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[#6b705c]">
                {channel === "social" ? "No clicks yet." : "No scans yet."}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}