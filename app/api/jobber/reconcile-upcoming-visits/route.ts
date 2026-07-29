// One-time (and safe to re-run) cleanup for visits that Jobber already
// destroyed but this app never pruned locally — see
// lib/jobberWebhookProcessor.ts's handleDestroyedVisit for the real,
// ongoing fix (VISIT_DESTROY webhooks now actually delete the local row).
// This route exists to clear out whatever's ALREADY stuck from before
// that fix existed: e.g. the visits a canceled recurring job's jobClose
// destroyed in Jobber weeks ago, whose VISIT_DESTROY webhook already got
// processed as a no-op and won't fire again.
//
// Only checks visits with no completed_at (nothing ever marks a
// completed visit for re-checking — there's no reason to, and it keeps
// this fast/cheap). For each, asks Jobber directly whether the visit
// still exists; only deletes the local row when Jobber cleanly returns
// no visit for that id (no GraphQL errors) — a transient error never
// causes a delete, since that could just as easily mean a throttle or
// auth hiccup, not a real deletion.
import "server-only";
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CHECK_QUERY = `
  query CheckVisitExists($id: EncodedId!) {
    visit(id: $id) {
      id
    }
  }
`;

const MAX_VISITS_TO_CHECK = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  const { data: candidates, error: candidatesError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, customer_name, title, start_at")
    .is("completed_at", null)
    .order("start_at", { ascending: true })
    .limit(MAX_VISITS_TO_CHECK);

  if (candidatesError) {
    return NextResponse.json(
      { success: false, error: candidatesError.message },
      { status: 200 }
    );
  }

  const visits = candidates ?? [];

  let checked = 0;
  let removed = 0;
  let skippedErrors = 0;
  const removedVisits: { id: string; customer_name: string | null; title: string | null; start_at: string | null }[] = [];
  const errorMessages: string[] = [];

  for (const visit of visits) {
    checked += 1;

    try {
      const { data, errors } = await jobberGraphQL<{
        visit: { id: string } | null;
      }>(CHECK_QUERY, { id: visit.jobber_visit_id });

      // Turns out Jobber doesn't cleanly return `visit: null` for a
      // destroyed id — it comes back as a GraphQL error whose message is
      // literally "Visit not found" (confirmed live: all 300 checked
      // visits that no longer exist produced this exact error). Treat
      // that specific message as confirmation of deletion; any OTHER
      // error (auth, throttle, network) still gets skipped rather than
      // risking a delete on a transient failure.
      const isNotFoundError =
        !!errors?.length &&
        errors.every((e) => /not found/i.test(e.message));

      if (errors?.length && !isNotFoundError) {
        skippedErrors += 1;
        errorMessages.push(
          `${visit.jobber_visit_id}: ${errors.map((e) => e.message).join("; ")}`
        );
        continue;
      }

      if (!isNotFoundError && data?.visit) {
        continue; // still exists in Jobber — leave it alone
      }

      // Either Jobber cleanly returned nothing for this id, or gave back
      // a "Visit not found" error — either way it's gone. Same cleanup
      // as handleDestroyedVisit.
      await supabaseServer
        .from("visit_material_usage")
        .delete()
        .eq("jobber_visit_id", visit.jobber_visit_id);

      await supabaseServer
        .from("visit_equipment_usage")
        .delete()
        .eq("jobber_visit_id", visit.jobber_visit_id);

      const { error: deleteError } = await supabaseServer
        .from("jobber_visits")
        .delete()
        .eq("jobber_visit_id", visit.jobber_visit_id);

      if (deleteError) {
        skippedErrors += 1;
        errorMessages.push(`${visit.jobber_visit_id}: ${deleteError.message}`);
        continue;
      }

      removed += 1;
      removedVisits.push({
        id: visit.jobber_visit_id,
        customer_name: visit.customer_name,
        title: visit.title,
        start_at: visit.start_at,
      });
    } catch (error) {
      skippedErrors += 1;
      errorMessages.push(
        `${visit.jobber_visit_id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Light pacing to stay well under Jobber's rate limits — this is a
    // small candidate set (only incomplete visits), not a full sync.
    await sleep(150);
  }

  return NextResponse.json({
    success: true,
    candidatesChecked: checked,
    removed,
    skippedErrors,
    removedVisits,
    errorMessages,
  });
}
