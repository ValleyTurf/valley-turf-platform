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

// Real phone camera photos are commonly 3-8MB — on a weak cell signal
// at a job site, the sheer number of bytes to transfer is the biggest
// cost, bigger than anything else in this file. Downscaling to a sane
// max dimension and re-encoding as JPEG before upload typically cuts
// that by 5-10x with no visible quality loss at the sizes these are
// ever actually viewed (a card thumbnail, a lawn close-up on the
// customer page) — nothing here ever needs a 12MP original.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
// Below this, compressing isn't worth the CPU time — already small.
const SKIP_COMPRESSION_BELOW_BYTES = 400_000;

async function compressImage(file: File): Promise<File> {
  if (file.size < SKIP_COMPRESSION_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );

    // Only swap in the compressed version if it's actually smaller —
    // an already-efficient JPEG at a modest resolution can occasionally
    // come back larger after re-encoding.
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[a-zA-Z0-9]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    // Some format createImageBitmap couldn't decode (a HEIC that a
    // particular browser doesn't support, etc.), or any other
    // unexpected failure — upload the original rather than block the
    // note entirely. This is a pure optimization, never a hard
    // dependency.
    return file;
  }
}

async function uploadOne(
  jobberVisitId: string,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const compressed = await compressImage(file);

  const prep = await createVisitPhotoUploadUrl(jobberVisitId, compressed.name);

  if (prep.error || !prep.path || !prep.token) {
    return { path: null, error: prep.error ?? "Could not prepare photo upload." };
  }

  const { error } = await supabaseBrowser.storage
    .from("visit-photos")
    .uploadToSignedUrl(prep.path, prep.token, compressed);

  if (error) {
    return { path: null, error: error.message };
  }

  return { path: prep.path, error: null };
}

export async function uploadVisitPhotosFromBrowser(
  jobberVisitId: string,
  files: File[]
): Promise<PhotoUploadResult> {
  const usableFiles = files.filter((file) => file && file.size > 0);

  // Uploaded in parallel rather than one at a time — each file was
  // previously two full network round trips (get a signed URL, then
  // upload the bytes) done in strict sequence, so N photos took
  // roughly N times as long as one. A handful of photos per note is
  // the normal case here, so no concurrency cap is needed (unlike a
  // bulk backfill syncing hundreds of records at once).
  const results = await Promise.all(usableFiles.map((file) => uploadOne(jobberVisitId, file)));

  const paths = results
    .filter((r): r is { path: string; error: null } => r.path !== null)
    .map((r) => r.path);

  const firstError = results.find((r) => r.error)?.error ?? null;

  return { paths, error: firstError };
}
