// Real driving distance/time between an ordered chain of stops, via
// Google's Routes API (computeRoutes) — replaces the straight-line
// haversineMiles() estimate in lib/geoDistance.ts with an actual driving
// route when GOOGLE_ROUTES_API_KEY is configured.
//
// Deliberately fails soft: a missing key, a request over the waypoint
// limit, a non-2xx response, or any network error all return null rather
// than throwing, so callers (My Day) can fall back to the straight-line
// distance instead of breaking the page. Until GOOGLE_ROUTES_API_KEY is
// set in the environment, this always returns null immediately with no
// network call at all — so shipping this makes no behavioral difference
// until that env var actually exists.
import "server-only";

export type RouteStop = { lat: number; lng: number };

export type RouteLeg = {
  distanceMiles: number;
  durationMinutes: number;
};

const METERS_PER_MILE = 1609.344;

// Google's computeRoutes caps intermediate waypoints at 25 — origin +
// 25 intermediates + destination = 27 stops per request. A single
// crew's day is always far under this in practice; if it's ever
// exceeded this just fails soft into the straight-line fallback rather
// than sending a request Google would reject outright.
const MAX_STOPS_PER_REQUEST = 27;

function parseDurationSeconds(duration: string | null | undefined): number {
  if (!duration) return 0;

  // Google returns duration as a string like "1234s".
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration);

  return match ? Number(match[1]) : 0;
}

export async function computeRouteLegs(
  stops: RouteStop[]
): Promise<RouteLeg[] | null> {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;

  if (!apiKey || stops.length < 2 || stops.length > MAX_STOPS_PER_REQUEST) {
    return null;
  }

  const [origin, ...rest] = stops;
  const destination = rest[rest.length - 1];
  const intermediates = rest.slice(0, -1);

  const body = {
    origin: {
      location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    intermediates: intermediates.map((stop) => ({
      location: { latLng: { latitude: stop.lat, longitude: stop.lng } },
    })),
    travelMode: "DRIVE",
    // TRAFFIC_UNAWARE keeps this on the free Essentials SKU — a fixed
    // day-of-stops estimate doesn't need live-traffic-aware routing, and
    // this app has no live-updating map to show it on anyway.
    routingPreference: "TRAFFIC_UNAWARE",
    optimizeWaypointOrder: false,
    units: "IMPERIAL",
  };

  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          // FieldMask keeps the response (and what it counts against
          // quota/cost) limited to only what's actually used.
          "X-Goog-FieldMask":
            "routes.legs.distanceMeters,routes.legs.duration",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error(
        "Google Routes API request failed:",
        response.status,
        await response.text()
      );
      return null;
    }

    const json = (await response.json()) as {
      routes?: {
        legs?: { distanceMeters?: number; duration?: string }[];
      }[];
    };

    const legs = json.routes?.[0]?.legs;

    if (!legs || legs.length !== stops.length - 1) {
      return null;
    }

    return legs.map((leg) => ({
      distanceMiles: (leg.distanceMeters ?? 0) / METERS_PER_MILE,
      durationMinutes: parseDurationSeconds(leg.duration) / 60,
    }));
  } catch (error) {
    console.error("Google Routes API error:", error);
    return null;
  }
}
