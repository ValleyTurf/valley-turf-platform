"use server";

// Shared team task list -- add/check-off/delete, no assignees or due
// dates. Same typed-args / {error} return pattern as other client-driven
// actions in this app (e.g. my-day/actions.ts) since TaskList.tsx needs
// inline error feedback without a full page navigation.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";

export async function addTask(
  description: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const trimmed = description.trim();

  if (!trimmed) {
    return { error: "Enter a task." };
  }

  const { error } = await supabaseServer.from("tasks").insert({
    description: trimmed,
    created_by_user_id: actor.id,
    created_by_name: actor.name,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/tasks");

  return { error: null };
}

export async function toggleTask(
  id: string,
  isDone: boolean
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const { error } = await supabaseServer
    .from("tasks")
    .update({
      is_done: isDone,
      completed_at: isDone ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/tasks");

  return { error: null };
}

export async function deleteTask(
  id: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const { error } = await supabaseServer.from("tasks").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/tasks");

  return { error: null };
}
