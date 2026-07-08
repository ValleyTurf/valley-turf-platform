import QRCode from "qrcode";
import { supabaseServer } from "@/lib/supabase-server";

export default async function CodesPage() {
  const { data: campaigns } = await supabaseServer
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const baseUrl = "https://go.valleyturfrevival.com/r";

  const qrCodes = await Promise.all(
    (campaigns ?? []).map(async (campaign) => {
      const trackingUrl = `${baseUrl}/${campaign.slug}`;

      const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: "H",
        margin: 4,
        width: 300,
      });

      return {
        ...campaign,
        trackingUrl,
        qrDataUrl,
      };
    })
  );

  return (
    <main className="min-h-screen bg-green-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold text-green-900">
          QR Code Library
        </h1>

        <p className="mt-2 text-gray-600">
          All Valley Turf Revival tracking QR codes in one place.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map((code) => (
            <div
              key={code.id}
              className="rounded-xl bg-white p-6 shadow"
            >
              <h2 className="text-xl font-bold text-green-900">
                {code.name}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                /{code.slug}
              </p>

              <div className="mt-4 flex justify-center rounded-lg border bg-white p-4">
                <img
                  src={code.qrDataUrl}
                  alt={`${code.name} QR code`}
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