"use server";

// Shared by every "Compose Email" entry point in the app -- the Customer
// page's Contact History section, the Reactivation Pipeline, and
// Customer Intelligence's reactivation/deactivation candidate lists all
// render the same client component (app/components/ComposeEmailForm.tsx)
// which calls this one action. One action, one lib/notifications.ts send
// function (sendManualEmail), so a staff-typed email always gets sent
// and logged the same way no matter which page it was composed from.
//
// Deliberately looks the customer's email up fresh from the database by
// jobberClientId rather than trusting an email address passed in from
// the client -- every call site already has jobberClientId in hand
// (it's the one thing all three pages key their customer rows by), and
// this way ComposeEmailForm never needs to be handed a possibly-stale
// email prop.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { sendManualEmail } from "@/lib/notifications";

export async function sendManualEmailToCustomer(
  jobberClientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!subject || !body) {
    return { error: "Write a subject and a message before sending." };
  }

  const { data: customer, error: customerError } = await supabaseServer
    .from("customers")
    .select("full_name, first_name, last_name, company_name, email")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (customerError || !customer) {
    return { error: "Couldn't find this customer's record." };
  }

  if (!customer.email) {
    return { error: "This customer has no email address on file." };
  }

  const customerName =
    customer.full_name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.company_name ||
    null;

  const sent = await sendManualEmail({
    toEmail: customer.email,
    customerName,
    subject,
    body,
    jobberClientId,
    createdByUserId: actor.id,
    createdByName: actor.name,
  });

  if (!sent) {
    return {
      error: "The email couldn't be sent. Check the Resend configuration and try again.",
    };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "contact_history_email",
    entityId: jobberClientId,
    entityLabel: subject,
    after: { subject, body },
  });

  // Revalidated unconditionally rather than branching on which page
  // called this -- cheap no-ops for whichever of these the customer
  // isn't currently being viewed from.
  revalidatePath(`/customers/${encodeURIComponent(jobberClientId)}`);
  revalidatePath("/reactivation");
  revalidatePath("/customers/intelligence");

  return { error: null };
}
