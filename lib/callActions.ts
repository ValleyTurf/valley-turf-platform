"use server";

// "Call" from My Day: rings the signed-in staff member's own phone from the
// CRM business number, then connects to the customer (who sees the business
// number). The customer's number is looked up fresh from the customer
// record rather than trusted from the browser.
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { startBridgedCall } from "@/lib/outboundCall";
import { toE164 } from "@/lib/outboundCallLogic";
import { findJobberClientIdByPhone } from "@/lib/customerContacts";

export async function callCustomerViaBusinessLine(
  jobberClientId: string,
  contactId?: string | null
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  // An additional contact's number is looked up from that contact's own
  // row, and only if it belongs to this customer.
  const { data: customer } = contactId
    ? await supabaseServer
        .from("customer_contacts")
        .select("phone")
        .eq("id", contactId)
        .eq("jobber_client_id", jobberClientId)
        .maybeSingle()
    : await supabaseServer
        .from("customers")
        .select("phone")
        .eq("jobber_client_id", jobberClientId)
        .maybeSingle();

  const customerPhone = toE164(customer?.phone as string | null | undefined);

  if (!customerPhone) {
    return { error: "This customer has no usable phone number on file." };
  }

  const staff = await resolveStaffPhone(actor);

  if ("error" in staff) {
    return { error: staff.error };
  }

  const result = await startBridgedCall({ staffPhone: staff.phone, customerPhone, jobberClientId });

  return { error: result.ok ? null : result.error };
}

// Dial pad / call-back: calls any number, saved customer or not. If the
// number matches a customer the call is logged on their history.
export async function callNumberViaBusinessLine(
  rawNumber: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const customerPhone = toE164(rawNumber);

  if (!customerPhone) {
    return { error: "Enter a full 10-digit phone number." };
  }

  const staff = await resolveStaffPhone(actor);

  if ("error" in staff) {
    return { error: staff.error };
  }

  const jobberClientId = await findJobberClientIdByPhone(customerPhone).catch(() => null);
  const result = await startBridgedCall({ staffPhone: staff.phone, customerPhone, jobberClientId });

  return { error: result.ok ? null : result.error };
}

// The staff member's own cell (Account page). Falls back to the owner's
// alert number for admins who have not saved one yet.
async function resolveStaffPhone(actor: {
  id: string;
  role: string;
}): Promise<{ phone: string } | { error: string }> {
  const { data: userRow, error: userError } = await supabaseServer
    .from("users")
    .select("phone")
    .eq("id", actor.id)
    .maybeSingle();

  let staffPhone = userError ? null : toE164(userRow?.phone as string | null | undefined);

  if (!staffPhone && actor.role === "admin") {
    staffPhone = toE164(process.env.ALERT_PHONE || "+14803314596");
  }

  if (!staffPhone) {
    return { error: "Add your cell number on the Account page first, so the CRM knows which phone to ring." };
  }

  return { phone: staffPhone };
}
