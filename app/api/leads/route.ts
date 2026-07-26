import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Public endpoint: meant to be called by an external automation (e.g. a
// Jobber automation or Zapier zap posting new client/request info) rather
// than by anything inside this app — nothing in this codebase calls it.
// Since it's listed in proxy.ts's PUBLIC_PATHS (no session cookie will
// ever be present), it guards itself with its own shared-secret check,
// the same pattern used by /api/jobber/process-webhooks.
function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.LEADS_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("LEADS_WEBHOOK_SECRET is not configured.");
    return false;
  }

  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${expectedSecret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const firstName = body.first_name ?? body.firstName ?? null;
    const lastName = body.last_name ?? body.lastName ?? null;
    const email = body.email ?? null;
    const phone = body.phone ?? null;
    const address = body.address ?? null;
    const city = body.city ?? null;
    const state = body.state ?? null;
    const zip = body.zip ?? body.postal_code ?? null;
    const source = body.source ?? "Jobber";
    const notes = body.notes ?? null;
    const jobberClientId = body.jobber_client_id ?? body.jobberClientId ?? null;
    const jobberRequestId =
      body.jobber_request_id ?? body.jobberRequestId ?? null;

    const { data, error } = await supabaseServer
      .from("leads")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        address,
        city,
        state,
        zip,
        source,
        notes,
        jobber_client_id: jobberClientId,
        jobber_request_id: jobberRequestId,
        status: "New",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, lead: data });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}