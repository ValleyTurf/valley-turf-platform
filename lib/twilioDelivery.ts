// Delivery status for customer texts. Twilio calls
// /api/webhooks/twilio-status as each message moves through
// queued -> sent -> delivered (or failed / undelivered); this file turns
// those calls into a status on the message's contact_history row, and
// reacts to a failure:
//   * the failure shows on the customer's thread and in the daily digest
//   * an automated text (invoice, reminder, receipt...) gets an email
//     copy instead, once, when the customer has an email on file
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { sendManualEmail } from "@/lib/notifications";
import { isFailedStatus, shouldApplyStatus } from "@/lib/textDeliveryStatus";

// Texts that are only useful right now -- never worth an email copy.
function worthEmailCopy(subject: string | null): boolean {
  return !/on my way/i.test(subject ?? "");
}

type HistoryRow = {
  id: string;
  jobber_client_id: string | null;
  subject: string | null;
  summary: string | null;
  created_by_user_id: string | null;
  delivery_status: string | null;
  delivery_fallback_at: string | null;
};

export async function applyTextStatus(params: {
  sid: string;
  status: string;
  errorCode: string | null;
}): Promise<void> {
  const { data, error } = await supabaseServer
    .from("contact_history")
    .select(
      "id, jobber_client_id, subject, summary, created_by_user_id, delivery_status, delivery_fallback_at"
    )
    .eq("twilio_sid", params.sid)
    .maybeSingle();

  if (error) {
    console.error("applyTextStatus lookup failed:", error.message);
    return;
  }

  // Staff alerts and anything sent before tracking began have no row.
  if (!data) return;

  const row = data as HistoryRow;

  if (!shouldApplyStatus(row.delivery_status, params.status)) return;

  const { error: updateError } = await supabaseServer
    .from("contact_history")
    .update({
      delivery_status: params.status,
      delivery_error_code: params.errorCode,
      delivery_updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("applyTextStatus update failed:", updateError.message);
    return;
  }

  if (isFailedStatus(params.status)) {
    await handleFailedText(row);
  }
}

async function handleFailedText(row: HistoryRow): Promise<void> {
  // Staff-typed texts stay in staff's hands -- they can see the failure
  // on the thread. Only automated sends get an email copy.
  if (
    row.created_by_user_id ||
    row.delivery_fallback_at ||
    !row.jobber_client_id ||
    !row.summary ||
    !worthEmailCopy(row.subject)
  ) {
    return;
  }

  const { data: customer } = await supabaseServer
    .from("customers")
    .select("email, full_name, first_name, notifications_opted_out")
    .eq("jobber_client_id", row.jobber_client_id)
    .maybeSingle();

  const email = (customer?.email as string | null)?.trim();

  if (!customer || !email || customer.notifications_opted_out === true) return;

  // Claim the fallback before sending so a repeat callback can't send a
  // second copy.
  const { data: claimed } = await supabaseServer
    .from("contact_history")
    .update({ delivery_fallback_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("delivery_fallback_at", null)
    .select("id");

  if (!claimed || claimed.length === 0) return;

  const subject = row.subject
    ? `${row.subject} - Valley Turf Revival`
    : "A message from Valley Turf Revival";

  await sendManualEmail({
    toEmail: email,
    customerName:
      (customer.full_name as string | null) ||
      (customer.first_name as string | null) ||
      null,
    subject,
    body: row.summary,
    jobberClientId: row.jobber_client_id,
  });
}
