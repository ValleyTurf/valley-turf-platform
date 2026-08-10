// Shared visit-notes logic used by both capture points: My Day (crew, in
// the field, tied to the visit they're actively on) and the customer page
// (office staff, after the fact, picking which past visit a note is
// about). Both actions.ts files (my-day and customers/[id]) call these
// same functions so the note row shape never drifts between the two
// entry points. See 026_add_visit_notes_and_turf_range.sql for the
// visit_notes table and visit-photos storage bucket.
//
// Photo upload itself does NOT live here anymore — it used to
// (uploadVisitNotePhotos, routing bytes through this server-only module
// via a multipart Server Action call), but that meant every photo
// counted against Vercel's ~4.5MB Serverless Function body cap, which a
// single real phone photo can exceed on its own. See
// lib/visitPhotoUploadAction.ts + lib/uploadVisitPhotosClient.ts for the
// direct-browser-to-storage replacement — by the time a note reaches
// insertVisitNote below, its photos are already uploaded and all this
// needs is the resulting storage paths.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

// Exported so lib/jobberJobNotes.ts's removeJobberJobNotePhoto can delete
// from the same bucket without hardcoding the name a second place — both
// visit_notes and jobber_job_notes store their photos here (see
// 026_add_visit_notes_and_turf_range.sql and the jobber-import backfill
// in app/api/jobber/sync-job-notes/route.ts).
export const PHOTO_BUCKET = "visit-photos";

export type VisitNote = {
  id: string;
  jobberVisitId: string;
  jobberClientId: string;
  authorName: string | null;
  note: string | null;
  photoUrls: string[];
  // Raw storage paths, same order as photoUrls — needed alongside the
  // public URLs so removeVisitNotePhoto below has something stable to
  // delete by (the public URL is derived from the path, not the other
  // way around).
  photoPaths: string[];
  createdAt: string;
};

// A visit's notes grouped together, with the visit's own date/title so
// the customer page can order groups by visit recency independent of
// when each individual note was written.
export type VisitNoteGroup = {
  jobberVisitId: string;
  visitDateLabel: string;
  visitStartAt: string | null;
  visitTitle: string | null;
  notes: VisitNote[];
};

export function visitNotePhotoUrl(path: string): string {
  return supabaseServer.storage.from(PHOTO_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

// Both addVisitNote (customers/[id]/actions.ts) and addVisitNoteFromMyDay
// (my-day/actions.ts) receive already-uploaded photo storage paths as a
// JSON-encoded "photo_paths" field (see lib/uploadVisitPhotosClient.ts —
// the browser uploads the actual files, then sets this field before
// calling the action) rather than raw File entries. Malformed/missing
// input is treated as "no photos" rather than an error — the note text
// alone is still worth saving.
export function parsePhotoPathsField(formData: FormData): string[] {
  const raw = formData.get("photo_paths");

  if (typeof raw !== "string" || !raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export async function insertVisitNote(params: {
  jobberVisitId: string;
  jobberClientId: string;
  authorUserId: string | null;
  note: string | null;
  photoPaths: string[];
}): Promise<{ error: string | null }> {
  if (!params.note && params.photoPaths.length === 0) {
    return { error: "Add a note or at least one photo." };
  }

  const { error } = await supabaseServer.from("visit_notes").insert({
    jobber_visit_id: params.jobberVisitId,
    jobber_client_id: params.jobberClientId,
    author_user_id: params.authorUserId,
    note: params.note,
    photo_paths: params.photoPaths,
  });

  return { error: error?.message ?? null };
}

// Removes a single photo from a visit note — e.g. a crew member logged a
// note/photo against the wrong customer's visit and office staff wants to
// pull just that photo without deleting the whole note (note text, if
// any, is left alone). Updates the note's photo_paths array first since
// that's what actually controls whether the app shows the photo anywhere;
// the storage delete is best-effort on top of that; a fixed pattern applies
// here of only surfacing failures.
export async function removeVisitNotePhoto(
  noteId: string,
  photoPath: string
): Promise<{ error: string | null }> {
  const { data: noteRow, error: fetchError } = await supabaseServer
    .from("visit_notes")
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
    .from("visit_notes")
    .update({ photo_paths: remainingPaths })
    .eq("id", noteId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Best-effort: also remove the file from storage so it doesn't keep
  // counting against the storage quota. If this fails (already gone,
  // transient error), the photo is still gone from the app either way —
  // the DB update above is what actually matters — so we don't turn a
  // storage-only hiccup into a user-facing error.
  await supabaseServer.storage.from(PHOTO_BUCKET).remove([photoPath]);

  return { error: null };
}

type VisitNoteRow = {
  id: string;
  jobber_visit_id: string;
  jobber_client_id: string;
  author_user_id: string | null;
  note: string | null;
  photo_paths: string[] | null;
  created_at: string;
};

type VisitRow = {
  jobber_visit_id: string;
  title: string | null;
  start_at: string | null;
};

function formatVisitDateLabel(value: string | null): string {
  if (!value) return "Unscheduled visit";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled visit";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// Fetches every note for a customer, grouped by visit and ordered the way
// the customer page wants: the most recently-dated visit's group first,
// then oldest-to-newest within each visit's own notes (so a same-day
// follow-up note reads underneath the original one, not above it).
export async function getVisitNotesForClient(
  jobberClientId: string
): Promise<VisitNoteGroup[]> {
  const { data, error } = await supabaseServer
    .from("visit_notes")
    .select(
      "id, jobber_visit_id, jobber_client_id, author_user_id, note, photo_paths, created_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Visit notes query failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as VisitNoteRow[];

  if (rows.length === 0) return [];

  const visitIds = Array.from(new Set(rows.map((r) => r.jobber_visit_id)));
  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_user_id).filter((id): id is string => Boolean(id)))
  );

  const [{ data: visitsData }, { data: authorsData }] = await Promise.all([
    supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, title, start_at")
      .in("jobber_visit_id", visitIds),
    authorIds.length > 0
      ? supabaseServer.from("users").select("id, name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const visitById = new Map<string, VisitRow>(
    ((visitsData ?? []) as VisitRow[]).map((v) => [v.jobber_visit_id, v])
  );
  const authorNameById = new Map<string, string>(
    ((authorsData ?? []) as { id: string; name: string }[]).map((u) => [
      u.id,
      u.name,
    ])
  );

  const groupsByVisit = new Map<string, VisitNoteGroup>();

  for (const row of rows) {
    const visit = visitById.get(row.jobber_visit_id) ?? null;

    let group = groupsByVisit.get(row.jobber_visit_id);
    if (!group) {
      group = {
        jobberVisitId: row.jobber_visit_id,
        visitDateLabel: formatVisitDateLabel(visit?.start_at ?? null),
        visitStartAt: visit?.start_at ?? null,
        visitTitle: visit?.title ?? null,
        notes: [],
      };
      groupsByVisit.set(row.jobber_visit_id, group);
    }

    group.notes.push({
      id: row.id,
      jobberVisitId: row.jobber_visit_id,
      jobberClientId: row.jobber_client_id,
      authorName: row.author_user_id
        ? authorNameById.get(row.author_user_id) ?? null
        : null,
      note: row.note,
      photoUrls: (row.photo_paths ?? []).map(visitNotePhotoUrl),
      photoPaths: row.photo_paths ?? [],
      createdAt: row.created_at,
    });
  }

  // Groups themselves sort most-recent-visit-first; a visit with no known
  // start_at (shouldn't normally happen — a note references a real visit)
  // sorts last rather than crashing the comparison.
  return Array.from(groupsByVisit.values()).sort((a, b) => {
    const aTime = a.visitStartAt ? new Date(a.visitStartAt).getTime() : -Infinity;
    const bTime = b.visitStartAt ? new Date(b.visitStartAt).getTime() : -Infinity;
    return bTime - aTime;
  });
}
