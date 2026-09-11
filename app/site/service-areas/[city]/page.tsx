import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SERVICE_AREAS, getServiceArea, type ServiceArea } from "../../serviceAreas";
import { SERVICES } from "../../services";
import { GOOGLE_RATING, GOOGLE_REVIEW_COUNT } from "../../testimonials";
import { SITE_URL } from "../../config";
import { fetchLatestGoogleReviews } from "@/lib/googleReviews";
import { Breadcrumbs, type BreadcrumbItem } from "../../Breadcrumbs";
import { buildBreadcrumbSchema } from "../../breadcrumbSchema";

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

// A couple of the real before/after photos used on the homepage -- not
// claimed as being from this specific city, just real examples of the
// work (same honesty rule as everywhere else on the site: no invented or
// city-specific claims about photos).
const SAMPLE_WORK_IMAGES = [
  { src: "/images/before-after/ba-sidebyside-1.jpg", alt: "Before and after: debris-covered turf next to the same corner fully cleaned" },
  { src: "/images/gallery/gallery-2.jpg", alt: "Artificial turf cleaned by Valley Turf Revival" },
];

// Real facts and previously-approved copy only (Ryan's standing
// preference -- see app/site/testimonials.ts -- reinforced after he
// asked us to drop a drive-time FAQ that made distance sound like a
// concern it isn't). The climate point is a widely-documented fact about
// the whole valley; "recurring services" is copied verbatim from the
// homepage's own approved FAQ; the rest just restates the real service
// catalog and the real quote-response-time copy used sitewide. No
// distance/drive-time framing, no invented neighborhoods or landmarks.
function buildFaqs(area: ServiceArea): { question: string; answer: string }[] {
  return [
    {
      question: `Does Arizona's desert climate affect artificial turf in ${area.name}?`,
      answer:
        "Yes. Valley summers bring intense heat and UV exposure that break down turf infill and backing faster than in cooler climates, and heat speeds up the bacteria buildup that causes pet odor. That's part of why periodic cleaning matters here more than it would somewhere milder.",
    },
    {
      question: `What services do you offer in ${area.name}?`,
      answer: `We offer ${SERVICES.map((s) => s.name.toLowerCase()).join(" and ")} for ${area.name} homeowners: ${SERVICES.map((s) => s.shortDescription).join(" ")}`,
    },
    {
      question: "Do you have recurring services?",
      answer:
        "Yes! We have a Revival plan to fit everyone's needs! We start with a Full Revival Cleaning and then if you would like to set up a plan with us, we have Monthly, Every Other Month, Quarterly and Semi-Annual plans available. We also can build a custom plan for you!",
    },
    {
      question: `How do I get a quote for turf cleaning in ${area.name}?`,
      answer:
        "Request a free quote through our website and we'll typically respond within one business day with pricing and scheduling.",
    },
  ];
}

export default async function ServiceAreaCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const area = getServiceArea(slug);

  if (!area) notFound();

  const nearby = SERVICE_AREAS.filter((a) => a.region === area.region && a.slug !== area.slug).slice(0, 6);

  const breadcrumbItems: BreadcrumbItem[] = [
    { name: "Home", path: "/" },
    { name: "Service Areas", path: "/service-areas" },
    { name: area.name, path: `/service-areas/${area.slug}` },
  ];
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);

  // SEO content buildout is rolling out city-by-city -- only cities
  // flagged seoEnhanced (with a real hero photo assigned) get the new
  // hero treatment, FAQ block, and structured data for now. Everyone
  // else keeps the original plain page until each batch is reviewed.
  const isEnhanced = Boolean(area.seoEnhanced && area.heroImage);
  const faqs = isEnhanced ? buildFaqs(area) : [];

  let localBusinessSchema: Record<string, unknown> | null = null;
  let faqSchema: Record<string, unknown> | null = null;
  let rating = GOOGLE_RATING;
  let reviewCount = GOOGLE_REVIEW_COUNT;

  if (isEnhanced) {
    const liveReviews = await fetchLatestGoogleReviews(1);
    rating = liveReviews?.rating || GOOGLE_RATING;
    reviewCount = liveReviews?.reviewCount || GOOGLE_REVIEW_COUNT;

    const pageUrl = `${SITE_URL}/service-areas/${area.slug}`;

    localBusinessSchema = {
      "@context": "https://schema.org",
      "@type": "HomeAndConstructionBusiness",
      name: "Valley Turf Revival",
      telephone: "+14803314596",
      email: "valleyturfrevival@gmail.com",
      url: pageUrl,
      areaServed: {
        "@type": "City",
        name: area.name,
        containedInPlace: {
          "@type": "AdministrativeArea",
          name: "Arizona",
        },
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Queen Creek",
        addressRegion: "AZ",
        addressCountry: "US",
      },
      makesOffer: SERVICES.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.name,
          description: service.shortDescription,
        },
      })),
      ...(reviewCount > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: rating,
              reviewCount,
            },
          }
        : {}),
    };

    faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    };
  }

  if (!isEnhanced) {
    // Original, unmodified layout for cities not yet in the buildout.
    return (
      <div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
        <Breadcrumbs items={breadcrumbItems} />
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
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
                href={`/services/${service.slug}/${area.slug}`}
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
              Get a Free Quote
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {localBusinessSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      )}
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <Breadcrumbs items={breadcrumbItems} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
              {area.region}
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl" style={{ color: BRAND_GREEN }}>
              Artificial turf cleaning &amp; pet odor removal in {area.name}, AZ
            </h1>
            <p className="mt-5 text-lg" style={{ color: MUTED_GRAY }}>
              Valley Turf Revival provides artificial turf cleaning and pet odor removal for
              homeowners in {area.name} and the surrounding area &mdash; a deep clean that
              restores color, softness, and drainage, and eliminates pet odor at the source.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Stars />
              <span className="text-sm font-semibold" style={{ color: BRAND_GREEN }}>
                {rating.toFixed(1)} ({reviewCount} Google reviews)
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

          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image
              src={area.heroImage as string}
              alt={`Artificial turf cleaned by Valley Turf Revival, serving ${area.name}, AZ`}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          Services for {area.name} homeowners
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SERVICES.map((service) => (
            <Link
              key={service.slug}
              href={`/services/${service.slug}/${area.slug}`}
              className="rounded-3xl bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <h3 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
                {service.name}
              </h3>
              <p className="mt-3 text-sm" style={{ color: MUTED_GRAY }}>
                {service.shortDescription}
              </p>
              <span className="mt-4 inline-block text-sm font-bold" style={{ color: GOLD }}>
                Learn more &rarr;
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Real results */}
      <section className="py-14" style={{ background: "#fff" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
            See the difference
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center" style={{ color: MUTED_GRAY }}>
            Real yards, real results &mdash; no filters, just a deep clean.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {SAMPLE_WORK_IMAGES.map((image) => (
              <div key={image.src} className="relative aspect-square overflow-hidden rounded-3xl shadow-sm">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {nearby.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            Also serving nearby
          </h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
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
        </section>
      )}

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          Frequently asked questions
        </h2>
        <div className="mt-8 space-y-6">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold" style={{ color: BRAND_GREEN }}>
                {faq.question}
              </h3>
              <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-4 py-16 sm:px-6" style={{ background: BRAND_GREEN }}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white">
            Get a free quote for your {area.name} home
          </h2>
          <p className="mt-3 text-white/80">
            Usually a response within one business day.
          </p>
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
