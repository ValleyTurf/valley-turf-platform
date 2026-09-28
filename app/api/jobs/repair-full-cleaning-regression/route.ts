// Repair pass for the regression fixed in lib/nativeJobs.ts (Ryan,
// 2026-09-28, re: Lytle/Johnson/Stych): a never-flipped customer's
// full_cleaning_months defaults to '{}' rather than null, which
// fetchCustomerFullCleaningInfo() used to trust as a genuine
// Maintenance-Only opt-in -- so quarterly/semiannual/etc. jobs for
// customers who were never processed by any flip-*-full-months route
// got their real title (e.g. "Emily Johnson - Quarterly Turf Cleaning")
// silently overwritten to "<LastName> - Maintenance - Monthly" on every
// job create/edit or cron regeneration. The code bug is already fixed;
// this repairs the visit rows that already got mislabeled before that
// fix landed.
//
// Same "victim" definition as debug-full-cleaning-regression-scope:
// full_cleaning_months is an empty array AND service_instructions does
// NOT contain "full cleaning" (so the flip route could never have
// legitimately set it). For each such customer's native, not-yet-
// completed, not-yet-occurred visits whose title matches the bug's
// stamp ("<anything> - Full - Monthly" / "<anything> - Maintenance -
// Monthly") and differs from that visit's own job's real `title`
// column, resets the visit's title back to the job's title -- exactly
// what it would already be if the bug had never fired.
//
// Dry-run by default (?apply=true to write), admin-gated, paginated
// (same 1000-row-cap fix used throughout this feature).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUG_STAMP_PATTERN = / - (Full|Maintenance) - Monthly$/i;

// jobber_client_id values are long opaque base64 strings -- an .in()
// filter over hundreds of them (this bug's victim list is expected to
// be most of the customer base) builds a GET request whose query
// string can run past request-size limits and come back as a flat 400
// with no further detail (hit in debug-full-cleaning-regression-scope
// first). Chunking keeps every request's .in() list short regardless
// of how many victims there turn out to be.
const CLIENT_ID_CHUNK_SIZE = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type CustomerRow = {
  jobber_client_id: string;
  first_name: string | null;
  last_name: string | null;
  full_cleaning_months: number[] | null;
  service_instructions: string | null;
};

type JobRow = {
  jobber_job_id: string;
  jobber_client_id: string;
  title: string | null;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string;
  jobber_client_id: string;
  title: string | null;
  start_at: string | null;
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true";

  const PAGE_SIZE = 1000;

  const customers: CustomerRow[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabaseServer
        .from("customers")
        .select("jobber_client_id, first_name, last_name, full_cleaning_months, service_instructions")
        .order("jobber_client_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ success: false, error: error.message, step: "customers" }, { status: 500 });
      }

      const page = (data ?? []) as CustomerRow[];
      customers.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const victims = customers.filter((c) => {
    const months = c.full_cleaning_months;
    const isEmptyArray = Array.isArray(months) && months.length === 0;
    const hasSignal = !!c.service_instructions && /full cleaning/i.test(c.service_instructions);
    return isEmptyArray && !hasSignal;
  });

  const victimClientIds = victims.map((c) => c.jobber_client_id);
  const nameByClientId = new Map(
    victims.map((c) => [c.jobber_client_id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()])
  );

  if (victimClientIds.length === 0) {
    return NextResponse.json({ success: true, apply, victimCount: 0, results: [] });
  }

  const jobs: JobRow[] = [];
  for (const clientIdChunk of chunk(victimClientIds, CLIENT_ID_CHUNK_SIZE)) {
    let from = 0;
    while (true) {
      const { data, error } = await supabaseServer
        .from("jobber_jobs")
        .select("jobber_job_id, jobber_client_id, title")
        .in("jobber_client_id", clientIdChunk)
        .eq("source", "native")
        .order("jobber_job_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ success: false, error: error.message, step: "jobber_jobs" }, { status: 500 });
      }

      const page = (data ?? []) as JobRow[];
      jobs.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const jobById = new Map(jobs.map((j) => [j.jobber_job_id, j]));

  const visits: VisitRow[] = [];
  for (const clientIdChunk of chunk(victimClientIds, CLIENT_ID_CHUNK_SIZE)) {
    let from = 0;
    while (true) {
      const { data, error } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_job_id, jobber_client_id, title, start_at")
        .in("jobber_client_id", clientIdChunk)
        .eq("source", "native")
        .is("completed_at", null)
        .not("start_at", "is", null)
        .gte("start_at", new Date().toISOString())
        .order("jobber_visit_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ success: false, error: error.message, step: "jobber_visits" }, { status: 500 });
      }

      const page = (data ?? []) as VisitRow[];
      visits.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const byClient = new Map<
    string,
    { name: string; jobs: Map<string, { jobTitle: string | null; visitIdsToRepair: string[] }> }
  >();

  for (const visit of visits) {
    if (!visit.title || !BUG_STAMP_PATTERN.test(visit.title)) continue;

    const job = jobById.get(visit.jobber_job_id);
    const jobTitle = job?.title ?? null;
    if (!jobTitle || jobTitle === visit.title) continue;

    const clientEntry =
      byClient.get(visit.jobber_client_id) ??
      { name: nameByClientId.get(visit.jobber_client_id) ?? "(unknown)", jobs: new Map() };

    const jobEntry =
      clientEntry.jobs.get(visit.jobber_job_id) ?? { jobTitle, visitIdsToRepair: [] as string[] };

    jobEntry.visitIdsToRepair.push(visit.jobber_visit_id);
    clientEntry.jobs.set(visit.jobber_job_id, jobEntry);
    byClient.set(visit.jobber_client_id, clientEntry);
  }

  const errors: string[] = [];
  const results: {
    jobberClientId: string;
    name: string;
    jobberJobId: string;
    jobTitle: string;
    visitIdsRepaired: string[];
    applied: boolean;
  }[] = [];

  for (const [clientId, entry] of byClient) {
    for (const [jobId, jobEntry] of entry.jobs) {
      let applied = false;

      if (apply) {
        const { error } = await supabaseServer
          .from("jobber_visits")
          .update({ title: jobEntry.jobTitle, updated_at: new Date().toISOString() })
          .in("jobber_visit_id", jobEntry.visitIdsToRepair);

        if (error) {
          errors.push(`${entry.name} (${jobId}): ${error.message}`);
        } else {
          applied = true;
        }
      }

      results.push({
        jobberClientId: clientId,
        name: entry.name,
        jobberJobId: jobId,
        jobTitle: jobEntry.jobTitle as string,
        visitIdsRepaired: jobEntry.visitIdsToRepair,
        applied,
      });
    }
  }

  return NextResponse.json({
    success: true,
    apply,
    victimCount: victims.length,
    totalVisitsToRepair: results.reduce((sum, r) => sum + r.visitIdsRepaired.length, 0),
    results: results.map((r) => ({
      name: r.name,
      jobberJobId: r.jobberJobId,
      jobTitle: r.jobTitle,
      visitCount: r.visitIdsRepaired.length,
      applied: r.applied,
    })),
    errors,
  });
}
