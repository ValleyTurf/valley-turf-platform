"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

// "No reply needed" -- clears a conversation from Needs Reply when the
// customer's last message doesn't call for an answer ("thanks!"). A newer
// customer message brings it back.
export async function markThreadHandled(
  jobberClientId: string
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  if (!user) return { error: "You must be signed in." };

  const { error } = await supabaseServer.from("message_threads_handled").upsert(
    {
      jobber_client_id: jobberClientId,
      handled_at: new Date().toISOString(),
      handled_by_name: user.name ?? null,
    },
    { onConflict: "jobber_client_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/messages");
  revalidatePath(`/messages/${jobberClientId}`);

  return { error: null };
}

export async function createSavedReply(
  title: string,
  body: string
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  if (!user) return { error: "You must be signed in." };

  const cleanTitle = title.trim().slice(0, 60);
  const cleanBody = body.trim().slice(0, 1000);

  if (!cleanTitle || !cleanBody) {
    return { error: "A saved reply needs a name and some text." };
  }

  const { error } = await supabaseServer.from("saved_replies").insert({
    title: cleanTitle,
    body: cleanBody,
    created_by_name: user.name ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/messages", "layout");

  return { error: null };
}

export async function deleteSavedReply(id: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  if (!user) return { error: "You must be signed in." };

  const { error } = await supabaseServer.from("saved_replies").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/messages", "layout");

  return { error: null };
}
