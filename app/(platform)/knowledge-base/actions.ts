"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireManager } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { parseTagsInput } from "@/lib/knowledgeBase";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function createArticle(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // requireManager() is the real gate here (page-level enforcement is
  // /knowledge-base/new being in MANAGER_PLUS_PREFIXES) — this is
  // defense in depth for the action itself, same relationship every
  // other manager-plus route has with its action.
  const actor = await requireManager();

  const title = cleanText(formData.get("title"));
  const content = cleanText(formData.get("content"));
  const tags = parseTagsInput(String(formData.get("tags") ?? ""));

  if (!title) {
    return { error: "Title is required." };
  }

  if (!content) {
    return { error: "Article content is required." };
  }

  const row = {
    title,
    content,
    tags,
    created_by: actor.id,
    created_by_name: actor.name,
    updated_by: actor.id,
    updated_by_name: actor.name,
  };

  const { data, error } = await supabaseServer
    .from("knowledge_base_articles")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to create article: ${error.message}` };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "knowledge_base_article",
    entityId: data?.id ?? null,
    entityLabel: title,
    after: row,
  });

  revalidatePath("/knowledge-base");
  redirect(`/knowledge-base/${data.id}`);
}

export async function updateArticle(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireManager();

  const title = cleanText(formData.get("title"));
  const content = cleanText(formData.get("content"));
  const tags = parseTagsInput(String(formData.get("tags") ?? ""));

  if (!title) {
    return { error: "Title is required." };
  }

  if (!content) {
    return { error: "Article content is required." };
  }

  const { data: existing } = await supabaseServer
    .from("knowledge_base_articles")
    .select("title, content, tags")
    .eq("id", id)
    .single();

  if (!existing) {
    return { error: "Article not found." };
  }

  const update = {
    title,
    content,
    tags,
    updated_by: actor.id,
    updated_by_name: actor.name,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseServer
    .from("knowledge_base_articles")
    .update(update)
    .eq("id", id);

  if (error) {
    return { error: `Failed to save changes: ${error.message}` };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "knowledge_base_article",
    entityId: id,
    entityLabel: title,
    before: existing,
    after: update,
  });

  revalidatePath("/knowledge-base");
  revalidatePath(`/knowledge-base/${id}`);
  redirect(`/knowledge-base/${id}`);
}

export async function deleteArticle(id: string): Promise<void> {
  const actor = await requireManager();

  const { data: existing } = await supabaseServer
    .from("knowledge_base_articles")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    throw new Error("Article not found.");
  }

  const { error } = await supabaseServer
    .from("knowledge_base_articles")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete article: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "knowledge_base_article",
    entityId: id,
    entityLabel: existing.title,
    before: existing,
  });

  revalidatePath("/knowledge-base");
  redirect("/knowledge-base");
}
