import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SERVICES, getService } from "../../services";
import { SERVICE_DETAILS } from "../../serviceDetails";
import { SERVICE_AREAS } from "../../serviceAreas";
import { GOOGLE_RATING, GOOGLE_REVIEW_COUNT } from "../../testimonials";
import { Breadcrumbs } from "../../Breadcrumbs";
import { buildBreadcrumbSchema } from "../../breadcrumbSchema";

// Data-driven per-service detail page. Only two services exist in this
// codebase today (see ../../services.ts's header comment) but this stays
// a single dynamic route rather than two hardcoded page files, so adding
// a third service later is just one new entry in SERVICE_DETAILS +
// services.ts, no new route file.
//
// The service copy itself (SERVICE_DETAILS) lives in ../../serviceDetails
// now instead of inline here, so the service x city combination pages
// (../[service]/[city]/page.tsx) can reuse it too -- see that file's
// header comment for the sourcing notes on where this copy came from.

export function generateStaticParams() {
  return SERVICES.map((service) => ({ service: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: slug } = await params;
  const service = getService(slug);

  if (!service) return {};

  return {
    title: service.name,
    description: `${service.shortDescription} Serving Queen Creek and the greater Phoenix/East Valley area.`,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = getService(slug);
  const details = SERVICE_DETAILS[slug];

  if (!service || !details) notFound();

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Services", path: "/services" },
    { name: service.name, path: `/services/${service.slug}` },
  ];
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
          Service
        </p>
        <h1 className="mt-2 text-4xl font-bold" style={{ color: BRAND_GREEN }}>
          {service.name}
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <span aria-hidden className="text-sm" style={{ color: "#f5b400" }}>
            &#9733;&#9733;&#9733;&#9733;&#9733;
          </span>
          <span className="text-sm font-semibold" style={{ color: BRAND_GREEN }}>
            {GOOGLE_RATING.toFixed(1)} ({GOOGLE_REVIEW_COUNT})
          </span>
        </div>
        <p className="mt-5 text-lg" style={{ color: MUTED_GRAY }}>
          {details.intro}
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {details.featured.map((item) => (
            <div key={item.title} className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold" style={{ color: BRAND_GREEN }}>
                {item.title}
              </h2>
              <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>

        {details.beforeAfter && (
          <div className="mt-14">
            <h2 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
              Real results
            </h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              {details.beforeAfter.map((pair, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <div className="relative aspect-square overflow-hidden rounded-2xl">
                    <Image
                      src={pair.before}
                      alt="Before turf cleaning"
                      fill
                      sizes="(min-width: 640px) 25vw, 50vw"
                      className="object-cover"
                    />
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Before
                    </span>
                  </div>
                  <div className="relative aspect-square overflow-hidden rounded-2xl">
                    <Image
                      src={pair.after}
                      alt="After turf cleaning"
                      fill
                      sizes="(min-width: 640px) 25vw, 50vw"
                      className="object-cover"
                    />
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      After
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-14">
          <h2 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
            What&apos;s Included
          </h2>
          <ul className="mt-4 space-y-4">
            {details.included.map((item) => (
              <li key={item.title} className="flex gap-3 text-sm" style={{ color: MUTED_GRAY }}>
                <span className="font-bold" style={{ color: GOLD }}>
                  &#10003;
                </span>
                <span>
                  <span className="font-bold" style={{ color: BRAND_GREEN }}>
                    {item.title}
                  </span>{" "}
                  &mdash; {item.body}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-14">
          <h2 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
            {details.whyHeading}
          </h2>
          {details.whyParagraphs.map((paragraph, index) => (
            <p key={index} className="mt-3 text-sm" style={{ color: MUTED_GRAY }}>
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-14">
          <h2 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
            Frequently Asked Questions
          </h2>
          <div className="mt-5 space-y-5">
            {details.faq.map((item) => (
              <div key={item.q}>
                <h3 className="text-sm font-bold" style={{ color: BRAND_GREEN }}>
                  {item.q}
                </h3>
                <p className="mt-1 text-sm" style={{ color: MUTED_GRAY }}>
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            {service.name} by city
          </h2>
          <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
            Pick your city for local details, or see{" "}
            <Link href="/service-areas" className="font-semibold hover:underline" style={{ color: BRAND_GREEN }}>
              all service areas
            </Link>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SERVICE_AREAS.map((area) => (
              <Link
                key={area.slug}
                href={`/services/${service.slug}/${area.slug}`}
                className="rounded-full border bg-white px-4 py-1.5 text-sm font-semibold"
                style={{ borderColor: "#d8ddd3", color: BRAND_GREEN }}
              >
                {area.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-14 rounded-3xl p-10 text-center" style={{ background: BRAND_GREEN }}>
          <h2 className="text-2xl font-bold text-white">Get a free quote for {service.name.toLowerCase()}</h2>
          <p className="mt-2 text-white/80">Usually a response within one business day.</p>
          <Link
            href="/request-quote"
            className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-base font-bold"
            style={{ color: BRAND_GREEN }}
          >
            Get a Free Quote
          </Link>
        </div>
      </div>
    </div>
  );
}
