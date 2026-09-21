// One-time diagnostic (2026-09-22). Ryan: "Many customers have the
// months of their full cleanings in the Service Instructions" -- before
// designing the Maintenance-to-Full auto-flip (roadmap item 19), this
// pulls a sample of recurring jobs' actual instructions text so the
// real format(s) in use can be seen, rather than guessed at. Whatever
// pattern shows up here (a fixed phrase, a list of month names, etc.)
// is what the auto-flip's month-parsing logic needs to actually handle.
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

  const { data, error } = await supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, job_number, title, instructions, recurrence_frequency, jobber_client_id"
    )
    .eq("job_type", "RECURRING")
    .not("instructions", "is", null)
    .neq("instructions", "")
    .order("job_number", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json(
      { success: false, error: `Couldn't read jobs: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = data ?? [];

  // Cheap heuristic just to flag which rows are worth looking at first --
  // not used for anything beyond sorting this report.
  const monthWords = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];

  const annotated = rows.map((row) => {
    const text = (row.instructions ?? "").toLowerCase();
    return {
      jobberJobId: row.jobber_job_id,
      jobNumber: row.job_number,
      title: row.title,
      recurrenceFrequency: row.recurrence_frequency,
      instructions: row.instructions,
      mentionsMonth: monthWords.some((word) => text.includes(word)),
    };
  });

  return NextResponse.json({
    success: true,
    sampledCount: annotated.length,
    likelyMonthMentions: annotated.filter((row) => row.mentionsMonth).length,
    results: annotated,
  });
}
