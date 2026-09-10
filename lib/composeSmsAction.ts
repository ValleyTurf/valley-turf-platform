"use server";

// SMS counterpart to lib/composeEmailAction.ts -- same shape and same
// reasoning (look the customer's phone up fresh by jobberClientId rather
// than trusting a value passed from the client). Used by the Messages
// per-customer thread's reply box (ReplyForm.tsx) so staff can text back
// a customer, not just email them.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { sendManualSms } from "@/lib/notifications";

export async function sendManualSmsToCustomer(
  jobberClientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Write a message before sending." };
  }

  const { data: customer, error: customerError } = await supabaseServer
    .from("customers")
    .select("phone")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (customerError || !customer) {
    return { error: "Couldn't find this customer's record." };
  }

  if (!customer.phone) {
    return { error: "This customer has no phone number on file." };
  }

  const sent = await sendManualSms({
    toPhone: customer.phone,
    body,
    jobberClientId,
    createdByUserId: actor.id,
    createdByName: actor.name,
  });

  if (!sent) {
    return {
      error: "The text couldn't be sent. Check the Twilio configuration and try again.",
    };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "contact_history_sms",
    entityId: jobberClientId,
    entityLabel: body.slice(0, 80),
    after: { body },
  });

  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
  revalidatePath(`/messages/${encodeURIComponent(jobberClientId)}`);
  revalidatePath("/messages");

  return { error: null };
}
