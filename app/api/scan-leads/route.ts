import { NextResponse, after } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendNewLeadAlerts } from "@/lib/notifications";
import { normalizeEmail, normalizePhone } from "@/lib/matching";

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
      .select("id, capture_leads, name, alias")
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

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);

    // Same person can scan the same (or a different) QR code more than
    // once — match on normalized phone/email against prior leads instead
    // of creating a fresh row every time.
    let existingLead: { id: string; scan_count: number | null } | null = null;

    if (normalizedPhone || normalizedEmail) {
      const orFilters = [
        normalizedPhone ? `normalized_phone.eq.${normalizedPhone}` : null,
        normalizedEmail ? `normalized_email.eq.${normalizedEmail}` : null,
      ]
        .filter(Boolean)
        .join(",");

      const { data: match } = await supabaseServer
        .from("leads")
        .select("id, scan_count")
        .or(orFilters)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      existingLead = match;
    }

    if (existingLead) {
      const { data, error } = await supabaseServer
        .from("leads")
        .update({
          scan_count: (existingLead.scan_count ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existingLead.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      // Repeat scan of a known lead — no alert, keeps texts/emails to
      // genuinely new leads only.
      return NextResponse.json({ ok: true, lead: data, duplicate: true });
    }

    const { data, error } = await supabaseServer
      .from("leads")
      .insert({
        first_name: firstName || null,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        normalized_phone: normalizedPhone,
        normalized_email: normalizedEmail,
        source: "QR Scan",
        status: "New",
        scan_id: scanId,
        campaign_id: campaignId,
        scan_count: 1,
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Scheduled to run after the response is sent, so the visitor's
    // redirect isn't held up waiting on email/SMS delivery.
    after(() =>
      sendNewLeadAlerts({
        name: name || null,
        phone: phone || null,
        email: email || null,
        source: "QR Scan",
        campaignName: campaign.alias || campaign.name || null,
      })
    );

    return NextResponse.json({ ok: true, lead: data });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
