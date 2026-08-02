"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  insertVisitNote,
  uploadVisitNotePhotos,
} from "@/lib/visitNotes";

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
// for. Both call the same lib/visitNotes.ts helpers. Called from
// AddVisitNoteForm.tsx (a client component, not a plain <form action>)
// specifically so the {error} return value has somewhere to go — an
// earlier plain-form version of this swallowed failures into a
// server-only console.error, which looked from the field like the
// button just did nothing.
export async function addVisitNote(
  jobberClientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();
  const jobberVisitId = cleanText(formData.get("jobber_visit_id"));
  const note = cleanText(formData.get("note"));
  const photoFiles = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File);

  if (!jobberVisitId) {
    return { error: "Choose which visit this note is about." };
  }

  const photoPaths = await uploadVisitNotePhotos(jobberVisitId, photoFiles);

  if (photoFiles.length > 0 && photoPaths.length === 0) {
    return {
      error:
        "Photo upload failed — the note wasn't saved. Try again, or save with just text for now.",
    };
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
