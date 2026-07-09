export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

  if (!id || !name || !slug || !destination) return;

  await supabaseServer
    .from("campaigns")
    .update({
      name,
      alias: alias || null,
      slug,
      destination,
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
  params: { slug: string };
}) {
  const { data: campaign } = await supabaseServer
    .from("campaigns")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (!campaign) {
    notFound();
  }

  const { data: scans } = await supabaseServer
    .from("scans")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("scanned_at", { ascending: false });

  const totalScans = scans?.length ?? 0;
  const lastScan = scans?.[0]?.scanned_at ?? null;

  return (
    <main className="min-h-screen bg-[#F7F6F2] p-8 text-[#1F2937]">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/codes"
          className="text-sm font-semibold text-[#0E3B2E] hover:underline"
        >
          ← Back to QR Library
        </Link>

        <section className="mt-4 rounded-3xl bg-gradient-to-r from-[#0E3B2E] to-[#2E6B3F] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#F2C94C]">
            Campaign
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            {campaign.alias || campaign.name}
          </h1>
          <p className="mt-3 text-green-50">/r/{campaign.slug}</p>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6B7280]">Total Scans</p>
            <p className="mt-1 text-4xl font-bold text-[#0E3B2E]">
              {totalScans}
            </p>
          </div>

          <div className="rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6B7280]">Last Scan</p>
            <p className="mt-1 text-lg font-semibold text-[#0E3B2E]">
              {formatArizonaTime(lastScan)}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#0E3B2E]">Edit Campaign</h2>

          <form
            action={updateCampaign}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={campaign.id} />

            <div>
              <label className="text-sm font-semibold text-[#1F2937]">
                Campaign Name
              </label>
              <input
                name="name"
                defaultValue={campaign.name}
                required
                className="mt-1 w-full rounded-xl border border-[#D9E4D4] p-3 outline-none focus:border-[#D4A32A]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#1F2937]">
                Display Alias
              </label>
              <input
                name="alias"
                defaultValue={campaign.alias ?? ""}
                className="mt-1 w-full rounded-xl border border-[#D9E4D4] p-3 outline-none focus:border-[#D4A32A]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#1F2937]">
                Slug
              </label>
              <input
                name="slug"
                defaultValue={campaign.slug}
                required
                className="mt-1 w-full rounded-xl border border-[#D9E4D4] p-3 outline-none focus:border-[#D4A32A]"
              />
              <p className="mt-1 text-xs text-[#6B7280]">
                Changing this changes the tracking URL and this page's address.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#1F2937]">
                Destination URL
              </label>
              <input
                name="destination"
                defaultValue={campaign.destination}
                required
                className="mt-1 w-full rounded-xl border border-[#D9E4D4] p-3 outline-none focus:border-[#D4A32A]"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-[#0E3B2E] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#2E6B3F]"
              >
                Save Changes
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-2xl border border-[#D9E4D4] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#0E3B2E]">Scan History</h2>

          <div className="mt-5 overflow-x-auto">
            {scans && scans.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D9E4D4] text-[#6B7280]">
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">Location</th>
                    <th className="pb-2 pr-4">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id} className="border-b border-[#F0EEE8]">
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
              <p className="text-sm text-[#6B7280]">No scans yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}