// One-off, single-customer action (2026-09-22). Roadmap item 19,
// scoped to Greg Collins only -- hardcoded to exactly one
// jobberClientId on purpose (not Rick Collins, who also matched the
// name search used to find him -- his jobber_client_id is never
// referenced here). Does two things, both scoped to him:
//   1. Sets customers.full_cleaning_months to [1,4,7,10] (Jan/Apr/Jul/
//      Oct), matching his own Service Instructions text: "Full
//      Cleaning - Jan, Apr, July, Oct".
//   2. Retitles his already-generated future visits: those in his Full
//      months (currently the generic "Collins - Monthly Maintenance
//      Plan") to "Collins - Full - Monthly", and every other future
//      visit (same generic title) to "Collins - Maintenance -
//      Monthly".
//
// Dry-run by default (?apply=true to write), admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COLLINS_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC85OTcyMjY3Ng==";
const FULL_MONTHS = [1, 4, 7, 10];
const FULL_TITLE = "Collins - Full - Monthly";
const MAINTENANCE_TITLE = "Collins - Maintenance - Monthly";

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
    .eq("jobber_client_id", COLLINS_CLIENT_ID)
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
    .eq("jobber_client_id", COLLINS_CLIENT_ID)
    .eq("source", "native")
    .not("start_at", "is", null)
    .gte("start_at", new Date().toISOString());

  if (visitsError) {
    return NextResponse.json(
      { success: false, error: visitsError.message },
      { status: 500 }
    );
  }

  const fullVisitsToRetitle = (upcomingVisits ?? []).filter((visit) => {
    const month = new Date(visit.start_at as string).getUTCMonth() + 1;
    return FULL_MONTHS.includes(month) && visit.title !== FULL_TITLE;
  });

  const maintenanceVisitsToRetitle = (upcomingVisits ?? []).filter((visit) => {
    const month = new Date(visit.start_at as string).getUTCMonth() + 1;
    return !FULL_MONTHS.includes(month) && visit.title !== MAINTENANCE_TITLE;
  });

  let customerUpdated = false;
  let fullRetitled = 0;
  let maintenanceRetitled = 0;
  const errors: string[] = [];

  if (apply) {
    const { error: updateCustomerError } = await supabaseServer
      .from("customers")
      .update({ full_cleaning_months: FULL_MONTHS })
      .eq("jobber_client_id", COLLINS_CLIENT_ID);

    if (updateCustomerError) {
      errors.push(`Customer update: ${updateCustomerError.message}`);
    } else {
      customerUpdated = true;
    }

    for (const visit of fullVisitsToRetitle) {
      const { error: updateVisitError } = await supabaseServer
        .from("jobber_visits")
        .update({ title: FULL_TITLE, updated_at: new Date().toISOString() })
        .eq("jobber_visit_id", visit.jobber_visit_id);

      if (updateVisitError) {
        errors.push(`${visit.jobber_visit_id}: ${updateVisitError.message}`);
      } else {
        fullRetitled++;
      }
    }

    for (const visit of maintenanceVisitsToRetitle) {
      const { error: updateVisitError } = await supabaseServer
        .from("jobber_visits")
        .update({ title: MAINTENANCE_TITLE, updated_at: new Date().toISOString() })
        .eq("jobber_visit_id", visit.jobber_visit_id);

      if (updateVisitError) {
        errors.push(`${visit.jobber_visit_id}: ${updateVisitError.message}`);
      } else {
        maintenanceRetitled++;
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
    fullVisits: {
      wouldRetitle: fullVisitsToRetitle.length,
      retitled: fullRetitled,
      sample: fullVisitsToRetitle.map((v) => ({
        jobberVisitId: v.jobber_visit_id,
        startAt: v.start_at,
        previousTitle: v.title,
        newTitle: FULL_TITLE,
      })),
    },
    maintenanceVisits: {
      wouldRetitle: maintenanceVisitsToRetitle.length,
      retitled: maintenanceRetitled,
      sample: maintenanceVisitsToRetitle.map((v) => ({
        jobberVisitId: v.jobber_visit_id,
        startAt: v.start_at,
        previousTitle: v.title,
        newTitle: MAINTENANCE_TITLE,
      })),
    },
    errors,
  });
}
