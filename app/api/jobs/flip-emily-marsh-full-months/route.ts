// One-off, single-customer action (2026-09-22). Roadmap item 19,
// scoped to Emily Marsh only -- hardcoded to exactly one
// jobberClientId on purpose (not the same customer as Kathy Marsh or
// Alex Marsh, both of whom also matched the broad name search this was
// looked up with -- their own jobber_client_ids are never referenced
// here). Does two things, both scoped to her:
//   1. Sets customers.full_cleaning_months to [2,5,8,11] (Feb/May/Aug/
//      Nov), matching her own Service Instructions text: "Full
//      Cleaning - Feb, May, Aug, Nov".
//   2. Retitles her already-generated future visits: those in her Full
//      months (currently the generic "Marsh - Monthly Maintenance
//      Plan") to "Marsh - Full - Monthly", and every other future
//      visit (same generic title) to "Marsh - Maintenance - Monthly" --
//      same "<Name> - <Type> - Monthly" convention as Baldriche/Ray,
//      and the same both-directions retitle Ryan asked for on those.
//
// Dry-run by default (?apply=true to write), admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMILY_MARSH_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC8xMjg4OTAzMTM=";
const FULL_MONTHS = [2, 5, 8, 11];
const FULL_TITLE = "Marsh - Full - Monthly";
const MAINTENANCE_TITLE = "Marsh - Maintenance - Monthly";

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
    .eq("jobber_client_id", EMILY_MARSH_CLIENT_ID)
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
    .eq("jobber_client_id", EMILY_MARSH_CLIENT_ID)
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
      .eq("jobber_client_id", EMILY_MARSH_CLIENT_ID);

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
