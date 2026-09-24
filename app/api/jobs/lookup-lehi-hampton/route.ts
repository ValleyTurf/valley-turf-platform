// One-time diagnostic (2026-09-24). Ryan: "Lehi Cove and Hampton Villas
// do not want to receive any of the notifications, can we turn them off
// for some customers?" -- need to confirm these are real customer
// records (not leads) and see what contact info/type they have before
// designing a per-customer notification opt-out.
//
// Read-only, admin-gated, manual-trigger only. Does not write anything.
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

  const { data: customers, error } = await supabaseServer
    .from("customers")
    .select(
      "jobber_client_id, full_name, first_name, last_name, company_name, email, phone, status"
    )
    .or(
      [
        "full_name.ilike.%lehi%",
        "full_name.ilike.%hampton%",
        "company_name.ilike.%lehi%",
        "company_name.ilike.%hampton%",
      ].join(",")
    );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, matchCount: customers?.length ?? 0, customers });
}
