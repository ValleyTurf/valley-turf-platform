"use server";

// "Call" from My Day: rings the signed-in staff member's own phone from the
// CRM business number, then connects to the customer (who sees the business
// number). The customer's number is looked up fresh from the customer
// record rather than trusted from the browser.
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { startBridgedCall } from "@/lib/outboundCall";
import { toE164 } from "@/lib/outboundCallLogic";

export async function callCustomerViaBusinessLine(
  jobberClientId: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const { data: customer } = await supabaseServer
    .from("customers")
    .select("phone")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  const customerPhone = toE164(customer?.phone as string | null | undefined);

  if (!customerPhone) {
    return { error: "This customer has no usable phone number on file." };
  }

  // The staff member's own cell (Account page). Falls back to the owner's
  // alert number for admins who have not saved one yet.
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

  const result = await startBridgedCall({ staffPhone, customerPhone, jobberClientId });

  return { error: result.ok ? null : result.error };
}
