"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  insertVisitNote,
  parsePhotoPathsField,
  removeVisitNotePhoto,
} from "@/lib/visitNotes";
import { removeJobberJobNotePhoto } from "@/lib/jobberJobNotes";
import { getOrCreateEnrollmentToken, setAutopayEnabled } from "@/lib/autopay";
import { syncSingleCustomer } from "@/lib/jobberWebhookProcessor";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateCustomerProfile(
  jobberClientId: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  // TurfSizeField.tsx renders either the range <select> or the exact
  // <input>, never both at once — whichever field the DOM didn't render
  // simply isn't present in formData, which naturally clears the other
  // column here. That's intentional: switching a property from "Exact"
  // to a preset range (or back) replaces the old value rather than
  // leaving stale data in the column the form isn't showing anymore.
  const updates = {
    turf_size_sqft: cleanNumber(formData.get("turf_size_sqft")),
    turf_size_range: cleanText(formData.get("turf_size_range")),
    gate_code: cleanText(formData.get("gate_code")),
    pet_count: cleanNumber(formData.get("pet_count")),
    pet_names: cleanText(formData.get("pet_names")),
    odor_level: cleanText(formData.get("odor_level")),
    subscription_plan: cleanText(formData.get("subscription_plan")),
    service_instructions: cleanText(formData.get("service_instructions")),
  };

  const { data: before } = await supabaseServer
    .from("customers")
    .select(
      "full_name, turf_size_sqft, turf_size_range, gate_code, pet_count, pet_names, odor_level, subscription_plan, service_instructions"
    )
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("customers")
    .update(updates)
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    throw new Error(`Failed to update customer profile: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "customer",
    entityId: jobberClientId,
    entityLabel: before?.full_name ?? null,
    before,
    after: { ...updates, full_name: before?.full_name ?? null },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}

// The old free-text "Internal Notes" field, split out of
// updateCustomerProfile above and moved into its own small form in the
// new Notes section — general/standing notes about the property that
// aren't about any one visit (e.g. "prefers text over email"), as
// opposed to the per-visit notes+photos captured by addVisitNote below.
export async function updateGeneralNotes(
  jobberClientId: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();
  const notes = cleanText(formData.get("notes"));

  const { data: before } = await supabaseServer
    .from("customers")
    .select("full_name, notes")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("customers")
    .update({ notes })
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    throw new Error(`Failed to update customer notes: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "customer",
    entityId: jobberClientId,
    entityLabel: before?.full_name ?? null,
    before,
    after: { notes, full_name: before?.full_name ?? null },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}

// Per-visit note + photos, added from the customer page (office staff,
// picking which past visit this is about) — see my-day/actions.ts's
// addVisitNoteFromMyDay for the field-capture counterpart, which skips
// the visit picker since My Day already knows which visit the card is
// for. Both share lib/visitNotes.ts's insertVisitNote/parsePhotoPathsField.
// Called from AddVisitNoteForm.tsx (a client component, not a plain
// <form action>) specifically so the {error} return value has somewhere
// to go, AND because photos are uploaded directly from the browser to
// storage before this action is ever called (see
// lib/uploadVisitPhotosClient.ts) — this action only ever receives the
// resulting paths, never raw file bytes, so it stays a tiny request well
// under Vercel's Serverless Function body limit no matter how large or
// how many photos were attached.
export async function addVisitNote(
  jobberClientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();
  const jobberVisitId = cleanText(formData.get("jobber_visit_id"));
  const note = cleanText(formData.get("note"));
  const photoPaths = parsePhotoPathsField(formData);

  if (!jobberVisitId) {
    return { error: "Choose which visit this note is about." };
  }

  const result = await insertVisitNote({
    jobberVisitId,
    jobberClientId,
    authorUserId: actor?.id ?? null,
    note,
    photoPaths,
  });

  if (result.error) {
    return { error: result.error };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "visit_note",
    entityId: jobberVisitId,
    entityLabel: note ?? `${photoPaths.length} photo(s)`,
    after: { note, photo_count: photoPaths.length },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);

  return { error: null };
}

// Bound with (jobberClientId, noteId) via .bind() in the page before
// being handed to PhotoGrid as its onRemove prop — PhotoGrid only ever
// supplies the photoPath, the last argument. Lets office staff pull a
// single photo that got logged against the wrong customer/visit without
// touching the note's text or its other photos.
export async function removeVisitPhoto(
  jobberClientId: string,
  noteId: string,
  photoPath: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();
  const result = await removeVisitNotePhoto(noteId, photoPath);

  if (result.error) {
    return result;
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "visit_note_photo",
    entityId: noteId,
    entityLabel: photoPath,
    before: { photo_path: photoPath },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);

  return { error: null };
}

// Jobber has no concept of a "primary" or "current" property -- when a
// customer moves and staff add a new property in Jobber instead of
// editing the old one in place, both stay on the client's record with
// no signal for which one is current. This lets staff pick, from the
// property list already rendered on this page (see getCustomer's
// clientProperties query), which one the customer card and any
// get-directions link should use. propertyId is null to clear the
// override and fall back to the default (first usable property).
export async function setCurrentProperty(
  jobberClientId: string,
  propertyId: string | null
): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("customers")
    .select("full_name, current_property_id")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("customers")
    .update({ current_property_id: propertyId })
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    throw new Error(`Failed to update current property: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "customer",
    entityId: jobberClientId,
    entityLabel: before?.full_name ?? null,
    before: { current_property_id: before?.current_property_id ?? null },
    after: { current_property_id: propertyId },
  });

  // Re-derive address_line_1/city/state/postal_code/lat/lng from Jobber
  // right away using the new override, so the schedule/my-day/directions
  // links reflect the change immediately instead of waiting for the next
  // scheduled customer sync.
  try {
    await syncSingleCustomer(jobberClientId);
  } catch (syncError) {
    console.error(
      `Current property saved, but re-syncing the address failed for ${jobberClientId}:`,
      syncError
    );
  }

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}

// Staff-facing counterpart to the portal's self-serve autopay flow
// (app/portal/autopay/actions.ts) -- for customers who won't log into
// the portal. Creates (or reuses) an unguessable enrollment_token so
// staff can copy /autopay/[token] and send it however they normally
// reach this customer (text, email, read it over the phone). Doesn't
// itself save a card -- the customer does that by opening the link.
export async function generateAutopayLink(jobberClientId: string): Promise<void> {
  const actor = await getCurrentUser();
  const result = await getOrCreateEnrollmentToken(jobberClientId);

  if (!result.ok) {
    throw new Error(`Failed to generate autopay link: ${result.error}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "autopay_enrollment_link",
    entityId: jobberClientId,
    entityLabel: jobberClientId,
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}

// Staff override -- turn a customer's autopay on/off without going
// through either enrollment flow (e.g. a customer calls and asks to
// pause it, or wants it back on and their card is still on file).
export async function toggleAutopay(
  jobberClientId: string,
  enabled: boolean
): Promise<void> {
  const actor = await getCurrentUser();
  const result = await setAutopayEnabled(jobberClientId, enabled);

  if (!result.ok) {
    throw new Error(`Failed to update autopay: ${result.error}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "autopay_enrollment",
    entityId: jobberClientId,
    entityLabel: jobberClientId,
    after: { autopay_enabled: enabled },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
}

// Same idea as removeVisitPhoto above, for a photo in the "Imported from
// Jobber" block instead of a visit note.
export async function removeImportedJobNotePhoto(
  jobberClientId: string,
  noteId: string,
  photoPath: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();
  const result = await removeJobberJobNotePhoto(noteId, photoPath);

  if (result.error) {
    return result;
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "jobber_job_note_photo",
    entityId: noteId,
    entityLabel: photoPath,
    before: { photo_path: photoPath },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);

  return { error: null };
}
