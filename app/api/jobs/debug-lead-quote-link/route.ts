// One-time diagnostic (2026-09-22). Ryan's got 2 quotes (Jennifer Kasten,
// Michael Andre) sitting with customer_id: null / lead_id set -- see
// debug-recent-quotes. Ryan says these leads should already have a
// customer record (request-quote/actions.ts's createNativeCustomer call
// does exactly that for a "Website Form" lead). If so, the bug isn't
// "no customer exists" -- it's that createQuote (quotes/actions.ts) never
// looks up the lead's already-linked jobber_client_id, it just takes
// whatever customer_id the form posted (blank, when a lead was picked).
// This checks both leads directly: do they have jobber_client_id set,
// and does a matching customers row actually exist.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const LEAD_IDS = [
  "355203a5-61f6-4145-9851-093e8c62ea52", // Michael Andre
  "444e8f4b-8b19-4c40-97f2-a0d23e6d0e25", // Jennifer Kasten
];

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data: leads, error: leadsError } = await supabaseServer
    .from("leads")
    .select("id, first_name, last_name, jobber_client_id, source, created_at")
    .in("id", LEAD_IDS);

  if (leadsError) {
    return NextResponse.json({ success: false, error: leadsError.message }, { status: 500 });
  }

  const clientIds = (leads ?? [])
    .map((lead) => lead.jobber_client_id as string | null)
    .filter((id): id is string => Boolean(id));

  const { data: customers, error: customersError } =
    clientIds.length > 0
      ? await supabaseServer
          .from("customers")
          .select("jobber_client_id, full_name, email, phone")
          .in("jobber_client_id", clientIds)
      : { data: [], error: null };

  if (customersError) {
    return NextResponse.json({ success: false, error: customersError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    leads: leads ?? [],
    matchingCustomers: customers ?? [],
  });
}
