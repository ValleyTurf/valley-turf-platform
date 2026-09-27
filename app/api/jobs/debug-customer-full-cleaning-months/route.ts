// Ryan (2026-09-27): Alexis Lytle's brand-new QUARTERLY job's only
// visit is titled "Lytle - Maintenance - Monthly" -- despite the job
// itself never being part of the Full/Maintenance convention (she's a
// new customer, never processed by any flip-*-full-months route).
//
// Hypothesis: customers.full_cleaning_months (schema-drift column, not
// in any tracked migration -- see 086's own header note on this) may
// default to '{}' (empty array) rather than NULL for every row,
// including brand-new customers who were never explicitly opted into
// the convention. lib/nativeJobs.ts's resolveMonthlyVisitTitle()
// treats ANY non-null array (including a legitimately-empty one, for
// "Maintenance Only" customers like Tillawi/Kamal/Kuszka/Cox/Haynes/
// Hensley) as "this customer IS in the convention, with zero Full
// months" -- so if the column defaults to '{}' for everyone, every new
// customer's recurring visits get silently mislabeled "Maintenance -
// Monthly" regardless of their real service or cadence.
//
// Pulls the raw column for whichever customers are named, to confirm
// or rule this out before touching any code.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const names = request.nextUrl.searchParams.get("names");
  const nameList = names
    ? names.split(",").map((n) => n.trim()).filter(Boolean)
    : ["Lytle", "Johnson", "Stych"];

  const results = await Promise.all(
    nameList.map(async (name) => {
      const { data, error } = await supabaseServer
        .from("customers")
        .select(
          "jobber_client_id, first_name, last_name, full_cleaning_months, service_instructions, created_at"
        )
        .or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%`);

      return { searchedFor: name, error: error?.message ?? null, customers: data ?? [] };
    })
  );

  return NextResponse.json({ success: true, results });
}
