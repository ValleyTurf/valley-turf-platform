// Ryan (2026-09-28): after confirming Lytle/Johnson/Stych all read
// full_cleaning_months: [] despite never being touched by any
// flip-*-full-months route, this quantifies how many OTHER customers
// are in the same boat (never opted in, but full_cleaning_months
// defaults to '{}' instead of null) and how many of their visits have
// already been mislabeled "<LastName> - Maintenance - Monthly" or
// "<LastName> - Full - Monthly" as a result -- before/after fixing
// lib/nativeJobs.ts's fetchCustomerFullCleaningInfo to stop trusting an
// empty array unless service_instructions itself matches the same
// "%full cleaning%" signal flip-all-full-months requires.
//
// "Victim" = full_cleaning_months is an empty array AND
// service_instructions does NOT contain "full cleaning" (so the flip
// route could never have legitimately set it) -- mirrors the exact
// guard just added to lib/nativeJobs.ts.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CustomerRow = {
  jobber_client_id: string;
  first_name: string | null;
  last_name: string | null;
  full_cleaning_months: number[] | null;
  service_instructions: string | null;
};

type VisitRow = { jobber_visit_id: string; jobber_client_id: string; title: string | null };

const BUG_STAMP_PATTERN = / - (Full|Maintenance) - Monthly$/i;

// jobber_client_id values are long opaque base64 strings -- an .in()
// filter over hundreds of them (this bug's "victim" list is expected to
// be most of the customer base) builds a GET request whose query
// string can run past request-size limits and come back as a flat 400
// with no further detail. Chunking keeps every request's .in() list
// short regardless of how many victims there turn out to be.
const CLIENT_ID_CHUNK_SIZE = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const CUSTOMERS_PAGE_SIZE = 1000;
  const customers: CustomerRow[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabaseServer
        .from("customers")
        .select("jobber_client_id, first_name, last_name, full_cleaning_months, service_instructions")
        .order("jobber_client_id", { ascending: true })
        .range(from, from + CUSTOMERS_PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ success: false, error: error.message, step: "customers" }, { status: 500 });
      }

      const page = (data ?? []) as CustomerRow[];
      customers.push(...page);
      if (page.length < CUSTOMERS_PAGE_SIZE) break;
      from += CUSTOMERS_PAGE_SIZE;
    }
  }

  const nullMonths = customers.filter((c) => c.full_cleaning_months == null);
  const emptyMonths = customers.filter((c) => Array.isArray(c.full_cleaning_months) && c.full_cleaning_months.length === 0);
  const nonEmptyMonths = customers.filter((c) => Array.isArray(c.full_cleaning_months) && c.full_cleaning_months.length > 0);

  const legitEmpty = emptyMonths.filter((c) => c.service_instructions && /full cleaning/i.test(c.service_instructions));
  const victims = emptyMonths.filter((c) => !(c.service_instructions && /full cleaning/i.test(c.service_instructions)));

  const victimClientIds = victims.map((c) => c.jobber_client_id);

  // Count how many of the victims' native, not-yet-completed visits
  // currently carry a title this bug could have produced -- i.e. how
  // many rows would actually need repairing, not just how many
  // customers are theoretically exposed. Chunked by client id (see
  // CLIENT_ID_CHUNK_SIZE above) and, within each chunk, paginated by
  // the usual 1000-row range loop.
  const mistitledVisits: VisitRow[] = [];

  for (const clientIdChunk of chunk(victimClientIds, CLIENT_ID_CHUNK_SIZE)) {
    const VISITS_PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_client_id, title")
        .in("jobber_client_id", clientIdChunk)
        .eq("source", "native")
        .is("completed_at", null)
        .order("jobber_visit_id", { ascending: true })
        .range(from, from + VISITS_PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ success: false, error: error.message, step: "jobber_visits" }, { status: 500 });
      }

      const page = ((data ?? []) as VisitRow[]).filter(
        (v) => v.title && BUG_STAMP_PATTERN.test(v.title)
      );
      mistitledVisits.push(...page);
      if ((data ?? []).length < VISITS_PAGE_SIZE) break;
      from += VISITS_PAGE_SIZE;
    }
  }

  const visitCountByClientId = new Map<string, number>();
  for (const v of mistitledVisits) {
    visitCountByClientId.set(v.jobber_client_id, (visitCountByClientId.get(v.jobber_client_id) ?? 0) + 1);
  }

  return NextResponse.json({
    success: true,
    totalCustomers: customers.length,
    nullMonthsCount: nullMonths.length,
    emptyMonthsCount: emptyMonths.length,
    nonEmptyMonthsCount: nonEmptyMonths.length,
    legitimateEmptyCount: legitEmpty.length,
    victimCount: victims.length,
    victimsWithMistitledVisits: victims
      .map((c) => ({
        jobberClientId: c.jobber_client_id,
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        mistitledVisitCount: visitCountByClientId.get(c.jobber_client_id) ?? 0,
      }))
      .filter((v) => v.mistitledVisitCount > 0),
    totalMistitledVisits: mistitledVisits.length,
  });
}
