// One-time diagnostic (2026-09-22). Ryan still isn't seeing today's 2
// quotes in Past Quotes on their customer pages after the
// getNativeQuotesForCustomer fix (commit 7d0f194) shipped. That fix
// matches quotes to a customer via quotes.customer_id === the page's
// jobberClientId -- this dumps the most recent quotes as-is so we can
// see whether customer_id is actually set on them (a quote created for
// a lead rather than an existing customer stays customer_id: null until
// the lead accepts and gets converted -- see lib/quoteJobConversion.ts),
// and, if so, whether it matches the customer id in the page URL Ryan is
// looking at. Admin-gated, read-only. Not nested under any PUBLIC_PATHS
// prefix (see proxy.ts) -- see the /api/leads/debug-recent-alerts
// mistake from earlier today for why that matters.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("quotes")
    .select(
      "id, quote_number, customer_id, lead_id, recipient_name, status, service_category, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    count: (data ?? []).length,
    quotes: data ?? [],
  });
}
