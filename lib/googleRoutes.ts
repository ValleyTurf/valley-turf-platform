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
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";

export type RouteStop = { lat: number; lng: number };

// A waypoint is either real coordinates (the normal case — every synced
// customer address) or a plain address string. The address form exists
// for fixed reference points like a home base/shop location that isn't
// itself a customer record with lat/lng on file — Google geocodes the
// string server-side, so no separate geocoding call is needed here.
export type RouteWaypoint = RouteStop | { address: string };

function isAddressWaypoint(
  waypoint: RouteWaypoint
): waypoint is { address: string } {
  return "address" in waypoint;
}

function toGoogleWaypoint(waypoint: RouteWaypoint) {
  if (isAddressWaypoint(waypoint)) {
    return { address: waypoint.address };
  }

  return {
    location: { latLng: { latitude: waypoint.lat, longitude: waypoint.lng } },
  };
}

export type RouteLeg = {
  distanceMiles: number;
  durationMinutes: number;
};

const METERS_PER_MILE = 1609.344;

// Overridable via env var (same pattern as lib/notifications.ts's
// ALERT_EMAIL/ALERT_PHONE) so a future move doesn't require a code
// change — this is the crew's starting/ending point for the day, used
// by My Day to add a "drive from home" leg before the first stop and a
// "drive home" leg after the last one.
export const HOME_BASE_ADDRESS =
  process.env.HOME_BASE_ADDRESS ||
  "23391 S 228th St, Queen Creek, AZ 85142";

// Google's computeRoutes caps intermediate waypoints at 25 — origin +
// 25 intermediates + destination = 27 stops per request. A single
// crew's day is always far under this in practice; if it's ever
// exceeded this just fails soft into the straight-line fallback rather
// than sending a request Google would reject outright.
const MAX_STOPS_PER_REQUEST = 27;

// Cached for 30 days on success -- the real driving distance between
// two fixed points doesn't meaningfully change day to day under
// TRAFFIC_UNAWARE routing, so this is just about not re-asking Google
// the same question on every page load. A failed attempt (quota,
// network, bad response) is cached much more briefly -- long enough
// that a burst of page loads during an outage doesn't multiply the
// damage, short enough to notice as soon as Google is reachable again.
const CACHE_TTL_SUCCESS_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_TTL_FAILURE_MS = 15 * 60 * 1000;

function canonicalWaypoint(waypoint: RouteWaypoint): string {
  if (isAddressWaypoint(waypoint)) {
    return `a:${waypoint.address.trim().toLowerCase()}`;
  }

  // Fixed precision so float formatting differences (or the occasional
  // re-geocode landing a few millimeters off) don't silently bust the
  // cache for what's really the same spot.
  return `c:${waypoint.lat.toFixed(6)},${waypoint.lng.toFixed(6)}`;
}

function cacheKeyFor(stops: RouteWaypoint[]): string {
  const canonical = stops.map(canonicalWaypoint).join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// undefined = no usable cache entry, go ask Google. null = a cached
// failure still within its (short) retry window, soft-fail immediately
// without spending another request. Anything else = a cached success.
async function readRouteCache(
  cacheKey: string
): Promise<RouteLeg[] | null | undefined> {
  try {
    const { data } = await supabaseServer
      .from("route_cache")
      .select("legs, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (!data) return undefined;

    const ageMs = Date.now() - new Date(data.fetched_at).getTime();
    const ttl = data.legs === null ? CACHE_TTL_FAILURE_MS : CACHE_TTL_SUCCESS_MS;

    if (ageMs > ttl) return undefined;

    return data.legs as RouteLeg[] | null;
  } catch (error) {
    // The cache is purely an optimization -- any problem reading it
    // (including the migration not having been run yet) should fall
    // through to asking Google directly, never break the page.
    console.error("route_cache read failed:", error);
    return undefined;
  }
}

async function writeRouteCache(
  cacheKey: string,
  stops: RouteWaypoint[],
  legs: RouteLeg[] | null
): Promise<void> {
  try {
    await supabaseServer.from("route_cache").upsert({
      cache_key: cacheKey,
      stops,
      legs,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("route_cache write failed:", error);
  }
}

function parseDurationSeconds(duration: string | null | undefined): number {
  if (!duration) return 0;

  // Google returns duration as a string like "1234s".
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration);

  return match ? Number(match[1]) : 0;
}

export async function computeRouteLegs(
  stops: RouteWaypoint[]
): Promise<RouteLeg[] | null> {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;

  if (!apiKey || stops.length < 2 || stops.length > MAX_STOPS_PER_REQUEST) {
    return null;
  }

  const cacheKey = cacheKeyFor(stops);
  const cached = await readRouteCache(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const [origin, ...rest] = stops;
  const destination = rest[rest.length - 1];
  const intermediates = rest.slice(0, -1);

  const body = {
    origin: toGoogleWaypoint(origin),
    destination: toGoogleWaypoint(destination),
    intermediates: intermediates.map(toGoogleWaypoint),
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
      await writeRouteCache(cacheKey, stops, null);
      return null;
    }

    const json = (await response.json()) as {
      routes?: {
        legs?: { distanceMeters?: number; duration?: string }[];
      }[];
    };

    const legs = json.routes?.[0]?.legs;

    if (!legs || legs.length !== stops.length - 1) {
      await writeRouteCache(cacheKey, stops, null);
      return null;
    }

    const result = legs.map((leg) => ({
      distanceMiles: (leg.distanceMeters ?? 0) / METERS_PER_MILE,
      durationMinutes: parseDurationSeconds(leg.duration) / 60,
    }));

    await writeRouteCache(cacheKey, stops, result);
    return result;
  } catch (error) {
    console.error("Google Routes API error:", error);
    await writeRouteCache(cacheKey, stops, null);
    return null;
  }
}
