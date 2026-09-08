"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { createNativeCustomer } from "@/lib/nativeCustomers";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Ryan confirmed (2026-09-07): staff need a way to add a brand-new
// customer from inside this app instead of only via Jobber's own UI.
//
// As of Tier 4 (Jobber Independence Roadmap), this creates the customer
// natively — lib/nativeCustomers.ts's createNativeCustomer writes
// straight into this app's own `customers` table (source='native'),
// no Jobber round-trip at all. Earlier this called Jobber's clientCreate
// mutation directly; that's no longer needed since the customer record
// itself doesn't have to live in Jobber for anything downstream (jobs,
// invoicing, and payments are all already native — see lib/nativeJobs.ts
// and lib/invoices.ts). This is a deliberate admin action rather than a
// side effect of something else, so a failure here is surfaced inline as
// an error instead of failing silently.
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

  const result = await createNativeCustomer({
    fullName,
    email,
    phone,
    street,
    city,
    state,
    zip,
  });

  if (!result.ok) {
    return { error: `Couldn't create the customer: ${result.error}` };
  }

  const { clientId } = result.value;

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
