"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { sendManualEmailToCustomer } from "@/lib/composeEmailAction";
import { sendManualSmsToCustomer } from "@/lib/composeSmsAction";

// Replaces the old replyToCustomer, which wrote into portal_messages --
// the customer-portal chat table nobody actually uses (Ryan: "replying
// back goes into their client portal which no one is using"). Customers
// only ever see a staff reply here as a real email landing in their
// inbox (their reply to the 4-day/2-day reminder is what got this
// thread started in the first place, via the inbound-email webhook --
// see lib/replyRouting.ts + the email.received branch in
// app/api/webhooks/resend/route.ts), so staff's reply needs to go back
// out the same way instead of into an unused portal. Delegates entirely
// to sendManualEmailToCustomer (lib/composeEmailAction.ts) -- the same
// send/log/audit pipeline already used by the Customer page's Compose
// Email -- so a reply from here gets identical reply-to threading and
// contact_history logging. Only adds an auto-generated subject line on
// top, so this page's reply box can stay a single textarea rather than
// also asking staff to type a subject for what's really just a reply.
export async function replyToCustomerByEmail(
  jobberClientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const rawBody = formData.get("body");
  const body = typeof rawBody === "string" ? rawBody.trim() : "";

  if (!body) {
    return { error: "Write a reply before sending." };
  }

  const { data: lastInbound } = await supabaseServer
    .from("contact_history")
    .select("subject")
    .eq("jobber_client_id", jobberClientId)
    .eq("channel", "email")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const baseSubject =
    lastInbound?.subject?.trim() || "your message to Valley Turf Revival";
  const subject = baseSubject.toLowerCase().startsWith("re:")
    ? baseSubject
    : `Re: ${baseSubject}`;

  const emailFormData = new FormData();
  emailFormData.set("subject", subject);
  emailFormData.set("body", body);

  const result = await sendManualEmailToCustomer(jobberClientId, emailFormData);

  if (result.error) {
    return result;
  }

  revalidatePath(`/messages/${jobberClientId}`);
  revalidatePath("/messages");

  return { error: null };
}

// Text counterpart to replyToCustomerByEmail above -- no subject/"Re:"
// concept for a text, so this is a much thinner wrapper around
// sendManualSmsToCustomer (lib/composeSmsAction.ts). Lets the Messages
// thread's reply box send either channel from the same place, matching
// how outbound texts already show up alongside outbound emails in that
// same thread.
export async function replyToCustomerBySms(
  jobberClientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const result = await sendManualSmsToCustomer(jobberClientId, formData);

  if (result.error) {
    return result;
  }

  revalidatePath(`/messages/${jobberClientId}`);
  revalidatePath("/messages");

  return { error: null };
}

export async function updateServiceRequestStatus(
  requestId: string,
  jobberClientId: string,
  formData: FormData
): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Sign-in required.");
  }

  const rawStatus = formData.get("status");
  const status = typeof rawStatus === "string" ? rawStatus : "";
  const allowedStatuses = ["new", "in_progress", "resolved"];

  if (!allowedStatuses.includes(status)) {
    return;
  }

  const { error } = await supabaseServer
    .from("portal_service_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Unable to update request status: ${error.message}`);
  }

  revalidatePath(`/messages/${jobberClientId}`);
  revalidatePath("/messages");
}
