// One-off, single-customer action (2026-09-22). Roadmap item 19's real
// first test case, per Ryan's explicit instruction not to touch any
// other customer's data while this is being built and verified.
//
// Hardcoded to exactly one jobberClientId on purpose -- this is not a
// generic "apply to everyone" tool (that's a separate, later step Ryan
// hasn't approved yet). It does two things, both scoped to Alyssa
// Baldriche only:
//   1. Sets customers.full_cleaning_months to [3,6,9,12] (Mar/Jun/Sep/
//      Dec -- confirmed with Ryan earlier as her Full-cleaning cadence,
//      and matches her own Service Instructions text: "Full Cleaning -
//      Mar, June, Sept, Dec"). This is what lib/nativeJobs.ts's
//      generateUpcomingNativeVisits now checks for any NEW visit it
//      generates going forward.
//   2. Retitles her ALREADY-generated future visits that fall in one of
//      those months (generated before this feature existed, so they
//      still carry the job's generic title) to match her own historical
//      convention: "Baldriche - Full - Monthly" -- exactly what her own
//      past completed visits already say for June/September (see the
//      2026-09-21 diagnostic). Visits outside those months are left
//      completely untouched.
//
// Dry-run by default (?apply=true to write), admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BALDRICHE_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC85OTcyMjA3Mw==";
const FULL_MONTHS = [3, 6, 9, 12];
const FULL_TITLE = "Baldriche - Full - Monthly";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true";

  const { data: customer, error: customerError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, first_name, last_name, full_cleaning_months")
    .eq("jobber_client_id", BALDRICHE_CLIENT_ID)
    .maybeSingle();

  if (customerError || !customer) {
    return NextResponse.json(
      { success: false, error: customerError?.message ?? "Customer not found." },
      { status: 500 }
    );
  }

  const { data: upcomingVisits, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, title, start_at")
    .eq("jobber_client_id", BALDRICHE_CLIENT_ID)
    .eq("source", "native")
    .not("start_at", "is", null)
    .gte("start_at", new Date().toISOString());

  if (visitsError) {
    return NextResponse.json(
      { success: false, error: visitsError.message },
      { status: 500 }
    );
  }

  const visitsToRetitle = (upcomingVisits ?? []).filter((visit) => {
    const month = new Date(visit.start_at as string).getUTCMonth() + 1;
    return FULL_MONTHS.includes(month) && visit.title !== FULL_TITLE;
  });

  let customerUpdated = false;
  let visitsRetitled = 0;
  const errors: string[] = [];

  if (apply) {
    const { error: updateCustomerError } = await supabaseServer
      .from("customers")
      .update({ full_cleaning_months: FULL_MONTHS })
      .eq("jobber_client_id", BALDRICHE_CLIENT_ID);

    if (updateCustomerError) {
      errors.push(`Customer update: ${updateCustomerError.message}`);
    } else {
      customerUpdated = true;
    }

    for (const visit of visitsToRetitle) {
      const { error: updateVisitError } = await supabaseServer
        .from("jobber_visits")
        .update({ title: FULL_TITLE, updated_at: new Date().toISOString() })
        .eq("jobber_visit_id", visit.jobber_visit_id);

      if (updateVisitError) {
        errors.push(`${visit.jobber_visit_id}: ${updateVisitError.message}`);
      } else {
        visitsRetitled++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    apply,
    customer: {
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      currentFullCleaningMonths: customer.full_cleaning_months,
      wouldSetTo: FULL_MONTHS,
      updated: customerUpdated,
    },
    visits: {
      wouldRetitle: visitsToRetitle.length,
      retitled: visitsRetitled,
      sample: visitsToRetitle.map((v) => ({
        jobberVisitId: v.jobber_visit_id,
        startAt: v.start_at,
        previousTitle: v.title,
        newTitle: FULL_TITLE,
      })),
    },
    errors,
  });
}
