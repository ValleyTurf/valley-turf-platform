export const dynamic = "force-dynamic";
export const revalidate = 0;

// ROADMAP.md Fresh Ideas #6 -- photo-based before/after gallery. Staff
// pick which of a consenting customer's visit photos are good enough for
// the marketing site; the site itself (app/site/page.tsx) only ever
// renders what's been featured here. See
// lib/featuredGalleryPhotos.ts for the data layer and migration
// 073_add_gallery_consent_and_featured_photos.sql for the schema.
//
// Note on timing: the marketing homepage's featured-photos section picks
// up new features within about an hour (same ISR cadence the page's live
// Google reviews already use, via lib/googleReviews.ts's
// `next: { revalidate: 3600 }`) rather than instantly -- this page's own
// list, however, updates immediately after every Feature/Un-feature.
import Link from "next/link";
import { getConsentingCustomerPhotos } from "@/lib/featuredGalleryPhotos";
import GalleryPhotoCard from "./GalleryPhotoCard";

export default async function GalleryPage() {
  const photos = await getConsentingCustomerPhotos();

  const featured = photos.filter((photo) => photo.featured);
  const unfeatured = photos.filter((photo) => !photo.featured);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Marketing
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Photo Gallery
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6b705c]">
              Pick the best visit photos from customers who&apos;ve said
              it&apos;s OK to feature them — only customers with the
              &quot;OK to feature photos&quot; box checked on their
              Property Profile show up here at all.
            </p>
          </div>

          <Link
            href="/reports"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Reports
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">
            Currently Featured ({featured.length})
          </h2>

          {featured.length === 0 ? (
            <p className="mt-2 text-sm text-[#6b705c]">
              Nothing featured yet — the homepage section stays hidden
              until at least one photo is featured below.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((photo) => (
                <GalleryPhotoCard key={photo.photoPath} photo={photo} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">
            Consenting Customers&apos; Photos ({unfeatured.length})
          </h2>

          {unfeatured.length === 0 ? (
            <p className="mt-2 text-sm text-[#6b705c]">
              {photos.length === 0
                ? "No consenting customers have visit photos yet — check the \"OK to feature photos\" box on a customer's Property Profile first."
                : "Everything available right now is already featured."}
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {unfeatured.map((photo) => (
                <GalleryPhotoCard key={photo.photoPath} photo={photo} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
