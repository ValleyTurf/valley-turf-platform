"use server";

// Public counterpart to lib/visitPhotoUploadAction.ts — mints a signed
// upload URL for a prospect's browser to PUT a photo straight to Supabase
// Storage, bypassing our own Vercel function (and its ~4.5MB body cap)
// entirely. Deliberately no auth/session check here: this is called from
// the public /request-quote page (app/request-quote), which has no
// logged-in user at all. draftId is a client-generated crypto.randomUUID()
// minted once when the form loads, so all photos from one submission land
// under the same folder even though the leads row they'll attach to
// doesn't exist yet at upload time.
import { supabaseServer } from "@/lib/supabase-server";

const PHOTO_BUCKET = "lead-photos";

export async function createLeadPhotoUploadUrl(
  draftId: string,
  fileName: string
): Promise<
  | { path: string; token: string; error: null }
  | { path: null; token: null; error: string }
> {
  if (!draftId) {
    return { path: null, token: null, error: "Missing draft id." };
  }

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileName || "");
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const path = `${draftId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabaseServer.storage
    .from(PHOTO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("Failed to create lead photo signed upload URL:", error?.message);
    return {
      path: null,
      token: null,
      error: error?.message ?? "Could not prepare photo upload.",
    };
  }

  return { path: data.path, token: data.token, error: null };
}
