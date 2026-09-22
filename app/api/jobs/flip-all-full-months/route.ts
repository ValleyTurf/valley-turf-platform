// Generic version of the one-off flip-<name>-full-months routes
// (2026-09-22, roadmap item 19). Ryan explicitly held off on this
// "apply to everyone" version until the per-customer pattern had been
// built and verified against Baldriche, Ray, Gombert, Emily Marsh,
// Iverson, Tuckett, Carter, and Collins first -- now approved
// ("let's flip all the others").
//
// Finds every customer whose service_instructions contains a
// "Full Cleaning - <months>" line, parses the month list (handles
// "Jun"/"June", "Sept"/"Sep"/"September", etc. -- the exact spellings
// seen across the customers done by hand so far), and for each one:
//   1. Sets customers.full_cleaning_months to the parsed months.
//   2. Retitles their future, not-yet-occurred, native visits: those
//      in a Full month to "<LastName> - Full - Monthly", every other
//      future visit to "<LastName> - Maintenance - Monthly" -- the
//      same convention confirmed against Baldriche/Ray/Iverson's own
//      historical titles. Only visits whose CURRENT title doesn't
//      already match the target are touched (same idempotent check
//      every one-off route used), so this is safe to re-run and won't
//      re-touch the 8 customers already flipped by hand, or clobber a
//      visit that's already correct.
// A customer whose service_instructions doesn't parse (no recognized
// "Full Cleaning - ..." months) or has no last_name is skipped and
// listed separately -- never guessed at.
//
// Dry-run by default (?apply=true to write), admin-gated. Updates are
// batched two-per-customer (one for its Full-month visit ids, one for
// its Maintenance-month visit ids) rather than one row at a time, to
// stay well inside the request's time budget across many customers at
// once.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseFullMonths(serviceInstructions: string | null): number[] | null {
  if (!serviceInstructions) return null;

  const match = serviceInstructions.match(/full cleaning\s*-\s*([^\n\r]+)/i);
  if (!match) return null;

  const parts = match[1].split(",").map((part) => part.trim().toLowerCase());
  const months = parts
    .map((part) => MONTH_NAME_TO_NUMBER[part.replace(/[^a-z]/g, "")])
    .filter((month): month is number => typeof month === "number");

  // Require every comma-separated part to have parsed -- a partial
  // parse (e.g. an unrecognized abbreviation) is more dangerous than no
  // parse at all, since it would silently set the wrong months.
  if (months.length === 0 || months.length !== parts.length) return null;

  return Array.from(new Set(months)).sort((a, b) => a - b);
}

type CustomerRow = {
  jobber_client_id: string;
  first_name: string | null;
  last_name: string | null;
  service_instructions: string | null;
  full_cleaning_months: number[] | null;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string;
  title: string | null;
  start_at: string;
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true";

  const { data: customerRows, error: customersError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, first_name, last_name, service_instructions, full_cleaning_months")
    .not("service_instructions", "is", null)
    .ilike("service_instructions", "%full cleaning%");

  if (customersError) {
    return NextResponse.json(
      { success: false, error: customersError.message },
      { status: 500 }
    );
  }

  const skipped: { jobberClientId: string; name: string; reason: string }[] = [];
  const eligible: { customer: CustomerRow; fullMonths: number[]; lastName: string }[] = [];

  for (const customer of (customerRows ?? []) as CustomerRow[]) {
    const name = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
    const lastName = customer.last_name?.trim();

    if (!lastName) {
      skipped.push({ jobberClientId: customer.jobber_client_id, name, reason: "No last_name to build a title prefix from." });
      continue;
    }

    const fullMonths = parseFullMonths(customer.service_instructions);
    if (!fullMonths) {
      skipped.push({
        jobberClientId: customer.jobber_client_id,
        name,
        reason: `Couldn't parse "Full Cleaning - ..." months from: ${customer.service_instructions}`,
      });
      continue;
    }

    eligible.push({ customer, fullMonths, lastName });
  }

  const clientIds = eligible.map((e) => e.customer.jobber_client_id);

  const { data: visitRows, error: visitsError } =
    clientIds.length > 0
      ? await supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, jobber_client_id, title, start_at")
          .in("jobber_client_id", clientIds)
          .eq("source", "native")
          .not("start_at", "is", null)
          .gte("start_at", new Date().toISOString())
      : { data: [] as VisitRow[], error: null };

  if (visitsError) {
    return NextResponse.json(
      { success: false, error: visitsError.message },
      { status: 500 }
    );
  }

  const visitsByClientId = new Map<string, VisitRow[]>();
  for (const visit of (visitRows ?? []) as VisitRow[]) {
    const list = visitsByClientId.get(visit.jobber_client_id) ?? [];
    list.push(visit);
    visitsByClientId.set(visit.jobber_client_id, list);
  }

  const results: {
    jobberClientId: string;
    name: string;
    fullMonths: number[];
    fullTitle: string;
    maintenanceTitle: string;
    fullVisitIdsToRetitle: string[];
    maintenanceVisitIdsToRetitle: string[];
    customerUpdated: boolean;
    fullRetitled: number;
    maintenanceRetitled: number;
  }[] = [];

  const errors: string[] = [];

  for (const { customer, fullMonths, lastName } of eligible) {
    const fullTitle = `${lastName} - Full - Monthly`;
    const maintenanceTitle = `${lastName} - Maintenance - Monthly`;
    const visits = visitsByClientId.get(customer.jobber_client_id) ?? [];

    const fullVisitIds = visits
      .filter((v) => {
        const month = new Date(v.start_at).getUTCMonth() + 1;
        return fullMonths.includes(month) && v.title !== fullTitle;
      })
      .map((v) => v.jobber_visit_id);

    const maintenanceVisitIds = visits
      .filter((v) => {
        const month = new Date(v.start_at).getUTCMonth() + 1;
        return !fullMonths.includes(month) && v.title !== maintenanceTitle;
      })
      .map((v) => v.jobber_visit_id);

    let customerUpdated = false;
    let fullRetitled = 0;
    let maintenanceRetitled = 0;

    if (apply) {
      const { error: updateCustomerError } = await supabaseServer
        .from("customers")
        .update({ full_cleaning_months: fullMonths })
        .eq("jobber_client_id", customer.jobber_client_id);

      if (updateCustomerError) {
        errors.push(`${lastName} customer update: ${updateCustomerError.message}`);
      } else {
        customerUpdated = true;
      }

      if (fullVisitIds.length > 0) {
        const { error: updateFullError } = await supabaseServer
          .from("jobber_visits")
          .update({ title: fullTitle, updated_at: new Date().toISOString() })
          .in("jobber_visit_id", fullVisitIds);

        if (updateFullError) {
          errors.push(`${lastName} Full retitle: ${updateFullError.message}`);
        } else {
          fullRetitled = fullVisitIds.length;
        }
      }

      if (maintenanceVisitIds.length > 0) {
        const { error: updateMaintenanceError } = await supabaseServer
          .from("jobber_visits")
          .update({ title: maintenanceTitle, updated_at: new Date().toISOString() })
          .in("jobber_visit_id", maintenanceVisitIds);

        if (updateMaintenanceError) {
          errors.push(`${lastName} Maintenance retitle: ${updateMaintenanceError.message}`);
        } else {
          maintenanceRetitled = maintenanceVisitIds.length;
        }
      }
    }

    results.push({
      jobberClientId: customer.jobber_client_id,
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      fullMonths,
      fullTitle,
      maintenanceTitle,
      fullVisitIdsToRetitle: fullVisitIds,
      maintenanceVisitIdsToRetitle: maintenanceVisitIds,
      customerUpdated,
      fullRetitled,
      maintenanceRetitled,
    });
  }

  return NextResponse.json({
    success: true,
    apply,
    eligibleCount: eligible.length,
    totalWouldRetitle: results.reduce(
      (sum, r) => sum + r.fullVisitIdsToRetitle.length + r.maintenanceVisitIdsToRetitle.length,
      0
    ),
    results: results.map((r) => ({
      jobberClientId: r.jobberClientId,
      name: r.name,
      fullMonths: r.fullMonths,
      fullTitle: r.fullTitle,
      maintenanceTitle: r.maintenanceTitle,
      wouldRetitleFull: r.fullVisitIdsToRetitle.length,
      wouldRetitleMaintenance: r.maintenanceVisitIdsToRetitle.length,
      customerUpdated: r.customerUpdated,
      fullRetitled: r.fullRetitled,
      maintenanceRetitled: r.maintenanceRetitled,
    })),
    skipped,
    errors,
  });
}
