import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SERVICES, TURF_TASKS } from "./services";
import { SERVICE_AREAS } from "./serviceAreas";
import { TESTIMONIALS, GOOGLE_RATING, GOOGLE_REVIEW_COUNT } from "./testimonials";

export const metadata: Metadata = {
  title: "Artificial Turf Cleaning & Pet Odor Removal in Phoenix's East Valley",
  description:
    "Valley Turf Revival cleans artificial turf and removes pet odor for homes across Queen Creek, Gilbert, Chandler, Mesa, and the greater Phoenix/East Valley area. Get a free quote today.",
  alternates: { canonical: "/" },
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

// Homepage FAQ, copied verbatim (Ryan's request) from the old
// Jobber-hosted site's homepage FAQ section. The Pet Odor Removal
// service page has its own, more specific FAQ pulled the same way --
// see SERVICE_DETAILS.faq in services/[service]/page.tsx.
const HOME_FAQ: { q: string; a: string }[] = [
  {
    q: "Will my turf look and smell new again?",
    a: "Not all turf is the same. We do our best to fluff the turf back up to as good as new on the Initial Full Revival Cleaning. However, if the turf has not been cleaned in a while, results may not be fully seen until regular maintenance has taken place.",
  },
  {
    q: "How do you determine pricing for your services?",
    a: "Our pricing is based on the type of service, materials required, and the scope of the job. We provide transparent, upfront pricing before any work begins, so there are no surprises. All pricing is based on the amount of square feet you want serviced.",
  },
  {
    q: "How do I get in contact with you?",
    a: "If you'd like to get scheduled in with us, please fill out our request form. Once we've received the details of what you're looking for, we'll reach out to discuss next steps. You can also call or text us at (480) 331-4596. We look forward to talking with you!",
  },
  {
    q: "Do you have recurring services?",
    a: "Yes! We have a Revival plan to fit everyone's needs! We start with a Full Revival Cleaning and then if you would like to set up a plan with us, we have Monthly, Every Other Month, Quarterly and Semi-Annual plans available. We also can build a custom plan for you!",
  },
  {
    q: "Do you require contracts?",
    a: "No, we don't have contracts, but do offer recurring services. We ask that if you decide to cancel that you do so at least 3 business days before your next service.",
  },
  {
    q: "When can my pets and kids go back on the turf?",
    a: "Once the solution we use on the turf dries, it can be used again. This typically only takes 15-20 minutes. Sometimes quicker in the Arizona heat!",
  },
];

// The four ready-made before/after comparison photos Ryan sent over --
// each is already a single combined image (side-by-side or stacked), so
// this section just displays them rather than building a custom
// slider/toggle component around separately-shot before/after pairs.
const BEFORE_AFTER_IMAGES = [
  { src: "/images/before-after/ba-sidebyside-1.jpg", alt: "Before and after: debris-covered turf next to the same corner fully cleaned" },
  { src: "/images/before-after/ba-labeled-1.jpg", alt: "Before and after: turf covered in leaves and debris, then fully cleaned" },
  { src: "/images/before-after/ba-stacked-1.jpg", alt: "Before and after: striped freshly-cleaned turf above the same lawn with scattered debris" },
  { src: "/images/before-after/ba-sidebyside-2.jpg", alt: "Before and after: turf with hose marks and flattened blades next to the same area brushed and fluffed" },
];

const GALLERY_IMAGES = [
  "/images/gallery/gallery-1.jpg",
  "/images/gallery/gallery-2.jpg",
  "/images/gallery/gallery-3.jpg",
  "/images/gallery/gallery-4.jpg",
  "/images/gallery/gallery-5.jpg",
  "/images/gallery/gallery-6.jpg",
  "/images/gallery/gallery-7.jpg",
  "/images/gallery/gallery-8.jpg",
  "/images/gallery/gallery-9.jpg",
];

export default function MarketingHomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
              Formerly Golden Turf Care
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl" style={{ color: BRAND_GREEN }}>
              Fresh, clean turf — expert artificial turf cleaning &amp; revival
            </h1>
            <p className="mt-5 text-lg" style={{ color: MUTED_GRAY }}>
              Based in Queen Creek and servicing the whole Phoenix Metro area. We deep-clean
              artificial turf and eliminate pet odor at the source, so your yard stays green,
              soft, and fresh year-round.
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
              <a
                href="tel:4803314596"
                className="text-base font-semibold"
                style={{ color: BRAND_GREEN }}
              >
                or call (480) 331-4596
              </a>
            </div>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image
              src="/images/hero/hero-1.jpg"
              alt="A recently cleaned artificial turf backyard with a paver patio in Queen Creek, AZ"
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
          Some of the services we offer at Valley Turf Revival
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

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {TURF_TASKS.map((task) => (
            <span
              key={task}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm"
              style={{ color: BRAND_GREEN }}
            >
              {task}
            </span>
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
              title="Turf Revival and Cleaning"
              body="Comprehensive cleaning services to keep your artificial turf looking and smelling fresh and vibrant."
            />
            <WhyCard
              title="Family Owned"
              body="Proudly family owned and operated, delivering personalized and trustworthy lawn care services."
            />
            <WhyCard
              title="Affordable Pricing"
              body="High quality artificial turf care at competitive prices tailored to your budget. We have a Revival package to meet everyone's needs."
            />
          </div>
        </div>
      </section>

      {/* Before & after */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          See the difference
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center" style={{ color: MUTED_GRAY }}>
          Real yards, real results — no filters, just a deep clean.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {BEFORE_AFTER_IMAGES.map((image) => (
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
      </section>

      {/* Our work gallery */}
      <section className="py-14" style={{ background: "#fff" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
            Our work
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {GALLERY_IMAGES.map((src) => (
              <div key={src} className="relative aspect-square overflow-hidden rounded-2xl">
                <Image
                  src={src}
                  alt="Artificial turf cleaned by Valley Turf Revival"
                  fill
                  sizes="(min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          Reviews
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2">
          <Stars />
          <span className="text-sm font-semibold" style={{ color: BRAND_GREEN }}>
            {GOOGLE_RATING.toFixed(1)} ({GOOGLE_REVIEW_COUNT} Google reviews)
          </span>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <div key={testimonial.name} className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-sm" style={{ color: MUTED_GRAY }}>
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <p className="mt-4 text-sm font-bold" style={{ color: BRAND_GREEN }}>
                {testimonial.name}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/reviews" className="text-sm font-bold" style={{ color: GOLD }}>
            Read more reviews &rarr;
          </Link>
        </div>
      </section>

      {/* Service area teaser */}
      <section className="py-14" style={{ background: "#fff" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
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
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-bold" style={{ color: BRAND_GREEN }}>
          Frequently Asked Questions
        </h2>
        <div className="mt-8 space-y-6">
          {HOME_FAQ.map((item) => (
            <div key={item.q} className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold" style={{ color: BRAND_GREEN }}>
                {item.q}
              </h3>
              <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
                {item.a}
              </p>
            </div>
          ))}
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
            Get a Free Quote
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

// Small inline 5-star glyph row -- avoids pulling in an icon library for
// one repeated element (hero + reviews section both show the real
// Google rating).
function Stars() {
  return (
    <span aria-hidden className="text-sm" style={{ color: "#f5b400" }}>
      &#9733;&#9733;&#9733;&#9733;&#9733;
    </span>
  );
}
