// Read side for jobber_job_notes — historical notes/photos entered
// directly in Jobber, backfilled by app/api/jobber/sync-job-notes/route.ts.
// See 027_add_jobber_job_notes.sql for why these live in their own
// table instead of visit_notes (Jobber has no per-visit granularity for
// notes; these are job-level).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { PHOTO_BUCKET, visitNotePhotoUrl } from "@/lib/visitNotes";

export type JobberJobNote = {
  id: string;
  jobberJobId: string;
  jobNumber: string | null;
  message: string | null;
  photoUrls: string[];
  // Raw storage paths, same order as photoUrls — see removeJobberJobNotePhoto.
  photoPaths: string[];
  createdAt: string | null;
};

type JobberJobNoteRow = {
  id: string;
  jobber_job_id: string;
  job_number: string | null;
  message: string | null;
  photo_paths: string[] | null;
  jobber_created_at: string | null;
};

// Newest first — same ordering convention as getVisitNotesForClient's
// groups, so both lists read top-to-bottom as "most recent first."
export async function getJobberJobNotesForClient(
  jobberClientId: string
): Promise<JobberJobNote[]> {
  const { data, error } = await supabaseServer
    .from("jobber_job_notes")
    .select("id, jobber_job_id, job_number, message, photo_paths, jobber_created_at")
    .eq("jobber_client_id", jobberClientId)
    .order("jobber_created_at", { ascending: false });

  if (error) {
    console.error("Jobber job notes query failed:", error.message);
    return [];
  }

  return ((data ?? []) as JobberJobNoteRow[]).map((row) => ({
    id: row.id,
    jobberJobId: row.jobber_job_id,
    jobNumber: row.job_number,
    message: row.message,
    photoUrls: (row.photo_paths ?? []).map(visitNotePhotoUrl),
    photoPaths: row.photo_paths ?? [],
    createdAt: row.jobber_created_at,
  }));
}

// The one write path into this otherwise-read-only table. Added so a
// photo Jobber (or the one-time backfill) attached to the wrong job/
// client can actually be removed instead of sitting there permanently —
// same pattern as lib/visitNotes.ts's removeVisitNotePhoto.
export async function removeJobberJobNotePhoto(
  noteId: string,
  photoPath: string
): Promise<{ error: string | null }> {
  const { data: noteRow, error: fetchError } = await supabaseServer
    .from("jobber_job_notes")
    .select("photo_paths")
    .eq("id", noteId)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError.message };
  }

  if (!noteRow) {
    return { error: "Note not found." };
  }

  const remainingPaths = ((noteRow.photo_paths ?? []) as string[]).filter(
    (p) => p !== photoPath
  );

  const { error: updateError } = await supabaseServer
    .from("jobber_job_notes")
    .update({ photo_paths: remainingPaths })
    .eq("id", noteId);

  if (updateError) {
    return { error: updateError.message };
  }

  await supabaseServer.storage.from(PHOTO_BUCKET).remove([photoPath]);

  return { error: null };
}
