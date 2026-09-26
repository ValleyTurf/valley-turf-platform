import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import {
  TESTIMONIALS,
  GOOGLE_RATING,
  GOOGLE_REVIEW_COUNT,
} from "./testimonials";

import { SERVICE_AREAS } from "./serviceAreas";

import { fetchLatestGoogleReviews } from "@/lib/googleReviews";
import { getFeaturedGalleryPhotos } from "@/lib/featuredGalleryPhotos";

export const metadata: Metadata = {
  title: "Artificial Turf Cleaning Phoenix AZ | Valley Turf Revival",
  description:
    "Professional artificial turf cleaning, pet odor removal, power brushing, and turf revival throughout Queen Creek, Gilbert, Chandler, Mesa, and the Phoenix Metro Area.",
  alternates: {
    canonical: "/",
  },
};

/*
|--------------------------------------------------------------------------
| HOMEPAGE IMAGES
|--------------------------------------------------------------------------
|
| To change a picture later, you can simply replace the corresponding
| image file in /public/images without changing the page structure.
|
|--------------------------------------------------------------------------
*/

/* HERO */
const HERO_IMAGE = "/images/hero/hero-1.jpg";

/* BEFORE / AFTER */
const BEFORE_AFTER_IMAGES = [
  {
    src: "/images/before-after/ba-sidebyside-1.jpg",
    alt: "Artificial turf before and after professional cleaning",
    caption: "Queen Creek  |  Pet Odor Removal",
  },
  {
    src: "/images/before-after/ba-labeled-1.jpg",
    alt: "Artificial turf before and after debris removal",
    caption: "Gilbert  |  Full Revival Cleaning",
  },
  {
    src: "/images/before-after/ba-stacked-1.jpg",
    alt: "Artificial turf before and after turf cleaning",
    caption: "Chandler  |  Power Brushing & Infill",
  },
  {
    src: "/images/before-after/ba-sidebyside-2.jpg",
    alt: "Artificial turf before and after power brushing",
    caption: "Scottsdale  |  Pet Stain Treatment",
  },
];

/* GALLERY */
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

/*
|--------------------------------------------------------------------------
| FAQ
|--------------------------------------------------------------------------
*/

const HOME_FAQ = [
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

/*
|--------------------------------------------------------------------------
| HOMEPAGE
|--------------------------------------------------------------------------
*/

export default async function MarketingHomePage() {
  const liveReviews = await fetchLatestGoogleReviews(3);

  const testimonials =
    liveReviews?.reviews?.length
      ? liveReviews.reviews
      : TESTIMONIALS;

  const rating =
    liveReviews?.rating || GOOGLE_RATING;

  const reviewCount =
    liveReviews?.reviewCount || GOOGLE_REVIEW_COUNT;

  const featuredPhotos = await getFeaturedGalleryPhotos();

  /*
  |--------------------------------------------------------------------------
  | Services
  |--------------------------------------------------------------------------
  */

  const serviceCards = [
    {
      icon: "✦",
      title: "Deep Turf Cleaning",
      text: "Remove dirt, debris, pet hair and built-up grime.",
      href: "/services",
    },
    {
      icon: "🐾",
      title: "Pet Odor Removal",
      text: "Target odors at the source, not just the smell.",
      href: "/services/pet-odor-removal",
    },
    {
      icon: "✣",
      title: "Power Brushing & Grooming",
      text: "Lift flattened fibers and restore appearance.",
      href: "/services",
    },
    {
      icon: "⁙",
      title: "Infill Refresh & Replacement",
      text: "Inspect, redistribute and replenish infill.",
      href: "/services",
    },
    {
      icon: "✹",
      title: "Stain & Spot Treatment",
      text: "Remove tough stains and problem areas.",
      href: "/services",
    },
    {
      icon: "▦",
      title: "Maintenance Plans",
      text: "Monthly, bi-monthly, quarterly and semi-annual.",
      href: "/services",
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | Process
  |--------------------------------------------------------------------------
  */

  const process = [
    {
      number: "01",
      title: "Inspect",
      text: "Assess your turf and identify problem areas.",
    },
    {
      number: "02",
      title: "Clear Debris",
      text: "Remove leaves, dirt, pet hair and buildup.",
    },
    {
      number: "03",
      title: "Deep Clean",
      text: "Thoroughly clean and target problem areas.",
    },
    {
      number: "04",
      title: "Treat Odors",
      text: "Neutralize pet odors at the source.",
    },
    {
      number: "05",
      title: "Power Brush",
      text: "Lift and separate blades for a fuller look.",
    },
    {
      number: "06",
      title: "Final Revival",
      text: "Final inspection and turf ready to enjoy.",
    },
  ];

  return (
    <main className="bg-white text-[#183d32]">

      {/* ================================================================
          HERO
      ================================================================ */}

      <section className="relative overflow-hidden">

        <div className="absolute inset-0">

          <Image
            src={HERO_IMAGE}
            alt="Beautiful freshly cleaned artificial turf backyard"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-r from-[#063f2f]/95 via-[#063f2f]/75 to-[#063f2f]/10" />

          <div className="absolute inset-0 bg-gradient-to-t from-[#063f2f]/40 via-transparent to-transparent" />

        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">

          <div className="max-w-3xl">

            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#f1c343] sm:text-base">
              Phoenix Metro Area Turf Specialists
            </p>

            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Professional Artificial Turf Cleaning{" "}
              <span className="text-[#f1c343]">
                in Phoenix
              </span>
            </h1>

            <div className="mt-5 text-3xl font-black italic text-[#f1c343] sm:text-4xl">
              Fresh. Clean. Turf.
            </div>

            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-white/90 sm:text-lg">
              Expert artificial turf cleaning, pet odor removal and turf
              revival for homeowners throughout Queen Creek, Gilbert,
              Chandler, Mesa and the Phoenix Metro Area.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">

              <Link
                href="/request-quote"
                className="rounded-xl bg-[#f1c343] px-7 py-3.5 text-sm font-black text-[#123e31] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#ffd45a] sm:text-base"
              >
                Get My Free Quote →
              </Link>

              <a
                href="tel:4803314596"
                className="rounded-xl border-2 border-white/80 bg-[#174734]/50 px-7 py-3.5 text-sm font-black text-white backdrop-blur transition hover:bg-[#174734] sm:text-base"
              >
                ☎ Call (480) 331-4596
              </a>

            </div>

          </div>

          {/* Hero Before / After */}

          <div className="mt-12 flex justify-end lg:absolute lg:bottom-16 lg:right-8 lg:mt-0 lg:w-[390px]">

            <div className="w-full rounded-2xl border-4 border-white bg-white p-1.5 shadow-2xl">

              <div className="grid grid-cols-2 overflow-hidden rounded-xl">

                <div className="relative aspect-[4/3]">

                  <Image
                    src={BEFORE_AFTER_IMAGES[0].src}
                    alt="Artificial turf before cleaning"
                    fill
                    sizes="200px"
                    className="object-cover"
                  />

                  <div className="absolute left-2 top-2 rounded-md bg-[#424b46] px-3 py-1 text-xs font-black text-white">
                    BEFORE
                  </div>

                </div>

                <div className="relative aspect-[4/3]">

                  <Image
                    src={HERO_IMAGE}
                    alt="Artificial turf after cleaning"
                    fill
                    sizes="200px"
                    className="object-cover"
                  />

                  <div className="absolute right-2 top-2 rounded-md bg-[#174734] px-3 py-1 text-xs font-black text-white">
                    AFTER
                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* ================================================================
          TRUST BAR
      ================================================================ */}

      <section className="bg-[#063f2f] text-white">

        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/15 sm:grid-cols-4">

          <TrustItem
            icon="♧"
            title="Family Owned"
            subtitle="& Operated"
          />

          <TrustItem
            icon="⌖"
            title="Proudly Serving"
            subtitle="the Phoenix Metro Area"
          />

          <TrustItem
            icon="♢"
            title="Turf Specialists"
            subtitle="You Can Trust"
          />

          <TrustItem
            icon="▦"
            title="Recurring Maintenance"
            subtitle="Plans Available"
          />

        </div>

      </section>

      {/* ================================================================
          SERVICES
      ================================================================ */}

      <section className="bg-white py-16 sm:py-20">

        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.5fr] lg:px-8">

          <div>

            <Eyebrow>
              Our Services
            </Eyebrow>

            <h2 className="mt-2 max-w-md text-4xl font-black leading-tight text-[#174734] sm:text-5xl">
              Complete Turf Revival Services
            </h2>

            <p className="mt-5 max-w-md text-base leading-7 text-[#5e7068]">
              We don&apos;t just clean your turf — we restore it. Our
              professional services remove buildup, eliminate odors,
              and bring your artificial grass back to life.
            </p>

            <Link
              href="/services"
              className="mt-7 inline-flex rounded-xl bg-[#f1c343] px-6 py-3.5 text-sm font-black text-[#123e31] transition hover:-translate-y-0.5"
            >
              Explore Our Services →
            </Link>

          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

            {serviceCards.map((service) => (

              <Link
                key={service.title}
                href={service.href}
                className="group rounded-xl border border-[#e4e9e3] bg-[#f7f8f4] p-5 text-center transition hover:-translate-y-1 hover:bg-white hover:shadow-lg"
              >

                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl text-[#174734] shadow-sm">
                  {service.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-tight text-[#174734] sm:text-base">
                  {service.title}
                </h3>

                <p className="mt-2 text-xs leading-5 text-[#5e7068] sm:text-sm">
                  {service.text}
                </p>

              </Link>

            ))}

          </div>

        </div>

      </section>

      {/* ================================================================
          PET ODOR
      ================================================================ */}

      <section className="bg-[#063f2f] text-white">

        <div className="mx-auto grid max-w-7xl lg:grid-cols-[0.8fr_1.2fr]">

          <div className="relative min-h-[320px]">

            <Image
              src={GALLERY_IMAGES[0]}
              alt="Dog enjoying freshly cleaned artificial turf"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />

          </div>

          <div className="grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_auto] lg:px-14 lg:py-16">

            <div>

              <Eyebrow light>
                Pet Odor Removal
              </Eyebrow>

              <h2 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
                Does Your Turf
                <br />
                Smell Like Pets?
              </h2>

              <p className="mt-5 max-w-xl text-base leading-7 text-white/80">
                Pet waste can build up in artificial turf over time.
                Our specialized cleaning process targets the source of
                the odor and leaves your turf fresh and clean.
              </p>

              <Link
                href="/services/pet-odor-removal"
                className="mt-7 inline-flex rounded-xl bg-[#f1c343] px-6 py-3.5 text-sm font-black text-[#123e31]"
              >
                Learn About Pet Odor Removal →
              </Link>

            </div>

            <div className="border-l border-white/20 pl-7">

              <OdorPoint text="Neutralizes pet odors" />
              <OdorPoint text="Removes bacteria and allergens" />
              <OdorPoint text="Restores turf appearance" />
              <OdorPoint text="Safe for kids & pets" />

            </div>

          </div>

        </div>

      </section>

      {/* ================================================================
          BEFORE / AFTER
      ================================================================ */}

      <section className="bg-[#f7f7f2] py-16 sm:py-20">

        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.65fr_1.35fr] lg:px-8">

          <div>

            <Eyebrow>
              Real Projects. Real Results.
            </Eyebrow>

            <h2 className="mt-2 text-4xl font-black leading-tight text-[#174734] sm:text-5xl">
              See the Revival
            </h2>

            <p className="mt-5 max-w-md leading-7 text-[#5e7068]">
              From pet-heavy yards to high-traffic areas, we bring
              artificial turf back to life. Here are just a few of
              our before and after transformations.
            </p>

            <Link
              href="/services"
              className="mt-7 inline-flex rounded-xl bg-[#174734] px-6 py-3.5 text-sm font-black text-white"
            >
              View More Before & Afters →
            </Link>

          </div>

          <div className="grid grid-cols-2 gap-4">

            {BEFORE_AFTER_IMAGES.map((image) => (

              <div key={image.src}>

                <div className="relative aspect-[1.8/1] overflow-hidden rounded-xl bg-white shadow-sm">

                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 1024px) 35vw, 50vw"
                    className="object-cover"
                  />

                </div>

                <p className="mt-2 text-xs font-semibold text-[#5e7068] sm:text-sm">
                  {image.caption}
                </p>

              </div>

            ))}

          </div>

        </div>

      </section>

      {/* ================================================================
          PROCESS
      ================================================================ */}

      <section className="relative overflow-hidden bg-[#063f2f] py-16 text-white sm:py-20">

        <div className="absolute inset-0 opacity-10">

          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />

        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="grid gap-10 lg:grid-cols-[0.55fr_1.45fr]">

            <div>

              <Eyebrow light>
                Our Revival Process
              </Eyebrow>

              <h2 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
                How It Works
              </h2>

              <p className="mt-5 max-w-md leading-7 text-white/75">
                A simple, effective process for a cleaner,
                healthier, better-looking lawn.
              </p>

              <Link
                href="/request-quote"
                className="mt-7 inline-flex rounded-xl bg-[#f1c343] px-6 py-3.5 text-sm font-black text-[#123e31]"
              >
                Get Your Free Quote →
              </Link>

            </div>

            <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">

              {process.map((step) => (

                <div
                  key={step.number}
                  className="flex gap-4"
                >

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1c343] text-xs font-black text-[#123e31]">
                    {step.number}
                  </div>

                  <div>

                    <h3 className="font-black">
                      {step.title}
                    </h3>

                    <p className="mt-1 text-sm leading-5 text-white/70">
                      {step.text}
                    </p>

                  </div>

                </div>

              ))}

            </div>

          </div>

        </div>

      </section>

      {/* ================================================================
          GALLERY
      ================================================================ */}

      <section className="bg-white py-16 sm:py-20">

        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.55fr_1.45fr] lg:px-8">

          <div>

            <Eyebrow>
              Our Work
            </Eyebrow>

            <h2 className="mt-2 text-4xl font-black text-[#174734]">
              Fresh. Clean. Turf.
            </h2>

            <p className="mt-5 max-w-md leading-7 text-[#5e7068]">
              Take a look at some of the artificial turf projects
              we&apos;ve cleaned and revived throughout the Phoenix Metro Area.
            </p>

            <Link
              href="/reviews"
              className="mt-7 inline-flex rounded-xl bg-[#f1c343] px-6 py-3.5 text-sm font-black text-[#123e31]"
            >
              View Our Work →
            </Link>

          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

            {GALLERY_IMAGES.slice(0, 6).map((src, index) => (

              <div
                key={src}
                className={`relative overflow-hidden rounded-xl ${
                  index === 0
                    ? "col-span-2 aspect-[2/1] sm:row-span-2 sm:aspect-auto"
                    : "aspect-[1.25/1]"
                }`}
              >

                <Image
                  src={src}
                  alt="Valley Turf Revival artificial turf cleaning project"
                  fill
                  sizes="(min-width: 1024px) 30vw, 50vw"
                  className="object-cover transition duration-500 hover:scale-105"
                />

              </div>

            ))}

          </div>

        </div>

      </section>

      {/* ================================================================
          CUSTOMER PROJECTS
      ================================================================ */}

      {featuredPhotos.length > 0 && (

        <section className="bg-[#f7f7f2] py-16">

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

            <div className="mb-8">

              <Eyebrow>
                Real Customer Projects
              </Eyebrow>

              <h2 className="mt-2 text-4xl font-black text-[#174734]">
                Our Recent Work
              </h2>

            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">

              {featuredPhotos.slice(0, 8).map((photo) => (

                <div
                  key={photo.url}
                  className="relative aspect-square overflow-hidden rounded-xl"
                >

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.alt}
                    className="h-full w-full object-cover transition duration-500 hover:scale-105"
                  />

                </div>

              ))}

            </div>

          </div>

        </section>

      )}

      {/* ================================================================
          REVIEWS
      ================================================================ */}

      <section className="bg-white py-16 sm:py-20">

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">

            <div>

              <Eyebrow>
                Customer Reviews
              </Eyebrow>

              <h2 className="mt-2 text-4xl font-black leading-tight text-[#174734]">
                What Our Customers Say
              </h2>

              <p className="mt-5 max-w-md leading-7 text-[#5e7068]">
                See what homeowners throughout the Phoenix Metro Area
                have to say about Valley Turf Revival.
              </p>

              <div className="mt-5">

                <Stars />

                <span className="ml-2 font-bold text-[#174734]">
                  {rating.toFixed(1)} ({reviewCount} Google reviews)
                </span>

              </div>

              <Link
                href="/reviews"
                className="mt-7 inline-flex rounded-xl bg-[#174734] px-6 py-3.5 text-sm font-black text-white"
              >
                Read More Reviews →
              </Link>

            </div>

            <div className="grid gap-4 md:grid-cols-3">

              {testimonials.slice(0, 3).map((testimonial, index) => (

                <div
                  key={`${testimonial.name}-${index}`}
                  className="rounded-xl border border-[#e6e9e4] bg-[#f8f9f5] p-6"
                >

                  <div className="text-[#f1b900]">
                    ★★★★★
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[#4e6159]">
                    “{testimonial.quote}”
                  </p>

                  <p className="mt-5 text-sm font-black text-[#174734]">
                    {testimonial.name}
                  </p>

                </div>

              ))}

            </div>

          </div>

        </div>

      </section>

      {/* ================================================================
          SERVICE AREAS
      ================================================================ */}

      <section className="relative overflow-hidden bg-[#063f2f] py-14 text-white sm:py-16">

        <div className="absolute inset-0">

          <Image
            src={GALLERY_IMAGES[8]}
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-25"
          />

          <div className="absolute inset-0 bg-[#063f2f]/85" />

        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="grid items-center gap-10 lg:grid-cols-[0.7fr_1.3fr]">

            <div>

              <Eyebrow light>
                Serving the Phoenix Metro Area
              </Eyebrow>

              <h2 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
                Artificial Turf Cleaning
                <br />
                Across the Phoenix Metro Area
              </h2>

              <p className="mt-4 max-w-lg text-white/75">
                From Queen Creek to Mesa and throughout the surrounding
                communities, we&apos;re your local artificial turf cleaning experts.
              </p>

              <Link
                href="/service-areas"
                className="mt-6 inline-flex rounded-xl border-2 border-white/60 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-[#174734]"
              >
                View All Service Areas →
              </Link>

            </div>

            <div className="flex flex-wrap gap-2">

              {SERVICE_AREAS.slice(0, 16).map((area) => (

                <Link
                  key={area.slug}
                  href={`/service-areas/${area.slug}`}
                  className="rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-[#f1c343] hover:text-[#123e31]"
                >
                  {area.name}
                </Link>

              ))}

            </div>

          </div>

        </div>

      </section>

      {/* ================================================================
          TURF CARE GUIDE
      ================================================================ */}

      <section className="bg-white py-16 sm:py-20">

        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.6fr_1.4fr] lg:px-8">

          <div>

            <Eyebrow>
              Tips & Resources
            </Eyebrow>

            <h2 className="mt-2 text-4xl font-black text-[#174734]">
              Turf Care Guide
            </h2>

            <p className="mt-5 max-w-md leading-7 text-[#5e7068]">
              Expert tips, guides and answers to your most common
              artificial turf questions.
            </p>

            <Link
              href="/turf-care-guide"
              className="mt-7 inline-flex rounded-xl bg-[#f1c343] px-6 py-3.5 text-sm font-black text-[#123e31]"
            >
              Visit the Turf Care Guide →
            </Link>

          </div>

          <div className="grid gap-4 sm:grid-cols-3">

            <GuideCard
              image={GALLERY_IMAGES[1]}
              title="How to Get Dog Urine Smell Out of Artificial Turf"
            />

            <GuideCard
              image={GALLERY_IMAGES[2]}
              title="How Often Should Artificial Turf Be Cleaned in Arizona?"
            />

            <GuideCard
              image={GALLERY_IMAGES[3]}
              title="Phoenix Artificial Turf Maintenance Guide"
            />

          </div>

        </div>

      </section>

      {/* ================================================================
          FINAL CTA
      ================================================================ */}

      <section className="relative overflow-hidden">

        <div className="absolute inset-0">

          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />

          <div className="absolute inset-0 bg-[#063f2f]/80" />

        </div>

        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-24">

          <h2 className="text-4xl font-black text-white sm:text-5xl">
            Ready for a Turf Revival?
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
            Get a free quote today and see the difference professional
            turf cleaning can make.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">

            <Link
              href="/request-quote"
              className="rounded-xl bg-[#f1c343] px-8 py-4 text-sm font-black text-[#123e31] shadow-lg sm:text-base"
            >
              Get My Free Quote →
            </Link>

            <a
              href="tel:4803314596"
              className="rounded-xl border-2 border-white/70 bg-[#174734]/50 px-8 py-4 text-sm font-black text-white backdrop-blur sm:text-base"
            >
              ☎ (480) 331-4596
            </a>

          </div>

        </div>

      </section>

    </main>
  );
}

/*
|--------------------------------------------------------------------------
| SMALL COMPONENTS
|--------------------------------------------------------------------------
*/

function Eyebrow({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <p
      className={`text-xs font-black uppercase tracking-[0.16em] ${
        light ? "text-[#f1c343]" : "text-[#c29420]"
      }`}
    >
      {children}
    </p>
  );
}

function TrustItem({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-h-[100px] items-center justify-center gap-3 px-4 py-5 text-center">

      <div className="text-3xl text-[#f1c343]">
        {icon}
      </div>

      <div>

        <div className="text-sm font-black leading-tight">
          {title}
        </div>

        <div className="text-xs font-semibold text-white/75">
          {subtitle}
        </div>

      </div>

    </div>
  );
}

function OdorPoint({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 py-3 last:border-0">

      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#f1c343] text-sm text-[#f1c343]">
        ✓
      </span>

      <span className="text-sm font-semibold text-white/90">
        {text}
      </span>

    </div>
  );
}

function Stars() {
  return (
    <span
      aria-hidden
      className="text-lg tracking-[0.12em] text-[#f1b900]"
    >
      ★★★★★
    </span>
  );
}

function GuideCard({
  image,
  title,
}: {
  image: string;
  title: string;
}) {
  return (
    <Link
      href="/turf-care-guide"
      className="group overflow-hidden rounded-xl border border-[#e4e9e3] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >

      <div className="relative aspect-[1.7/1] overflow-hidden">

        <Image
          src={image}
          alt={title}
          fill
          sizes="(min-width: 1024px) 25vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />

      </div>

      <div className="p-4">

        <h3 className="text-sm font-black leading-5 text-[#174734]">
          {title}
        </h3>

        <p className="mt-2 text-xs font-semibold text-[#5e7068]">
          Read More →
        </p>

      </div>

    </Link>
  );
}