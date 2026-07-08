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

  if (!name || !slug || !destination) {
    return;
  }

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
        width: 300,
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
    <main className="min-h-screen bg-[var(--vtr-background)] p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#0E3B2E] to-[#2E6B3F] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#F2C94C]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-4xl font-bold">QR Code Library</h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Create, download, and track every Valley Turf Revival QR campaign.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--vtr-border)] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[var(--vtr-green-dark)]">
            New Campaign
          </h2>

          <form action={createCampaign} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-[var(--vtr-text)]">
                Campaign Name
              </label>
              <input
                name="name"
                placeholder="Truck 3 QR"
                required
                className="mt-1 w-full rounded-xl border border-[var(--vtr-border)] p-3 outline-none focus:border-[var(--vtr-gold)]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[var(--vtr-text)]">
                Display Alias
              </label>
              <input
                name="alias"
                placeholder="Ford F-250"
                className="mt-1 w-full rounded-xl border border-[var(--vtr-border)] p-3 outline-none focus:border-[var(--vtr-gold)]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[var(--vtr-text)]">
                Slug
              </label>
              <input
                name="slug"
                placeholder="truck3"
                required
                className="mt-1 w-full rounded-xl border border-[var(--vtr-border)] p-3 outline-none focus:border-[var(--vtr-gold)]"
              />
              <p className="mt-1 text-xs text-[var(--vtr-text-light)]">
                Creates: go.valleyturfrevival.com/r/truck3
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-[var(--vtr-text)]">
                Destination URL
              </label>
              <input
                name="destination"
                placeholder="https://valleyturfrevival.com"
                required
                className="mt-1 w-full rounded-xl border border-[var(--vtr-border)] p-3 outline-none focus:border-[var(--vtr-gold)]"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-[var(--vtr-green-dark)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--vtr-green)]"
              >
                + Create Campaign
              </button>
            </div>
          </form>
        </section>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map((code) => (
            <div
              key={code.id}
              className="rounded-2xl border border-[var(--vtr-border)] bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold text-[var(--vtr-green-dark)]">
                {code.displayName}
              </h2>

              <p className="mt-1 text-sm text-[var(--vtr-text-light)]">
                Campaign: {code.name}
              </p>

              <p className="mt-1 text-sm text-[var(--vtr-text-light)]">
                /r/{code.slug}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--vtr-background)] p-3">
                  <p className="text-xs text-[var(--vtr-text-light)]">
                    Total Scans
                  </p>
                  <p className="text-2xl font-bold text-[var(--vtr-green-dark)]">
                    {code.totalScans}
                  </p>
                </div>

                <div className="rounded-xl bg-[var(--vtr-background)] p-3">
                  <p className="text-xs text-[var(--vtr-text-light)]">
                    Last Scan
                  </p>
                  <p className="text-sm font-semibold text-[var(--vtr-green-dark)]">
                    {formatArizonaTime(code.lastScan)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-center rounded-xl border border-[var(--vtr-border)] bg-white p-4">
                <img
                  src={code.qrDataUrl}
                  alt={`${code.displayName} QR code`}
                  className="h-56 w-56"
                />
              </div>

              <p className="mt-4 break-all text-sm text-[var(--vtr-text)]">
                {code.trackingUrl}
              </p>

              <p className="mt-2 break-all text-xs text-[var(--vtr-text-light)]">
                Redirects to: {code.destination}
              </p>

              <a
                href={code.qrDataUrl}
                download={`${code.slug}-qr.png`}
                className="mt-4 inline-block rounded-xl bg-[var(--vtr-green-dark)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--vtr-green)]"
              >
                Download PNG
              </a>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}