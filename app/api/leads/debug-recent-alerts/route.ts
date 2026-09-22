// One-time diagnostic (2026-09-22). Ryan reported no new-lead
// notifications today. sendNewLeadAlerts only fires from
// app/api/scan-leads/route.ts (QR scan capture), gated on
// RESEND_API_KEY/TWILIO_* being set -- if either the key rotated/expired
// or no lead actually came in, the symptom looks the same from the
// outside ("no notification"). This checks both: whether the env vars
// are actually present in this deployment, and what leads (if any) have
// come in recently and from which source/campaign.
//
// Read-only, admin-gated, manual-trigger only. Never returns the actual
// key/token values, only whether each is set.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, source, status, campaign_id, scan_count, created_at, last_seen_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY ? "set" : "MISSING",
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? "set" : "MISSING",
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? "set" : "MISSING",
      TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER ? "set" : "MISSING",
      ALERT_EMAIL: process.env.ALERT_EMAIL || "(default: valleyturfrevival@gmail.com)",
      ALERT_PHONE: process.env.ALERT_PHONE || "(default: +14803314596)",
    },
    leadsLast72h: leads?.length ?? 0,
    leads: leads ?? [],
  });
}
