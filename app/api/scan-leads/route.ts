import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Public endpoint: called from the scan capture landing page (app/r/[slug]/ScanCapture.tsx).
// Only accepts a scan_id/campaign_id pair that actually exists and belongs to a
// campaign with capture_leads enabled, to keep this from being an open lead-spam endpoint.
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const scanId = typeof body.scan_id === "string" ? body.scan_id : null;
    const campaignId =
      typeof body.campaign_id === "string" ? body.campaign_id : null;

    if (!scanId || !campaignId) {
      return NextResponse.json(
        { ok: false, error: "Missing scan_id or campaign_id." },
        { status: 400 }
      );
    }

    const { data: scan, error: scanLookupError } = await supabaseServer
      .from("scans")
      .select("id, campaign_id")
      .eq("id", scanId)
      .single();

    if (scanLookupError || !scan || scan.campaign_id !== campaignId) {
      return NextResponse.json(
        { ok: false, error: "Unrecognized scan." },
        { status: 400 }
      );
    }

    const { data: campaign, error: campaignLookupError } = await supabaseServer
      .from("campaigns")
      .select("id, capture_leads")
      .eq("id", campaignId)
      .single();

    if (
      campaignLookupError ||
      !campaign ||
      campaign.capture_leads !== true
    ) {
      return NextResponse.json(
        { ok: false, error: "Lead capture is not enabled for this campaign." },
        { status: 400 }
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!phone && !email) {
      return NextResponse.json(
        { ok: false, error: "Phone or email is required." },
        { status: 400 }
      );
    }

    const [firstName, ...rest] = name.split(" ").filter(Boolean);
    const lastName = rest.join(" ") || null;

    const { data, error } = await supabaseServer
      .from("leads")
      .insert({
        first_name: firstName || null,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        source: "QR Scan",
        status: "New",
        scan_id: scanId,
        campaign_id: campaignId,
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
