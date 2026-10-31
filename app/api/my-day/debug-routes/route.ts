// One-off diagnostic for Ryan's 2026-11-02 report: My Day is showing
// straight-line distances for every leg again even after 85f146d
// (which fixed one failure mode -- an address-only stop dragging down
// the whole batched request -- but that fix didn't change anything
// visible, meaning something else is wrong). Read-only, admin-gated,
// manual-trigger only -- delete once this is sorted out.
//
// Reports, without ever printing the actual key:
//   1. Whether GOOGLE_ROUTES_API_KEY is set at all in this environment.
//   2. The result of a real computeRoutes call between two well-known,
//      easily-geocoded Phoenix-area addresses (not tied to any specific
//      customer), including the raw Google response/status on failure --
//      computeRouteLegs itself only logs this server-side and returns
//      null, so this reconstructs the same request to surface it here.
//   3. For today's (or ?date=) actual My Day visits, each one's resolved
//      jobber_client_id, customer_name, and whether contactLatLng found
//      real coordinates vs. only a text address vs. nothing at all --
//      so a page full of address-only or coordinate-less stops shows up
//      immediately instead of being guessed at.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  const dateParam = request.nextUrl.searchParams.get("date");
  const targetDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : toPhoenixDateString(new Date().toISOString());

  const result: Record<string, unknown> = {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyLength: apiKey ? apiKey.length : 0,
    targetDate,
  };

  // Real test call, independent of any customer data -- isolates
  // "is the key/API itself broken" from "is something about today's
  // specific addresses broken."
  if (apiKey) {
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
          body: JSON.stringify({
            origin: { address: "23391 S 228th St, Queen Creek, AZ 85142" },
            destination: { address: "3900 E Camelback Rd, Phoenix, AZ 85018" },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
            units: "IMPERIAL",
          }),
        }
      );

      const bodyText = await response.text();

      result.testCall = {
        status: response.status,
        ok: response.ok,
        body: bodyText.slice(0, 2000),
      };
    } catch (error) {
      result.testCall = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Today's actual visits + each customer's lat/lng vs. address-only vs.
  // nothing on file.
  const { data: visits, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, jobber_client_id, customer_name, start_at")
    .gte("start_at", `${targetDate}T00:00:00-07:00`)
    .lt("start_at", `${targetDate}T23:59:59-07:00`)
    .order("start_at", { ascending: true });

  if (visitsError) {
    result.visitsError = visitsError.message;
  } else {
    const clientIds = Array.from(
      new Set((visits ?? []).map((v) => v.jobber_client_id).filter(Boolean))
    ) as string[];

    const { data: contacts, error: contactsError } = clientIds.length
      ? await supabaseServer
          .from("customers")
          .select(
            "jobber_client_id, full_name, address_line_1, city, state, latitude, longitude"
          )
          .in("jobber_client_id", clientIds)
      : { data: [], error: null };

    if (contactsError) {
      result.contactsError = contactsError.message;
    }

    const contactById = new Map(
      (contacts ?? []).map((c) => [c.jobber_client_id as string, c])
    );

    result.visits = (visits ?? []).map((v) => {
      const contact = v.jobber_client_id
        ? contactById.get(v.jobber_client_id)
        : null;

      const hasLatLng =
        contact?.latitude != null && contact?.longitude != null;
      const address = contact
        ? [contact.address_line_1, contact.city, contact.state]
            .filter(Boolean)
            .join(", ")
        : "";

      return {
        customer_name: v.customer_name,
        start_at: v.start_at,
        hasLatLng,
        latitude: contact?.latitude ?? null,
        longitude: contact?.longitude ?? null,
        addressOnFile: address || null,
      };
    });
  }

  return NextResponse.json(result);
}
