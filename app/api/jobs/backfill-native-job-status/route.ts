// One-time backfill (2026-09-21). Companion to the fix in
// customers/[id]/page.tsx's getNativeJobsForCustomer/mergeRecentJobs and
// my-day/actions.ts's maybeCompleteNativeJobForVisit.
//
// Migration 067's Jobber cutover flipped every existing job's `source`
// to 'native' without ever touching `job_status` -- and no native code
// path has ever written job_status: "completed" anywhere (only
// "upcoming" on creation and "archived" on cancel). So any one-off job
// that finished BEFORE this backfill exists is stuck showing whatever
// status it had frozen at cutover (often a stale "late"/"active"/etc
// string inherited from Jobber) forever, with nothing to move it to
// "completed" retroactively. maybeCompleteNativeJobForVisit only
// handles this going forward, for a visit completed AFTER that fix
// shipped -- this route is the one-time catch-up for everything before
// it.
//
// Scope: source='native', job_type='ONE_OFF' jobs only, with
// job_status not already 'completed'/'archived', that have at least one
// visit and no visit with a null completed_at. Recurring jobs are
// deliberately left untouched -- they don't have a "done" state as long
// as they keep generating future visits.
//
// Read-only by default (?apply=true actually writes), admin-gated,
// manual-trigger only -- same convention as lib/jobberMigrationAudit.ts.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CandidateJob = {
  jobber_job_id: string;
  job_number: string | null;
  title: string | null;
  job_status: string | null;
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true";

  const { data: candidates, error: candidatesError } = await supabaseServer
    .from("jobber_jobs")
    .select("jobber_job_id, job_number, title, job_status")
    .eq("source", "native")
    .eq("job_type", "ONE_OFF")
    .not("job_status", "in", "(completed,archived)");

  if (candidatesError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read candidate jobs: ${candidatesError.message}` },
      { status: 500 }
    );
  }

  const rows = (candidates ?? []) as CandidateJob[];
  const toComplete: CandidateJob[] = [];
  const skippedNoVisits: string[] = [];
  const stillOpen: string[] = [];

  for (const job of rows) {
    const [{ count: totalCount }, { count: incompleteCount }] = await Promise.all([
      supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id", { count: "exact", head: true })
        .eq("jobber_job_id", job.jobber_job_id),
      supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id", { count: "exact", head: true })
        .eq("jobber_job_id", job.jobber_job_id)
        .is("completed_at", null),
    ]);

    if (!totalCount) {
      skippedNoVisits.push(job.jobber_job_id);
      continue;
    }

    if ((incompleteCount ?? 0) > 0) {
      stillOpen.push(job.jobber_job_id);
      continue;
    }

    toComplete.push(job);
  }

  let updated = 0;
  const updateErrors: string[] = [];

  if (apply) {
    for (const job of toComplete) {
      const { error: updateError } = await supabaseServer
        .from("jobber_jobs")
        .update({ job_status: "completed", updated_at: new Date().toISOString() })
        .eq("jobber_job_id", job.jobber_job_id);

      if (updateError) {
        updateErrors.push(`${job.jobber_job_id}: ${updateError.message}`);
      } else {
        updated++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    apply,
    candidatesChecked: rows.length,
    wouldComplete: toComplete.length,
    updated: apply ? updated : 0,
    skippedNoVisits: skippedNoVisits.length,
    stillOpen: stillOpen.length,
    updateErrors,
    sample: toComplete.slice(0, 25).map((job) => ({
      jobberJobId: job.jobber_job_id,
      jobNumber: job.job_number,
      title: job.title,
      previousStatus: job.job_status,
    })),
  });
}
