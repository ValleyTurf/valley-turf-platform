// The "send this already-existing native invoice to its customer"
// pipeline: PDF + email to every notification email on file, text with
// the Pay Now link to every notification phone, each carrying the
// autopay-enrollment link. Pulled out of app/(platform)/invoices/
// actions.ts's resendInvoice (2026-11-15) so the daily overdue cron
// (lib/invoiceReminders.ts) can send the real invoice again on its
// 1/3/7/14-days-overdue marks through the exact same code the Resend
// button uses, rather than a second copy of it drifting apart.
//
// Deliberately does NOT touch invoice status, audit logging, or
// revalidation -- those differ per caller (a person clicking Resend vs.
// a cron job) and stay with the caller.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getInvoiceLineItems, type Invoice } from "@/lib/invoices";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { sendInvoiceEmail, sendInvoiceSms } from "@/lib/notifications";
import { getOrCreateEnrollmentToken } from "@/lib/autopay";
import { getNotificationRecipients } from "@/lib/customerContacts";

export type SendInvoiceCopyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendInvoiceCopy(
  invoice: Invoice,
  baseUrl: string
): Promise<SendInvoiceCopyResult> {
  if (!invoice.jobberClientId) {
    return { ok: false, error: "This invoice has no linked customer to resend to." };
  }

  if (!invoice.publicToken) {
    return { ok: false, error: "This invoice has no payment link to send." };
  }

  const lineItems = await getInvoiceLineItems(invoice.id);

  if (lineItems.length === 0) {
    return { ok: false, error: "Couldn't load this invoice's line items." };
  }

  const { data: customerRow, error: customerError } = await supabaseServer
    .from("customers")
    .select("email, phone")
    .eq("jobber_client_id", invoice.jobberClientId)
    .maybeSingle();

  if (customerError) {
    return {
      ok: false,
      error: `Could not look up customer contact info: ${customerError.message}`,
    };
  }

  const recipients = await getNotificationRecipients(
    invoice.jobberClientId,
    (customerRow?.email as string | null) ?? null,
    (customerRow?.phone as string | null) ?? null
  );

  if (recipients.emails.length === 0 && recipients.phones.length === 0) {
    return {
      ok: false,
      error:
        "This customer has no email or phone on file. Add contact info on their Customer page first.",
    };
  }

  const payUrl = `${baseUrl}/pay/${invoice.publicToken}`;
  const logoUrl = `${baseUrl}/branding/logo.png`;
  const rateUrl = `${baseUrl}/rate/${invoice.publicToken}`;

  // Same autopay-enrollment CTA as the original send (see
  // createNativeInvoiceForVisit). Best-effort: a failure here shouldn't
  // block sending the invoice.
  const enrollment = await getOrCreateEnrollmentToken(invoice.jobberClientId);
  const autopayUrl = enrollment.ok ? `${baseUrl}/autopay/${enrollment.token}` : null;

  let delivered = false;

  try {
    const pdfBuffer =
      recipients.emails.length > 0 ? await generateInvoicePdf(invoice, lineItems) : null;

    if (pdfBuffer) {
      for (const toEmail of recipients.emails) {
        delivered =
          (await sendInvoiceEmail({
            toEmail,
            customerName: invoice.customerName,
            invoiceNumber: invoice.invoiceNumber,
            total: invoice.total,
            payNowUrl: payUrl,
            pdfBuffer,
            jobberClientId: invoice.jobberClientId,
            logoUrl,
            rateUrl,
            autopayUrl,
          })) || delivered;
      }
    }

    for (const toPhone of recipients.phones) {
      delivered =
        (await sendInvoiceSms(
          toPhone,
          invoice.customerName,
          invoice.invoiceNumber,
          payUrl,
          invoice.jobberClientId,
          autopayUrl
        )) || delivered;
    }
  } catch (deliveryError) {
    console.error(`Sending invoice ${invoice.invoiceNumber} failed:`, deliveryError);
    return { ok: false, error: "Something went wrong generating or sending the invoice." };
  }

  if (!delivered) {
    return { ok: false, error: "Couldn't deliver the invoice on any channel. Check the logs." };
  }

  return { ok: true };
}
