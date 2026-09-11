import Link from "next/link";
import type { Metadata } from "next";
import { SERVICES } from "../services";
import { Breadcrumbs, type BreadcrumbItem } from "../Breadcrumbs";
import { buildBreadcrumbSchema } from "../breadcrumbSchema";

export const metadata: Metadata = {
  title: "Our Services",
  description:
    "Artificial turf cleaning and pet odor removal for homes across the Phoenix/East Valley area. See how each service works and get a free quote.",
  alternates: { canonical: "/services" },
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

const BREADCRUMB_ITEMS: BreadcrumbItem[] = [
  { name: "Home", path: "/" },
  { name: "Services", path: "/services" },
];

export default function ServicesPage() {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbSchema(BREADCRUMB_ITEMS)) }}
      />
      <Breadcrumbs items={BREADCRUMB_ITEMS} />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-center text-4xl font-bold" style={{ color: BRAND_GREEN }}>
        Our services
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-center text-lg" style={{ color: MUTED_GRAY }}>
        Two things, done right: keeping your artificial turf clean, and keeping it odor-free.
      </p>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {SERVICES.map((service) => (
          <div key={service.slug} className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold" style={{ color: BRAND_GREEN }}>
              {service.name}
            </h2>
            <p className="mt-3" style={{ color: MUTED_GRAY }}>
              {service.shortDescription}
            </p>
            <Link
              href={`/services/${service.slug}`}
              className="mt-5 inline-block text-sm font-bold"
              style={{ color: GOLD }}
            >
              Learn more &rarr;
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-3xl p-10 text-center" style={{ background: BRAND_GREEN }}>
        <h2 className="text-2xl font-bold text-white">Not sure what your yard needs?</h2>
        <p className="mt-2 text-white/80">
          Tell us about it and we&apos;ll recommend the right service — free quote, usually within
          one business day.
        </p>
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
