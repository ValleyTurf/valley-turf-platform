import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SERVICE_AREAS, getServiceArea } from "../../serviceAreas";
import { SERVICES } from "../../services";

export function generateStaticParams() {
  return SERVICE_AREAS.map((area) => ({ city: area.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const area = getServiceArea(slug);

  if (!area) return {};

  return {
    title: `Artificial Turf Cleaning & Pet Odor Removal in ${area.name}, AZ`,
    description: `Valley Turf Revival provides artificial turf cleaning and pet odor removal for homes in ${area.name}, AZ. Free quotes, usually a response within one business day.`,
    alternates: { canonical: `/service-areas/${area.slug}` },
  };
}

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default async function ServiceAreaCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const area = getServiceArea(slug);

  if (!area) notFound();

  const nearby = SERVICE_AREAS.filter((a) => a.region === area.region && a.slug !== area.slug).slice(0, 6);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
        {area.region}
      </p>
      <h1 className="mt-2 text-4xl font-bold" style={{ color: BRAND_GREEN }}>
        Artificial turf cleaning &amp; pet odor removal in {area.name}, AZ
      </h1>
      <p className="mt-6 text-lg" style={{ color: MUTED_GRAY }}>
        Valley Turf Revival provides artificial turf cleaning and pet odor removal for homeowners
        in {area.name} and the surrounding area. We&apos;re based in Queen Creek, so a trip out to{" "}
        {area.name} is just another day on the schedule &mdash; not a special trip.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {SERVICES.map((service) => (
          <Link
            key={service.slug}
            href={`/services/${service.slug}`}
            className="rounded-3xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-bold" style={{ color: BRAND_GREEN }}>
              {service.name}
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
              {service.shortDescription}
            </p>
          </Link>
        ))}
      </div>

      {nearby.length > 0 && (
        <div className="mt-12">
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            Also serving nearby
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {nearby.map((a) => (
              <Link
                key={a.slug}
                href={`/service-areas/${a.slug}`}
                className="rounded-full border bg-white px-4 py-1.5 text-sm font-semibold"
                style={{ borderColor: "#d8ddd3", color: BRAND_GREEN }}
              >
                {a.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-14 rounded-3xl p-10 text-center" style={{ background: BRAND_GREEN }}>
        <h2 className="text-2xl font-bold text-white">
          Get a free quote for your {area.name} home
        </h2>
        <p className="mt-2 text-white/80">Usually a response within one business day.</p>
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
