// One-off, single-customer action (2026-09-28). Same base pattern as
// flip-katie-ray-full-months / flip-baldriche-full-months.
//
// Darcy Wearing's service_instructions is completely null (confirmed
// via debug-customer-full-cleaning-months), so flip-all-full-months'
// automatic parse never had anything to read for her -- this isn't a
// gap in that tool's regex, there's just no text on her record at all.
// Her real Full/Maintenance convention only survives in her own
// completed visit history: Full - Monthly on 2025-12-05, 2026-04-03,
// and 2026-08-10, Maintenance - Monthly on every visit in between --
// a clean every-4th-month pattern (Apr/Aug/Dec), confirmed with Ryan
// 2026-09-28.
//
// Her upcoming visits (Oct 2026 onward) had all been reset to the
// job's flat "Maintenance - Monthly" title by repair-full-cleaning-
// regression, which was correct for the customers it was built for
// (never-flipped, no real convention) but wrong for her specifically --
// she does have a real convention, it just was never captured in
// customers.full_cleaning_months. This does what flip-all-full-months
// would have done for her automatically if her instructions had ever
// had parseable text:
//   1. Sets customers.full_cleaning_months to [4, 8, 12].
//   2. Retitles her upcoming, not-yet-occurred, native visits: those in
//      April/August/December to "Wearing - Full - Monthly", every
//      other upcoming visit to "Wearing - Maintenance - Monthly". Only
//      visits whose CURRENT title doesn't already match the target are
//      touched, so this is safe to re-run.
//
// Dry-run by default (?apply=true to write), admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WEARING_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC85OTcyMjMxNA==";
const FULL_MONTHS = [4, 8, 12];
const FULL_TITLE = "Wearing - Full - Monthly";
const MAINTENANCE_TITLE = "Wearing - Maintenance - Monthly";

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
    .eq("jobber_client_id", WEARING_CLIENT_ID)
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
    .eq("jobber_client_id", WEARING_CLIENT_ID)
    .eq("source", "native")
    .is("completed_at", null)
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
      .eq("jobber_client_id", WEARING_CLIENT_ID);

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
