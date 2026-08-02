"use server";

// A dedicated, whole-file Server Action module (same pattern as
// app/(platform)/my-day/actions.ts) — kept separate from
// lib/visitNotes.ts, which is a regular server-only module (not
// importable from Client Components at all), so this one function can
// be imported directly by AddVisitNoteForm.tsx / VisitNoteForm.tsx.
//
// Why this exists: photo uploads used to go through addVisitNote /
// addVisitNoteFromMyDay as multipart FormData, which routes through our
// own Vercel serverless function. Vercel caps Serverless Function
// request bodies at roughly 4.5MB — a hard platform limit, NOT
// something next.config.ts's experimental.serverActions.bodySizeLimit
// can raise — and a single real phone camera photo (commonly 3-8MB)
// blows past that on its own, which is why raising bodySizeLimit alone
// didn't fix the "page couldn't load" failures on mobile.
//
// The fix: this action only ever handles a filename (tiny payload) and
// returns a short-lived signed upload URL/token. The actual photo bytes
// go straight from the browser to Supabase's storage service via
// lib/uploadVisitPhotosClient.ts's uploadToSignedUrl call — never
// touching our Vercel function at all, so its body limit is irrelevant.
import { supabaseServer } from "@/lib/supabase-server";

const PHOTO_BUCKET = "visit-photos";

export async function createVisitPhotoUploadUrl(
  jobberVisitId: string,
  fileName: string
): Promise<
  | { path: string; token: string; error: null }
  | { path: null; token: null; error: string }
> {
  if (!jobberVisitId) {
    return { path: null, token: null, error: "Missing visit." };
  }

  // Same random-filename reasoning uploadVisitNotePhotos used to have:
  // avoids collisions, and there's no reason a phone's original
  // filename (which can include identifying info from a camera roll)
  // needs to end up in storage.
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileName || "");
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const path = `${jobberVisitId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabaseServer.storage
    .from(PHOTO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("Failed to create signed upload URL:", error?.message);
    return {
      path: null,
      token: null,
      error: error?.message ?? "Could not prepare photo upload.",
    };
  }

  return { path: data.path, token: data.token, error: null };
}
