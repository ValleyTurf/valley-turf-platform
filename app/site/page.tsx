import Link from "next/link";
import type { Metadata } from "next";
import { SERVICES } from "./services";
import { SERVICE_AREAS } from "./serviceAreas";

export const metadata: Metadata = {
  title: "Artificial Turf Cleaning & Pet Odor Removal in Phoenix's East Valley",
  description:
    "Valley Turf Revival cleans artificial turf and removes pet odor for homes across Queen Creek, Gilbert, Chandler, Mesa, and the greater Phoenix/East Valley area. Get a free quote today.",
  alternates: { canonical: "/" },
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default function MarketingHomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
              Queen Creek &middot; East Valley &middot; Phoenix Metro
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl" style={{ color: BRAND_GREEN }}>
              Artificial turf that looks — and smells — brand new
            </h1>
            <p className="mt-5 text-lg" style={{ color: MUTED_GRAY }}>
              We deep-clean artificial turf and eliminate pet odor at the source, so your yard stays
              green, soft, and fresh year-round. Serving Queen Creek and the greater Phoenix/East
              Valley area.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/request-quote"
                className="rounded-full px-7 py-3 text-base font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: BRAND_GREEN }}
              >
                Get my free quote
              </Link>
              <a
                href="tel:4803314596"
                className="text-base font-semibold"
                style={{ color: BRAND_GREEN }}
              >
                or call (480) 331-4596
              </a>
            </div>
          </div>

          <div
            className="flex aspect-[4/3] items-center justify-center rounded-3xl"
            style={{ background: "#e7ede6" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/logo.svg"
              alt="Valley Turf Revival"
              className="h-28 w-auto opacity-80"
            />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          What we do
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SERVICES.map((service) => (
            <Link
              key={service.slug}
              href={`/services/${service.slug}`}
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

      {/* Why us */}
      <section className="py-14" style={{ background: "#fff" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
            Why homeowners choose us
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <WhyCard
              title="Local & reliable"
              body="Based in Queen Creek, serving the Valley we call home — we show up when we say we will."
            />
            <WhyCard
              title="Odor removal that lasts"
              body="We treat the bacteria trapped in the infill, not just mask the smell on top."
            />
            <WhyCard
              title="Fast, free quotes"
              body="Tell us about your yard and we'll get back to you with a quote, usually within one business day."
            />
          </div>
        </div>
      </section>

      {/* Service area teaser */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          Serving the entire Valley
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center" style={{ color: MUTED_GRAY }}>
          From Queen Creek to Buckeye, up to New River, and down to Maricopa and Casa Grande —
          {" "}{SERVICE_AREAS.length} cities and counting.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SERVICE_AREAS.slice(0, 14).map((area) => (
            <Link
              key={area.slug}
              href={`/service-areas/${area.slug}`}
              className="rounded-full border px-4 py-1.5 text-sm font-semibold"
              style={{ borderColor: "#d8ddd3", color: BRAND_GREEN }}
            >
              {area.name}
            </Link>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/service-areas" className="text-sm font-bold" style={{ color: GOLD }}>
            See all service areas &rarr;
          </Link>
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-4 py-16 sm:px-6" style={{ background: BRAND_GREEN }}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white">Ready for a cleaner, fresher yard?</h2>
          <p className="mt-3 text-white/80">
            Get a free, no-obligation quote — usually within one business day.
          </p>
          <Link
            href="/request-quote"
            className="mt-7 inline-block rounded-full bg-white px-7 py-3 text-base font-bold transition-opacity hover:opacity-90"
            style={{ color: BRAND_GREEN }}
          >
            Get my free quote
          </Link>
        </div>
      </section>
    </div>
  );
}

function WhyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <h3 className="text-lg font-bold" style={{ color: BRAND_GREEN }}>
        {title}
      </h3>
      <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
        {body}
      </p>
    </div>
  );
}
