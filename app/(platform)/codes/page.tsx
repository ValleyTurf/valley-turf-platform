import QRCode from "qrcode";
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

async function createCampaign(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const destination = String(formData.get("destination") ?? "").trim();

  if (!name || !slug || !destination) return;

  await supabaseServer.from("campaigns").insert({
    name,
    alias: alias || null,
    slug,
    destination,
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

  const baseUrl = "https://go.valleyturfrevival.com/r";

  const qrCodes = await Promise.all(
    (campaigns ?? []).map(async (campaign) => {
      const trackingUrl = `${baseUrl}/${campaign.slug}`;

      const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: "H",
        margin: 4,
        width: 320,
      });

      const campaignScans =
        scans?.filter((scan) => scan.campaign_id === campaign.id) ?? [];

      return {
        ...campaign,
        displayName: campaign.alias ?? campaign.name,
        trackingUrl,
        qrDataUrl,
        totalScans: campaignScans.length,
        lastScan: campaignScans[0]?.scanned_at ?? null,
      };
    })
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] p-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#174734] to-[#226246] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#d4af37]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-4xl font-bold">QR Code Library</h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Create, download, and track every Valley Turf Revival QR campaign.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">
            New Campaign
          </h2>

          <form action={createCampaign} className="mt-5 grid gap-4 md:grid-cols-2">
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
                placeholder="Ford F-250"
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

        <section className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map((code) => (
            <article
              key={code.id}
              className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-[#174734]">
                    {code.displayName}
                  </h2>
                  <p className="mt-1 text-sm text-[#6b705c]">
                    Campaign: {code.name}
                  </p>
                  <p className="mt-1 text-sm text-[#6b705c]">
                    /r/{code.slug}
                  </p>
                </div>

                <div className="rounded-full bg-[#d4af37] px-3 py-1 text-xs font-bold text-[#174734]">
                  QR
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
                    {formatArizonaTime(code.lastScan)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-center rounded-xl border border-[#e7e2d5] bg-white p-4">
                <img
                  src={code.qrDataUrl}
                  alt={`${code.displayName} QR code`}
                  className="h-56 w-56"
                />
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
                
                 <a href={`/campaigns/${code.slug}`}
                  className="inline-flex w-full justify-center rounded-xl bg-[#d4af37] px-4 py-3 text-sm font-semibold text-[#174734] shadow-sm transition hover:bg-[#d4af37]"
                >
                  View Details
                </a>

                
                 <a href={code.qrDataUrl}
                  download={`${code.slug}-qr.png`}
                  className="inline-flex w-full justify-center rounded-xl bg-[#174734] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#226246]"
                >
                  Download PNG
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}