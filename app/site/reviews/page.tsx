import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reviews",
  description: "See what customers say about Valley Turf Revival's artificial turf cleaning and pet odor removal service.",
  alternates: { canonical: "/reviews" },
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

// Reuses the same google_review_url column Settings > Notifications
// already collects for the automated post-visit review-request text/email
// (lib/reviewRequests.ts) -- rather than hand-writing testimonial copy
// here, this links straight to the real, live Google reviews once Ryan
// sets that field. No fabricated quotes on a page real customers can
// compare against the real review page.
async function getGoogleReviewUrl(): Promise<string | null> {
  const { data } = await supabaseServer
    .from("review_request_settings")
    .select("google_review_url")
    .maybeSingle();

  return (data as { google_review_url: string | null } | null)?.google_review_url ?? null;
}

export default async function ReviewsPage() {
  const googleReviewUrl = await getGoogleReviewUrl();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
        Reviews
      </p>
      <h1 className="mt-2 text-4xl font-bold" style={{ color: BRAND_GREEN }}>
        What our customers say
      </h1>
      <p className="mt-6 text-lg" style={{ color: MUTED_GRAY }}>
        {googleReviewUrl
          ? "Read our latest reviews directly on Google, or leave one of your own if you've worked with us."
          : "We're building out our review presence — check back soon, or reach out directly and we're happy to share references."}
      </p>

      {googleReviewUrl && (
        <a
          href={googleReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block rounded-full px-7 py-3 text-base font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: BRAND_GREEN }}
        >
          Read our Google reviews
        </a>
      )}

      <div className="mt-14 rounded-3xl p-10" style={{ background: BRAND_GREEN }}>
        <h2 className="text-2xl font-bold text-white">Ready to see the difference for yourself?</h2>
        <p className="mt-2 text-white/80">Get a free quote — usually a response within one business day.</p>
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
