// Live Google reviews for the marketing site (Ryan's request: always show
// the 3 *newest* Google reviews, not a hand-picked/static set). Requires
// two env vars, neither set yet as of this writing:
//
//   GOOGLE_PLACES_API_KEY -- a key with the (legacy) "Places API" enabled
//     on the same Google Cloud project as GOOGLE_ADDRESS_VALIDATION_API_KEY
//     / GOOGLE_ROUTES_API_KEY (lib/addressValidation.ts, lib/googleRoutes.ts).
//     Deliberately the legacy Places API, not "Places API (New)" -- only
//     the legacy Place Details endpoint supports reviews_sort=newest.
//     Google's newer API always returns whatever it considers "most
//     relevant," with no way to ask for newest-first, which doesn't fit
//     what Ryan asked for.
//   GOOGLE_PLACE_ID -- Valley Turf Revival's Google Business Profile
//     Place ID. Find it with Google's own Place ID Finder:
//     https://developers.google.com/maps/documentation/places/web-service/place-id
//     (search the business name/address, copy the Place ID shown).
//
// Until both are set this always returns null and callers fall back to
// the static TESTIMONIALS in app/site/testimonials.ts -- same
// "gracefully degrade until configured" pattern as the other two Google
// integrations above, so a missing key never breaks the build or the
// page, it just means the site shows the old static quotes.
import "server-only";

export type GoogleReview = {
  quote: string;
  name: string;
};

export type GoogleReviewsResult = {
  reviews: GoogleReview[];
  rating: number;
  reviewCount: number;
};

const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

type PlaceDetailsReview = {
  author_name: string;
  rating: number;
  text: string;
  time: number;
};

type PlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    rating?: number;
    user_ratings_total?: number;
    reviews?: PlaceDetailsReview[];
  };
};

// count caps at 5 -- Google's Place Details endpoint never returns more
// than 5 reviews regardless of what's asked for.
export async function fetchLatestGoogleReviews(
  count = 3
): Promise<GoogleReviewsResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return null;
  }

  const url = new URL(PLACE_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "rating,user_ratings_total,reviews");
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("key", apiKey);

  try {
    // Revalidated hourly rather than fetched on every homepage visit --
    // review content doesn't change minute to minute, and Google's ToS
    // caps how long review content may be cached, so this stays well
    // inside that window while still sparing API quota.
    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("Google Places Details request failed:", response.status);
      return null;
    }

    const data = (await response.json()) as PlaceDetailsResponse;

    if (data.status !== "OK" || !data.result) {
      console.error(
        "Google Places Details returned a non-OK status:",
        data.status,
        data.error_message
      );
      return null;
    }

    const reviews = (data.result.reviews ?? [])
      // Belt-and-suspenders -- reviews_sort=newest should already do
      // this, but sorting client-side too means a future Google API
      // change silently degrading the sort order doesn't un-do "always
      // the newest 3."
      .slice()
      .sort((a, b) => b.time - a.time)
      .slice(0, count)
      .map((review) => ({
        quote: review.text,
        name: review.author_name,
      }));

    return {
      reviews,
      rating: data.result.rating ?? 0,
      reviewCount: data.result.user_ratings_total ?? 0,
    };
  } catch (error) {
    console.error("Google Places Details fetch error:", error);
    return null;
  }
}
