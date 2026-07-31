// One-off diagnostic route: My Day is still showing straight-line
// estimates after GOOGLE_ROUTES_API_KEY was added, meaning
// lib/googleRoutes.ts's computeRouteLegs() is failing somewhere and
// falling back (by design). This calls Google's Routes API directly
// with two fixed Phoenix-area test points and returns the raw
// status/body, so we can see the exact error (401 = key/restriction
// problem, 403 = API not enabled or billing not on, 400 = malformed
// request) instead of guessing from Vercel's function logs.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Two real points a few miles apart in Phoenix, AZ — arbitrary, just
// need to be valid drivable coordinates.
const ORIGIN = { lat: 33.4484, lng: -112.074 };
const DESTINATION = { lat: 33.5104, lng: -112.0967 };

export async function GET() {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      problem: "GOOGLE_ROUTES_API_KEY is not set in this deployment's environment.",
    });
  }

  const body = {
    origin: { location: { latLng: { latitude: ORIGIN.lat, longitude: ORIGIN.lng } } },
    destination: {
      location: { latLng: { latitude: DESTINATION.lat, longitude: DESTINATION.lng } },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
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
          "X-Goog-FieldMask": "routes.legs.distanceMeters,routes.legs.duration",
        },
        body: JSON.stringify(body),
      }
    );

    const responseText = await response.text();
    let parsedBody: unknown = responseText;

    try {
      parsedBody = JSON.parse(responseText);
    } catch {
      // Leave as raw text if it's not JSON.
    }

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      keyPrefix: apiKey.slice(0, 6) + "...",
      keyLength: apiKey.length,
      googleResponse: parsedBody,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      problem: "Network error calling Google Routes API.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
