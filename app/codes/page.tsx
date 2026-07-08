import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

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

  const { data: scans } = await supabaseServer.from("scans").select("*");

  const baseUrl = "https://go.valleyturfrevival.com/r";

  const qrCodes = await Promise.all(
    (campaigns ?? []).map(async (campaign) => {
      const trackingUrl = `${baseUrl}/${campaign.slug}`;

      const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: "H",
        margin: 4,
        width: 300,
      });

      const totalScans =
        scans?.filter((scan) => scan.campaign_id === campaign.id).length ?? 0;

      return {
        ...campaign,
        displayName: campaign.alias ?? campaign.name,
        trackingUrl,
        qrDataUrl,
        totalScans,
      };
    })
  );

  return (
    <main className="min-h-screen bg-green-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold text-green-900">QR Code Library</h1>

        <p className="mt-2 text-gray-600">
          Create, download, and track Valley Turf Revival QR campaigns.
        </p>

        <section className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-2xl font-bold text-green-900">
            New Campaign
          </h2>

          <form action={createCampaign} className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-gray-700">
                Campaign Name
              </label>
              <input
                name="name"
                placeholder="Truck 3 QR"
                required
                className="mt-1 w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Display Alias
              </label>
              <input
                name="alias"
                placeholder="Ford F-250"
                className="mt-1 w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Slug
              </label>
              <input
                name="slug"
                placeholder="truck3"
                required
                className="mt-1 w-full rounded-lg border p-3"
              />
              <p className="mt-1 text-xs text-gray-500">
                Creates: go.valleyturfrevival.com/r/truck3
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Destination URL
              </label>
              <input
                name="destination"
                placeholder="https://valleyturfrevival.com"
                required
                className="mt-1 w-full rounded-lg border p-3"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-green-900 px-6 py-3 font-semibold text-white"
              >
                + Create Campaign
              </button>
            </div>
          </form>
        </section>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map((code) => (
            <div key={code.id} className="rounded-xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold text-green-900">
                {code.displayName}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Campaign: {code.name}
              </p>

              <p className="mt-1 text-sm text-gray-500">/{code.slug}</p>

              <p className="mt-3 text-lg font-bold text-green-900">
                {code.totalScans} scans
              </p>

              <div className="mt-4 flex justify-center rounded-lg border bg-white p-4">
                <img
                  src={code.qrDataUrl}
                  alt={`${code.displayName} QR code`}
                  className="h-56 w-56"
                />
              </div>

              <p className="mt-4 break-all text-sm text-gray-600">
                {code.trackingUrl}
              </p>

              <p className="mt-2 break-all text-xs text-gray-400">
                Redirects to: {code.destination}
              </p>

              <a
                href={code.qrDataUrl}
                download={`${code.slug}-qr.png`}
                className="mt-4 inline-block rounded-lg bg-green-900 px-4 py-2 text-sm font-semibold text-white"
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