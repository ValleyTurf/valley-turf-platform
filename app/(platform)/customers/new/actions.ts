"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { supabaseServer } from "@/lib/supabase-server";
import {
  createJobberClientForLead,
  splitName,
  type LeadForJobberClient,
} from "@/lib/leadJobberClient";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Ryan confirmed (2026-09-07): staff need a way to add a brand-new
// customer from inside this app instead of only via Jobber's own UI.
// createJobberClientForLead (lib/leadJobberClient.ts) already creates a
// real Jobber client + property — it's reused as-is here, same mutation
// /request-quote and quote-acceptance already use.
//
// Unlike those two flows, this is a deliberate admin action rather than
// a side effect of something else — so a Jobber failure here is
// surfaced inline as an error instead of failing silently.
//
// The one genuinely new piece: immediately upserting a row into the
// local `customers` table (same shape sync-customers/route.ts writes)
// so the new customer shows up in this app's own /customers list right
// away, without waiting for the next scheduled sync run.
export async function createCustomer(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to add a customer." };
  }

  const fullName = cleanText(formData.get("full_name"));
  const email = cleanText(formData.get("email"));
  const phone = cleanText(formData.get("phone"));
  const street = cleanText(formData.get("street"));
  const city = cleanText(formData.get("city"));
  const state = cleanText(formData.get("state"));
  const zip = cleanText(formData.get("zip"));

  if (!fullName) {
    return { error: "Enter the customer's name." };
  }

  const lead: LeadForJobberClient = {
    fullName,
    email,
    phone,
    street,
    city,
    state,
    zip,
  };

  const result = await createJobberClientForLead(lead);

  if (!result.ok) {
    return { error: `Couldn't create the customer in Jobber: ${result.error}` };
  }

  const { clientId } = result.value;
  const { firstName, lastName } = splitName(fullName);

  const { error: upsertError } = await supabaseServer.from("customers").upsert(
    {
      jobber_client_id: clientId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      company_name: null,
      email,
      phone,
      address_line_1: street,
      address_line_2: null,
      city,
      state,
      postal_code: zip,
      country: street ? "US" : null,
      current_balance: 0,
      last_synced_at: new Date().toISOString(),
      latitude: null,
      longitude: null,
      geo_status: null,
    },
    { onConflict: "jobber_client_id" }
  );

  if (upsertError) {
    // The Jobber client already exists at this point — don't leave the
    // customer invisible in this app just because the local mirror
    // write failed. Surface it so Ryan knows to check, but the next
    // scheduled sync will still pick this client up either way.
    return {
      error: `Customer was created in Jobber, but couldn't be saved locally yet (it will appear after the next sync): ${upsertError.message}`,
    };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "customer",
    entityId: clientId,
    entityLabel: fullName,
    after: {
      jobber_client_id: clientId,
      full_name: fullName,
      email,
      phone,
      address_line_1: street,
      city,
      state,
      postal_code: zip,
    },
  });

  revalidatePath("/customers");
  redirect(`/customers/${encodeURIComponent(clientId)}`);
}
