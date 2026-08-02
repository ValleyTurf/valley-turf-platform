// Shared by AddVisitNoteForm.tsx (customer page) and VisitNoteForm.tsx
// (My Day) — uploads each selected file straight from the browser to
// Supabase Storage, never routing the bytes through our own Vercel
// functions (see lib/visitPhotoUploadAction.ts for why that's
// necessary: Vercel's ~4.5MB Serverless Function body cap, which a
// single real phone photo can exceed on its own).
import { supabaseBrowser } from "./supabase-browser";
import { createVisitPhotoUploadUrl } from "./visitPhotoUploadAction";

export type PhotoUploadResult = {
  paths: string[];
  // Set only if at least one file failed — callers decide whether a
  // partial batch (some paths, plus an error) is still worth saving.
  error: string | null;
};

export async function uploadVisitPhotosFromBrowser(
  jobberVisitId: string,
  files: File[]
): Promise<PhotoUploadResult> {
  const paths: string[] = [];

  for (const file of files) {
    if (!file || file.size === 0) continue;

    const prep = await createVisitPhotoUploadUrl(jobberVisitId, file.name);

    if (prep.error || !prep.path || !prep.token) {
      return { paths, error: prep.error ?? "Could not prepare photo upload." };
    }

    const { error } = await supabaseBrowser.storage
      .from("visit-photos")
      .uploadToSignedUrl(prep.path, prep.token, file);

    if (error) {
      return { paths, error: error.message };
    }

    paths.push(prep.path);
  }

  return { paths, error: null };
}
