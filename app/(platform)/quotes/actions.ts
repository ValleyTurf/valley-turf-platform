"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  generatePublicToken,
  allowedStatusTransitions,
  isQuoteStatus,
  canEditQuote,
  type QuoteStatus,
} from "@/lib/quotes";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function cleanDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

export async function createQuote(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to create a quote." };
  }

  const recipientName = cleanText(formData.get("recipient_name"));
  const description = cleanText(formData.get("description"));
  const priceTotal = cleanNumber(formData.get("price_total"));

  if (!recipientName) {
    return { error: "Recipient name is required." };
  }

  if (!description) {
    return { error: "A description of the work is required." };
  }

  if (!Number.isFinite(priceTotal) || priceTotal < 0) {
    return { error: "Enter a valid, non-negative price." };
  }

  const row = {
    customer_id: cleanText(formData.get("customer_id")),
    lead_id: cleanText(formData.get("lead_id")),
    recipient_name: recipientName,
    recipient_email: cleanText(formData.get("recipient_email")),
    recipient_phone: cleanText(formData.get("recipient_phone")),
    recipient_address: cleanText(formData.get("recipient_address")),
    service_category: cleanText(formData.get("service_category")),
    description,
    price_total: priceTotal,
    expires_at: cleanDate(formData.get("expires_at")),
    status: "draft" as QuoteStatus,
    public_token: generatePublicToken(),
    created_by: actor.id,
    created_by_name: actor.name,
  };

  const { data, error } = await supabaseServer
    .from("quotes")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to create quote: ${error.message}` };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "quote",
    entityId: data?.id ?? null,
    entityLabel: `Quote for ${recipientName}`,
    after: row,
  });

  revalidatePath("/quotes");
  redirect(`/quotes/${data.id}`);
}

export async function deleteDraftQuote(id: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to delete a quote.");
  }

  const { data: existing } = await supabaseServer
    .from("quotes")
    .select("id, status, recipient_name")
    .eq("id", id)
    .single();

  if (!existing) {
    throw new Error("Quote not found.");
  }

  if (!canEditQuote(existing.status)) {
    throw new Error("Only draft quotes can be deleted.");
  }

  const { error } = await supabaseServer.from("quotes").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete quote: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "quote",
    entityId: id,
    entityLabel: `Quote for ${existing.recipient_name}`,
    before: existing,
  });

  revalidatePath("/quotes");
  redirect("/quotes");
}

// Internal (logged-in) status changes — separate from the public
// accept/decline actions in app/q/[token]/actions.ts, which have no
// session to check and instead trust only the unguessable token.
// Plain throwing action (like deleteDraftQuote above), bound to
// (id, nextStatus) from each status button — there's no form input
// worth showing inline-validation state for here, just a confirm click.
export async function markQuoteStatus(
  id: string,
  nextStatus: QuoteStatus
): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to update a quote.");
  }

  const { data: existing, error: fetchError } = await supabaseServer
    .from("quotes")
    .select("id, status, recipient_name")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    throw new Error("Quote not found.");
  }

  if (!isQuoteStatus(existing.status)) {
    throw new Error("Quote has an unrecognized status.");
  }

  if (!allowedStatusTransitions(existing.status).includes(nextStatus)) {
    throw new Error(
      `Can't move a quote from "${existing.status}" to "${nextStatus}".`
    );
  }

  const update: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "accepted" || nextStatus === "declined") {
    update.responded_at = new Date().toISOString();
  }

  const { error } = await supabaseServer
    .from("quotes")
    .update(update)
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update quote: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "quote",
    entityId: id,
    entityLabel: `Quote for ${existing.recipient_name}`,
    before: { status: existing.status },
    after: { status: nextStatus },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}
