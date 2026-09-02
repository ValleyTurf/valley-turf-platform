// Public counterpart to lib/uploadVisitPhotosClient.ts, used by
// app/request-quote's RequestQuoteForm. Same compress-then-upload-direct
// pattern; see that file's header comment for why the direct-to-storage
// approach is necessary at all (Vercel's Serverless Function body cap).
import { supabaseBrowser } from "./supabase-browser";
import { createLeadPhotoUploadUrl } from "./leadPhotoUploadAction";

export type PhotoUploadResult = {
  paths: string[];
  error: string | null;
};

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
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

    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[a-zA-Z0-9]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function uploadOne(
  draftId: string,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const compressed = await compressImage(file);

  const prep = await createLeadPhotoUploadUrl(draftId, compressed.name);

  if (prep.error || !prep.path || !prep.token) {
    return { path: null, error: prep.error ?? "Could not prepare photo upload." };
  }

  const { error } = await supabaseBrowser.storage
    .from("lead-photos")
    .uploadToSignedUrl(prep.path, prep.token, compressed);

  if (error) {
    return { path: null, error: error.message };
  }

  return { path: prep.path, error: null };
}

export async function uploadLeadPhotosFromBrowser(
  draftId: string,
  files: File[]
): Promise<PhotoUploadResult> {
  const usableFiles = files.filter((file) => file && file.size > 0);

  const results = await Promise.all(usableFiles.map((file) => uploadOne(draftId, file)));

  const paths = results
    .filter((r): r is { path: string; error: null } => r.path !== null)
    .map((r) => r.path);

  const firstError = results.find((r) => r.error)?.error ?? null;

  return { paths, error: firstError };
}
