import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SERVICES, getService } from "../../../services";
import { SERVICE_AREAS, getServiceArea } from "../../../serviceAreas";
import { SERVICE_DETAILS } from "../../../serviceDetails";
import { GOOGLE_RATING, GOOGLE_REVIEW_COUNT } from "../../../testimonials";
import { SITE_URL } from "../../../config";
import { Breadcrumbs, type BreadcrumbItem } from "../../../Breadcrumbs";
import { buildBreadcrumbSchema } from "../../../breadcrumbSchema";

// Service x city combination pages -- SEO buildout, phase 2 (after the
// per-city pages). One page per (service, city) pair: 2 services x 29
// cities = 58 pages, e.g. /services/turf-cleaning/gilbert. Reuses the
// same real, already-approved copy as the plain service page
// (../../serviceDetails.ts) and the city page (../../../serviceAreas.ts)
// rather than inventing new claims -- this is a recombination of
// existing approved content into a more specific, more useful page for
// someone searching "[service] in [city]," not thin/duplicate filler.
// Same real-content-only rule as everywhere else on the site (see
// serviceDetails.ts and serviceAreas.ts): no invented city-specific
// facts, no distance/drive-time framing.

export function generateStaticParams() {
  return SERVICES.flatMap((service) =>
    SERVICE_AREAS.map((area) => ({ service: service.slug, city: area.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string; city: string }>;
}): Promise<Metadata> {
  const { service: serviceSlug, city: citySlug } = await params;
  const service = getService(serviceSlug);
  const area = getServiceArea(citySlug);

  if (!service || !area) return {};

  return {
    title: `${service.name} in ${area.name}, AZ`,
    description: `${service.shortDescription} Serving ${area.name}, AZ homeowners. Free quotes, usually a response within one business day.`,
    alternates: { canonical: `/services/${service.slug}/${area.slug}` },
  };
}

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default async function ServiceCityComboPage({
  params,
}: {
  params: Promise<{ service: string; city: string }>;
}) {
  const { service: serviceSlug, city: citySlug } = await params;
  const service = getService(serviceSlug);
  const area = getServiceArea(citySlug);
  const details = SERVICE_DETAILS[serviceSlug];

  if (!service || !area || !details) notFound();

  const nearby = SERVICE_AREAS.filter((a) => a.region === area.region && a.slug !== area.slug).slice(0, 6);

  const breadcrumbItems: BreadcrumbItem[] = [
    { name: "Home", path: "/" },
    { name: "Services", path: "/services" },
    { name: service.name, path: `/services/${service.slug}` },
    { name: area.name, path: `/services/${service.slug}/${area.slug}` },
  ];
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);

  // No aggregateRating on this node -- verified against Google's Rich
  // Results Test (2026-09-11): Google's Review Snippets feature doesn't
  // recognize aggregateRating nested directly on a bare "Service" node
  // (schema.org itself allows it, but Google's validator rejects it with
  // "Invalid object type for field '<parent_node>'" and the page's
  // structured data shows as an error in Search Console). The rating is
  // already covered sitewide by the Organization schema in
  // app/site/layout.tsx and per-city by the LocalBusiness schema on the
  // plain city pages, both of which nest aggregateRating on a supported
  // LocalBusiness-family type -- nothing is actually lost by leaving it
  // off here.
  const pageUrl = `${SITE_URL}/services/${service.slug}/${area.slug}`;
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: service.name,
    name: `${service.name} in ${area.name}, AZ`,
    description: service.shortDescription,
    url: pageUrl,
    areaServed: {
      "@type": "City",
      name: area.name,
      containedInPlace: {
        "@type": "AdministrativeArea",
        name: "Arizona",
      },
    },
    provider: {
      "@type": "HomeAndConstructionBusiness",
      name: "Valley Turf Revival",
      telephone: "+14803314596",
      url: SITE_URL,
    },
  };

  // Combo-specific FAQ: the first two service FAQ entries (already
  // approved, service-specific) plus one quote-request entry naming this
  // city -- same "how do I get a quote in [city]" pattern used on the
  // plain city page, just paired with the service name too.
  const comboFaqs = [
    ...details.faq.slice(0, 2),
    {
      q: `How do I get a quote for ${service.name.toLowerCase()} in ${area.name}?`,
      a: "Request a free quote through our website and we'll typically respond within one business day with pricing and scheduling.",
    },
  ];

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />

      <Breadcrumbs items={breadcrumbItems} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
              {area.name}, AZ
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl" style={{ color: BRAND_GREEN }}>
              {service.name} in {area.name}, AZ
            </h1>
            <p className="mt-5 text-lg" style={{ color: MUTED_GRAY }}>
              {details.intro}
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Stars />
              <span className="text-sm font-semibold" style={{ color: BRAND_GREEN }}>
                {GOOGLE_RATING.toFixed(1)} ({GOOGLE_REVIEW_COUNT} Google reviews)
              </span>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/request-quote"
                className="rounded-full px-7 py-3 text-base font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: BRAND_GREEN }}
              >
                Get a Free Quote
              </Link>
              <a href="tel:4803314596" className="text-base font-semibold" style={{ color: BRAND_GREEN }}>
                or call (480) 331-4596
              </a>
            </div>
          </div>

          {area.heroImage && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
              <Image
                src={area.heroImage as string}
                alt={`${service.name} by Valley Turf Revival, serving ${area.name}, AZ`}
                fill
                priority
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* What's included */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h2 className="text-2xl font-bold" style={{ color: BRAND_GREEN }}>
          What&apos;s included
        </h2>
        <ul className="mt-5 space-y-4">
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
      </section>

      {/* Real results, when this service has before/after photos */}
      {details.beforeAfter && (
        <section className="py-10" style={{ background: "#fff" }}>
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold" style={{ color: BRAND_GREEN }}>
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
        </section>
      )}

      {/* Why this service, for this area */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h2 className="text-2xl font-bold" style={{ color: BRAND_GREEN }}>
          {details.whyHeading}
        </h2>
        <p className="mt-3 text-sm" style={{ color: MUTED_GRAY }}>
          {area.name} homeowners deal with the same Arizona conditions as the rest of the Valley,
          which is exactly why this matters here too:
        </p>
        {details.whyParagraphs.map((paragraph, index) => (
          <p key={index} className="mt-3 text-sm" style={{ color: MUTED_GRAY }}>
            {paragraph}
          </p>
        ))}
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h2 className="text-2xl font-bold" style={{ color: BRAND_GREEN }}>
          Frequently asked questions
        </h2>
        <div className="mt-5 space-y-5">
          {comboFaqs.map((item) => (
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
      </section>

      {/* Cross-links */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link href={`/services/${service.slug}`} className="font-semibold hover:underline" style={{ color: BRAND_GREEN }}>
            More about {service.name} &rarr;
          </Link>
          <Link href={`/service-areas/${area.slug}`} className="font-semibold hover:underline" style={{ color: BRAND_GREEN }}>
            More about {area.name} &rarr;
          </Link>
        </div>

        {nearby.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
              Also serving nearby
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {nearby.map((a) => (
                <Link
                  key={a.slug}
                  href={`/services/${service.slug}/${a.slug}`}
                  className="rounded-full border bg-white px-4 py-1.5 text-sm font-semibold"
                  style={{ borderColor: "#d8ddd3", color: BRAND_GREEN }}
                >
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* CTA banner */}
      <section className="px-4 py-16 sm:px-6" style={{ background: BRAND_GREEN }}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white">
            Get a free quote for {service.name.toLowerCase()} in {area.name}
          </h2>
          <p className="mt-3 text-white/80">Usually a response within one business day.</p>
          <Link
            href="/request-quote"
            className="mt-7 inline-block rounded-full bg-white px-7 py-3 text-base font-bold transition-opacity hover:opacity-90"
            style={{ color: BRAND_GREEN }}
          >
            Get a Free Quote
          </Link>
        </div>
      </section>
    </div>
  );
}

// Same inline 5-star glyph row used on the homepage.
function Stars() {
  return (
    <span aria-hidden className="text-sm" style={{ color: "#f5b400" }}>
      &#9733;&#9733;&#9733;&#9733;&#9733;
    </span>
  );
}
