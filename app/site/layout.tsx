import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "./config";
import { GOOGLE_RATING, GOOGLE_REVIEW_COUNT } from "./testimonials";

// Jobber Independence Roadmap -- public marketing site, served on
// valleyturfrevival.com / www.valleyturfrevival.com only (see proxy.ts's
// MARKETING_HOSTS + marketingRewritePath). This nested layout overrides
// the root layout's (app/layout.tsx) global `robots: { index: false,
// follow: false }` -- that setting exists to keep the internal CRM's
// /login page out of search results, but it would just as silently keep
// this entire marketing site out of Google too if left unset here. Next
// merges metadata per-field down the segment tree, so this object wins
// for every page under app/site.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Valley Turf Revival | Artificial Turf Cleaning & Pet Odor Removal",
    template: "%s | Valley Turf Revival",
  },
  description:
    "Professional artificial turf cleaning and pet odor removal serving Queen Creek and the greater Phoenix/East Valley area. Free quotes, licensed & experienced crews.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    siteName: "Valley Turf Revival",
    type: "website",
    url: SITE_URL,
    // Real photo (public/images/hero/hero-1.jpg, 1200x1600 -- its actual
    // dimensions, not a guessed/standard OG size) so a link to the site
    // shared in a text, Slack, or Facebook post shows an actual preview
    // instead of nothing. Every page under app/site inherits this unless
    // it sets its own openGraph.images.
    images: [
      {
        url: "/images/hero/hero-1.jpg",
        width: 1200,
        height: 1600,
        alt: "Artificial turf cleaned by Valley Turf Revival",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Valley Turf Revival | Artificial Turf Cleaning & Pet Odor Removal",
    description:
      "Professional artificial turf cleaning and pet odor removal serving Queen Creek and the greater Phoenix/East Valley area.",
    images: ["/images/hero/hero-1.jpg"],
  },
};

// Sitewide Organization schema -- tells Google this is one business
// entity (as opposed to the page-level LocalBusiness/FAQPage schema on
// individual service-area pages). Uses the same static, real rating/
// review-count fallback shown elsewhere on the site (app/site/
// testimonials.ts) rather than a live fetch here, so this doesn't add a
// Google Places API call to every single marketing-site page load on top
// of the ones the homepage and service-area pages already make.
const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "Valley Turf Revival",
  alternateName: "Golden Turf Care",
  url: SITE_URL,
  logo: `${SITE_URL}/branding/logo.png`,
  image: `${SITE_URL}/images/hero/hero-1.jpg`,
  telephone: "+14803314596",
  email: "valleyturfrevival@gmail.com",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Queen Creek",
    addressRegion: "AZ",
    addressCountry: "US",
  },
  areaServed: {
    "@type": "AdministrativeArea",
    name: "Phoenix/East Valley, Arizona",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: GOOGLE_RATING,
    reviewCount: GOOGLE_REVIEW_COUNT,
  },
};

const NAV_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/service-areas", label: "Service areas" },
  { href: "/reviews", label: "Reviews" },
  { href: "/about", label: "About" },
];

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";
const BG = "#f5f4ef";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: BG, color: BRAND_GREEN }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_SCHEMA) }}
      />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f4ef]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.svg" alt="Valley Turf Revival" className="h-10 w-auto" />
          <span className="hidden text-sm font-bold uppercase tracking-[0.15em] sm:inline" style={{ color: BRAND_GREEN }}>
            Valley Turf Revival
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold transition-colors hover:opacity-70"
              style={{ color: BRAND_GREEN }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="tel:4803314596"
            className="hidden text-sm font-semibold sm:inline"
            style={{ color: MUTED_GRAY }}
          >
            (480) 331-4596
          </a>
          <Link
            href="/request-quote"
            className="rounded-full px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: BRAND_GREEN }}
          >
            Get a Free Quote
          </Link>
        </div>
      </div>

      {/* Mobile nav row -- the header above collapses to just logo + CTA
          below md, so the section links still need to be reachable. */}
      <nav className="flex items-center gap-5 overflow-x-auto px-4 pb-3 md:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap text-sm font-semibold"
            style={{ color: BRAND_GREEN }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-black/5" style={{ background: "#fff" }}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.svg" alt="Valley Turf Revival" className="mb-3 h-9 w-auto" />
          <p className="text-sm" style={{ color: MUTED_GRAY }}>
            Artificial turf cleaning and pet odor removal, based in Queen Creek and serving the
            greater Phoenix/East Valley area.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            Services
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/services/turf-cleaning" className="hover:underline" style={{ color: MUTED_GRAY }}>
                Turf cleaning
              </Link>
            </li>
            <li>
              <Link href="/services/pet-odor-removal" className="hover:underline" style={{ color: MUTED_GRAY }}>
                Pet odor removal
              </Link>
            </li>
            <li>
              <Link href="/service-areas" className="hover:underline" style={{ color: MUTED_GRAY }}>
                All service areas
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            Company
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/about" className="hover:underline" style={{ color: MUTED_GRAY }}>
                About us
              </Link>
            </li>
            <li>
              <Link href="/reviews" className="hover:underline" style={{ color: MUTED_GRAY }}>
                Reviews
              </Link>
            </li>
            <li>
              <Link href="/request-quote" className="hover:underline" style={{ color: MUTED_GRAY }}>
                Free quote
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            Contact
          </h2>
          <ul className="space-y-2 text-sm" style={{ color: MUTED_GRAY }}>
            <li>
              <a href="tel:4803314596" className="hover:underline">
                (480) 331-4596
              </a>
            </li>
            <li>
              <a href="mailto:valleyturfrevival@gmail.com" className="hover:underline">
                valleyturfrevival@gmail.com
              </a>
            </li>
            <li>Queen Creek, AZ</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-black/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ color: MUTED_GRAY }}>
          <span>&copy; {new Date().getFullYear()} Valley Turf Revival. All rights reserved.</span>
          <span className="flex gap-4">
            <a href="/privacy-policy" className="hover:underline">
              Privacy Policy
            </a>
            <a href="/terms-and-conditions" className="hover:underline">
              Terms &amp; Conditions
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
