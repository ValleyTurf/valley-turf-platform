import Link from "next/link";
import type { Metadata } from "next";
import { SERVICE_AREAS, SERVICE_AREA_REGIONS } from "../serviceAreas";

export const metadata: Metadata = {
  title: "Service Areas",
  description:
    "Valley Turf Revival serves artificial turf cleaning and pet odor removal customers across the Phoenix metro area, from Queen Creek to Buckeye, up to New River, and down to Maricopa and Casa Grande.",
  alternates: { canonical: "/service-areas" },
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default function ServiceAreasPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <p className="text-center text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
        Service areas
      </p>
      <h1 className="mt-2 text-center text-4xl font-bold" style={{ color: BRAND_GREEN }}>
        Serving the entire Valley
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-center text-lg" style={{ color: MUTED_GRAY }}>
        From Queen Creek to Buckeye, up to New River, and down to Maricopa and Casa Grande — if
        you&apos;re in the Phoenix metro area, there&apos;s a good chance we already serve your
        neighborhood.
      </p>

      <div className="mt-12 space-y-10">
        {SERVICE_AREA_REGIONS.map((region) => (
          <div key={region}>
            <h2 className="text-lg font-bold" style={{ color: BRAND_GREEN }}>
              {region}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {SERVICE_AREAS.filter((area) => area.region === region).map((area) => (
                <Link
                  key={area.slug}
                  href={`/service-areas/${area.slug}`}
                  className="rounded-full border bg-white px-4 py-1.5 text-sm font-semibold"
                  style={{ borderColor: "#d8ddd3", color: BRAND_GREEN }}
                >
                  {area.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-3xl p-10 text-center" style={{ background: BRAND_GREEN }}>
        <h2 className="text-2xl font-bold text-white">Don&apos;t see your city?</h2>
        <p className="mt-2 text-white/80">
          Reach out anyway — we regularly take on jobs just outside our listed areas.
        </p>
        <Link
          href="/request-quote"
          className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-base font-bold"
          style={{ color: BRAND_GREEN }}
        >
          Get my free quote
        </Link>
      </div>
    </div>
  );
}
