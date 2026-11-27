// Handles mail that reached the CRM from Gmail: customer emails forwarded
// by a Gmail filter, and emails Ryan sent from Gmail with the CRM inbox
// address on BCC. Called by the Resend inbound webhook for any email that
// is not a reply to a CRM-sent message. Matches the other party to a
// customer by email address (their main email, or an extra contact
// email); a known customer's mail goes on their Messages thread, anything
// else from a stranger lands in Customer Connections as an unknown sender.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { logContactHistory } from "@/lib/contactHistory";
import { logUnknownContact } from "@/lib/unknownContacts";
import { loadAllCustomerContacts } from "@/lib/leadCustomers";
import { normalizeEmail } from "@/lib/matching";
import {
  classifyForwardedMail,
  extractEmail,
  parseAddressList,
} from "@/lib/gmailForwardLogic";

async function findCustomerIdByEmail(email: string): Promise<string | null> {
  const customers = await loadAllCustomerContacts();
  const direct = customers.find((c) => normalizeEmail(c.email) === email);
  if (direct) return direct.jobber_client_id;

  // Escape LIKE wildcards so an underscore in an address is literal.
  const escaped = email.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data } = await supabaseServer
    .from("customer_contacts")
    .select("jobber_client_id")
    .ilike("email", escaped)
    .not("jobber_client_id", "is", null)
    .limit(1);

  return (data?.[0]?.jobber_client_id as string | undefined) ?? null;
}

export async function handleGmailForwardedMail(params: {
  from: string | undefined;
  to: string[];
  subject: string | null | undefined;
  body: string;
}): Promise<void> {
  const classification = classifyForwardedMail({
    from: params.from,
    to: params.to,
    ownAddresses: parseAddressList(process.env.GMAIL_OWN_ADDRESSES),
  });

  if (classification.kind === "ignore") {
    console.log("Gmail forward ignored:", classification.reason);
    return;
  }

  const subject = params.subject?.trim() || null;
  const summary = params.body.slice(0, 4000);

  const customerId = classification.counterpart
    ? await findCustomerIdByEmail(classification.counterpart)
    : null;

  if (customerId) {
    await logContactHistory({
      jobberClientId: customerId,
      channel: "email",
      direction: classification.direction,
      subject: subject || (classification.direction === "inbound" ? "Email from customer" : "Email sent from Gmail"),
      summary,
    });
    return;
  }

  // Mail Ryan sent to someone who is not a customer is just his own
  // email -- nothing for the CRM to track.
  if (classification.direction === "outbound") {
    return;
  }

  await logUnknownContact({
    channel: "email",
    email: classification.counterpart ?? extractEmail(params.from),
    summary: (subject ? `Subject: ${subject}\n\n${params.body}` : params.body).slice(0, 4000),
  });
}
