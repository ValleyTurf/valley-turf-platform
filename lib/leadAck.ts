// Sends the instant "we got your quote request" text and email to a new
// website lead. Marks the lead (leads.ack_sent_at) before sending, so a
// retried request can't double-send. Never throws: a send problem must
// not affect the lead being saved.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getBusiness } from "@/lib/business";
import { sendManualEmail, sendManualSms } from "@/lib/notifications";
import { toE164 } from "@/lib/outboundCallLogic";
import { leadAckEmail, leadAckText } from "@/lib/leadAckLogic";

export async function sendLeadAcknowledgement(
  leadId: string
): Promise<{ text: boolean; email: boolean }> {
  const result = { text: false, email: false };

  try {
    const { data: lead } = await supabaseServer
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, address, city, state, zip, turf_size_range, photo_paths, notes, jobber_client_id, ack_sent_at"
      )
      .eq("id", leadId)
      .maybeSingle();

    if (!lead || lead.ack_sent_at) return result;

    // Claim the send first. Zero rows back means another request already
    // claimed it; an error (migration not run yet) falls through and
    // sends once rather than not at all.
    const { data: claimed, error: claimError } = await supabaseServer
      .from("leads")
      .update({ ack_sent_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("ack_sent_at", null)
      .select("id");

    if (!claimError && (claimed?.length ?? 0) === 0) return result;

    const business = await getBusiness();
    const address =
      [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ") ||
      null;

    const input = {
      firstName: lead.first_name,
      businessName: business.name,
      address,
      turfSizeRange: lead.turf_size_range,
      photoCount: Array.isArray(lead.photo_paths) ? lead.photo_paths.length : 0,
      notes: lead.notes,
    };

    const phone = toE164(lead.phone);
    const customerName =
      [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null;

    const [text, email] = await Promise.allSettled([
      phone
        ? sendManualSms({
            toPhone: phone,
            body: leadAckText(input),
            jobberClientId: lead.jobber_client_id,
            createdByName: "Automatic reply",
          })
        : Promise.resolve(false),
      lead.email
        ? (() => {
            const message = leadAckEmail(input);
            return sendManualEmail({
              toEmail: lead.email,
              customerName,
              subject: message.subject,
              body: message.body,
              jobberClientId: lead.jobber_client_id,
              createdByName: "Automatic reply",
            });
          })()
        : Promise.resolve(false),
    ]);

    result.text = text.status === "fulfilled" && text.value === true;
    result.email = email.status === "fulfilled" && email.value === true;
  } catch (error) {
    console.error("sendLeadAcknowledgement failed:", error);
  }

  return result;
}
