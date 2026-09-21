// One-time diagnostic (2026-09-22, v2). Ryan: "Many customers have the
// months of their full cleanings in the Service Instructions" -- before
// designing the Maintenance-to-Full auto-flip (roadmap item 19), this
// pulls actual instructions text so the real format(s) in use can be
// seen, rather than guessed at.
//
// v1 filtered to job_type='RECURRING' with non-empty instructions and
// came back completely empty (0 of 0) -- either recurring jobs
// specifically don't have this, or "instructions" isn't the right
// field/table at all (jobber_jobs.instructions is only ever populated
// by the one-time migration audit backfill or by editing a job through
// this app's own Manage Job form -- lib/jobberWebhookProcessor.ts never
// syncs it on an incoming webhook, so anything typed directly in
// Jobber's own UI after cutover never lands here). v2 widens the net:
// every job_type (not just recurring), plus a same-shaped sample from
// jobber_job_notes (the separate "Imported from Jobber" notes table the
// customer page's Notes section reads) in case that's actually where
// this lives.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const [jobsResult, allJobsCountResult, notesResult] = await Promise.all([
    supabaseServer
      .from("jobber_jobs")
      .select(
        "jobber_job_id, job_number, title, instructions, job_type, recurrence_frequency, jobber_client_id"
      )
      .not("instructions", "is", null)
      .neq("instructions", "")
      .order("job_number", { ascending: false })
      .limit(30),
    supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id", { count: "exact", head: true }),
    supabaseServer
      .from("jobber_job_notes")
      .select("id, jobber_job_id, jobber_client_id, content, created_at")
      .not("content", "is", null)
      .neq("content", "")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (jobsResult.error) {
    return NextResponse.json(
      { success: false, error: `Couldn't read jobs: ${jobsResult.error.message}` },
      { status: 500 }
    );
  }

  const monthWords = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];

  const jobRows = jobsResult.data ?? [];
  const annotatedJobs = jobRows.map((row) => {
    const text = (row.instructions ?? "").toLowerCase();
    return {
      jobberJobId: row.jobber_job_id,
      jobNumber: row.job_number,
      title: row.title,
      jobType: row.job_type,
      recurrenceFrequency: row.recurrence_frequency,
      instructions: row.instructions,
      mentionsMonth: monthWords.some((word) => text.includes(word)),
    };
  });

  const noteRows = notesResult.data ?? [];
  const annotatedNotes = noteRows.map((row) => {
    const text = (row.content ?? "").toLowerCase();
    return {
      jobberJobId: row.jobber_job_id,
      jobberClientId: row.jobber_client_id,
      content: row.content,
      mentionsMonth: monthWords.some((word) => text.includes(word)),
    };
  });

  return NextResponse.json({
    success: true,
    totalJobsInDb: allJobsCountResult.count ?? null,
    jobsWithInstructions: {
      sampledCount: annotatedJobs.length,
      likelyMonthMentions: annotatedJobs.filter((row) => row.mentionsMonth).length,
      results: annotatedJobs,
    },
    jobNotes: {
      notesError: notesResult.error?.message ?? null,
      sampledCount: annotatedNotes.length,
      likelyMonthMentions: annotatedNotes.filter((row) => row.mentionsMonth).length,
      results: annotatedNotes,
    },
  });
}
