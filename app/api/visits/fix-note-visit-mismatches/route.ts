// Manual-trigger, one-time fix for the 3 visit_notes rows the sweep in
// app/api/visits/debug-note-visit-mismatches turned up (2026-09-20):
// notes/photos Ryan entered the morning of Sep 6 (all three logged within
// an 8-minute window: 07:38, 07:41, 07:46 UTC) that ended up attached to
// each customer's next-UPCOMING visit at the time instead of the past
// visit the note/photos were actually documenting. See
// AddVisitNoteForm.tsx's header comment for the root cause (already
// fixed for new notes going forward) -- this is only for notes saved
// before that fix shipped.
//
// Each move below was picked as the visit_notes row's closest PAST visit
// to when the note was actually created (created_at), which is how staff
// use this feature in practice -- documenting a visit shortly after it
// happens, never one that hasn't happened yet:
//   - Chris Brown  "No infill done."      created 2026-09-06 -- was on
//     Nov 7, 2026 (future) -> Aug 29, 2026 (7.7 days before the note)
//   - Tina Aghassi "Full infill done."    created 2026-09-06 -- was on
//     Nov 19, 2026 (future) -> Aug 28, 2026 (8.4 days before the note)
//   - Shaina Bohn  "Monthly Maintenance"  created 2026-09-06 -- was on
//     Sep 22, 2026 (future) -> Aug 26, 2026 (11.3 days before the note)
// In every case the next-closest candidate was 40+ days further away, so
// there's no real ambiguity about which visit each note belongs to.
//
// GET (no query params): read-only. Shows the planned move for each of
// the 3 notes and whether it's still safe to apply (i.e. the note is
// still attached to the wrong visit id recorded below -- if it's since
// changed, this skips it rather than overwriting something else).
// GET ?apply=true: updates each note's jobber_visit_id to the corrected
// visit. Rerunning after a successful apply is a no-op (nothing left
// matching the "still wrong" check).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLANNED_MOVES = [
  {
    noteId: "2de79518-c438-4ee9-9a86-ebffba2176be",
    customerName: "Chris Brown",
    wrongVisitId: "Z2lkOi8vSm9iYmVyL1Zpc2l0LzIxNTg3MDk1NTc=", // Nov 7, 2026
    correctVisitId: "Z2lkOi8vSm9iYmVyL1Zpc2l0LzIxNTg3MDk1NTQ=", // Aug 29, 2026
  },
  {
    noteId: "a5b6ac33-0160-4c33-a965-a3bce3d5993c",
    customerName: "Tina Aghassi",
    wrongVisitId: "Z2lkOi8vSm9iYmVyL1Zpc2l0LzE5NzkzOTcxOTg=", // Nov 19, 2026
    correctVisitId: "Z2lkOi8vSm9iYmVyL1Zpc2l0LzE5NzkzOTcxOTU=", // Aug 28, 2026
  },
  {
    noteId: "c101c3aa-77bf-46c7-8bae-f49fe933d3fb",
    customerName: "Shaina Bohn",
    wrongVisitId: "Z2lkOi8vSm9iYmVyL1Zpc2l0LzE5Mjk2OTQ4NTA=", // Sep 22, 2026
    correctVisitId: "Z2lkOi8vSm9iYmVyL1Zpc2l0LzE5Mjk2OTQ4NDk=", // Aug 26, 2026
  },
] as const;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  const results: Array<Record<string, unknown>> = [];

  for (const move of PLANNED_MOVES) {
    const { data: noteRow, error: fetchError } = await supabaseServer
      .from("visit_notes")
      .select("id, jobber_visit_id")
      .eq("id", move.noteId)
      .maybeSingle();

    if (fetchError) {
      results.push({ ...move, status: "error", error: fetchError.message });
      continue;
    }

    if (!noteRow) {
      results.push({ ...move, status: "not_found" });
      continue;
    }

    if (noteRow.jobber_visit_id !== move.wrongVisitId) {
      results.push({
        ...move,
        status: "skipped_already_changed",
        currentVisitId: noteRow.jobber_visit_id,
      });
      continue;
    }

    if (!apply) {
      results.push({ ...move, status: "would_apply" });
      continue;
    }

    const { error: updateError } = await supabaseServer
      .from("visit_notes")
      .update({ jobber_visit_id: move.correctVisitId })
      .eq("id", move.noteId);

    if (updateError) {
      results.push({ ...move, status: "error", error: updateError.message });
      continue;
    }

    results.push({ ...move, status: "applied" });
  }

  return NextResponse.json({
    success: true,
    mode: apply ? "apply" : "dry_run",
    results,
  });
}
