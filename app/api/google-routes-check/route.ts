// Round 2: the first version of this route hand-copied a request body
// and got a real result (ok:true, real leg) — meaning the API
// key/billing/enablement is all fine. So the bug must be a difference
// between that hand-copied body and what lib/googleRoutes.ts's real
// computeRouteLegs() actually sends (it additionally sends an
// `intermediates` array and `optimizeWaypointOrder`). This calls the
// REAL function directly — the exact same code path My Day uses — for
// both a 2-stop case (empty intermediates) and a 3-stop case (one real
// intermediate + optimizeWaypointOrder in play), to isolate which shape
// Google is rejecting.
import { NextResponse } from "next/server";
import { computeRouteLegs } from "@/lib/googleRoutes";

export const dynamic = "force-dynamic";

const POINT_A = { lat: 33.4484, lng: -112.074 };
const POINT_B = { lat: 33.4784, lng: -112.084 };
const POINT_C = { lat: 33.5104, lng: -112.0967 };

// Mirrors computeRouteLegs()'s exact request body (intermediates +
// optimizeWaypointOrder included) but returns the raw Google response
// text directly in this JSON instead of only console.error-ing it, so
// the real error is visible without needing to dig through Vercel's
// function logs.
async function rawThreeStopRequest(apiKey: string) {
  const body = {
    origin: { location: { latLng: { latitude: POINT_A.lat, longitude: POINT_A.lng } } },
    destination: {
      location: { latLng: { latitude: POINT_C.lat, longitude: POINT_C.lng } },
    },
    intermediates: [
      { location: { latLng: { latitude: POINT_B.lat, longitude: POINT_B.lng } } },
    ],
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    optimizeWaypointOrder: false,
    units: "IMPERIAL",
  };

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

  const text = await response.text();
  let parsed: unknown = text;

  try {
    parsed = JSON.parse(text);
  } catch {
    // leave as raw text
  }

  return { status: response.status, ok: response.ok, body: parsed };
}

export async function GET() {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ keyPresent: false });
  }

  const [twoStopResult, threeStopResult, rawThreeStop] = await Promise.all([
    computeRouteLegs([POINT_A, POINT_C]),
    computeRouteLegs([POINT_A, POINT_B, POINT_C]),
    rawThreeStopRequest(apiKey),
  ]);

  return NextResponse.json({
    keyPresent: true,
    keyLength: apiKey.length,
    twoStopResult,
    threeStopResult,
    rawThreeStopRequest: rawThreeStop,
    note: "twoStopResult/threeStopResult null means computeRouteLegs() failed and fell back. rawThreeStopRequest shows Google's actual response for that same request shape, whether it succeeded or not.",
  });
}
