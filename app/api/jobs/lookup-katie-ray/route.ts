// One-time diagnostic (2026-09-22+). Same pattern used to find Alyssa
// Baldriche before her flip -- before setting a new customer's
// full_cleaning_months, need her jobber_client_id, her own Service
// Instructions text (to confirm which months), and her recent visit
// titles (to match her own naming convention for Full cleanings, the
// same way Baldriche's own history said "Baldriche - Full - Monthly").
//
// Name match is widened deliberately (full_name/first_name/last_name
// checked independently) after the Baldridge/Baldriche misspelling
// mistake -- a narrow exact-match filter can silently return nothing
// and look like "no customer found" instead of "wrong spelling".
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

  const { data: customers, error: customerError } = await supabaseServer
    .from("customers")
    .select(
      "jobber_client_id, full_name, first_name, last_name, service_instructions, full_cleaning_months"
    )
    .or(
      "full_name.ilike.%katie%,full_name.ilike.%ray%,first_name.ilike.%katie%,last_name.ilike.%ray%"
    );

  if (customerError) {
    return NextResponse.json(
      { success: false, error: customerError.message },
      { status: 500 }
    );
  }

  const rows = customers ?? [];

  const results = await Promise.all(
    rows.map(async (customer) => {
      const { data: visits } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, title, start_at, completed_at")
        .eq("jobber_client_id", customer.jobber_client_id)
        .order("start_at", { ascending: false })
        .limit(20);

      return {
        jobberClientId: customer.jobber_client_id,
        name:
          `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() ||
          customer.full_name,
        serviceInstructions: customer.service_instructions,
        currentFullCleaningMonths: customer.full_cleaning_months,
        recentVisitTitles: (visits ?? []).map((v) => ({
          title: v.title,
          startAt: v.start_at,
          completedAt: v.completed_at,
        })),
      };
    })
  );

  return NextResponse.json({ success: true, matchCount: results.length, results });
}
