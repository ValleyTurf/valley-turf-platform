// "Charge this existing invoice to the customer's saved card, and send
// them the autopay receipt if it worked." One function for every place
// that charges an invoice some time after it was created -- staff
// pressing Charge Card on File, the daily scheduled-charge cron, and a
// card being saved while an invoice is already open -- so they can't
// drift apart on who gets a receipt. (Invoice creation itself still
// charges inline in app/(platform)/invoices/actions.ts, where the PDF
// is already in hand.)
//
// Never marks the invoice paid -- Stripe's payment_intent.succeeded
// webhook does that, same as every other autopay charge.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getInvoiceLineItems, type Invoice } from "@/lib/invoices";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { sendAutopayReceiptEmail, sendAutopayReceiptSms } from "@/lib/notifications";
import { getNotificationRecipients } from "@/lib/customerContacts";
import {
  attemptAutopayCharge,
  getPaymentMethodByClientId,
  type AttemptAutopayChargeResult,
  type AutopayTrigger,
} from "@/lib/autopay";

export async function chargeInvoiceAndSendReceipt(
  invoice: Invoice,
  trigger: AutopayTrigger
): Promise<AttemptAutopayChargeResult> {
  const chargeResult = await attemptAutopayCharge(invoice, trigger);

  if (!chargeResult.charged || !invoice.jobberClientId) {
    return chargeResult;
  }

  // Best-effort from here down -- the charge already succeeded, and a
  // receipt that fails to send must not be reported as a failed charge.
  try {
    const paymentMethod = await getPaymentMethodByClientId(invoice.jobberClientId);

    const { data: customerRow } = await supabaseServer
      .from("customers")
      .select("email, phone")
      .eq("jobber_client_id", invoice.jobberClientId)
      .maybeSingle();

    const recipients = await getNotificationRecipients(
      invoice.jobberClientId,
      (customerRow?.email as string | null) ?? null,
      (customerRow?.phone as string | null) ?? null
    );

    const lineItems = await getInvoiceLineItems(invoice.id);
    const pdfBuffer =
      recipients.emails.length > 0 ? await generateInvoicePdf(invoice, lineItems) : null;

    if (pdfBuffer) {
      for (const toEmail of recipients.emails) {
        await sendAutopayReceiptEmail({
          toEmail,
          customerName: invoice.customerName,
          invoiceNumber: invoice.invoiceNumber,
          total: invoice.total,
          cardLast4: paymentMethod?.cardLast4 ?? null,
          pdfBuffer,
          jobberClientId: invoice.jobberClientId,
        });
      }
    }

    for (const toPhone of recipients.phones) {
      await sendAutopayReceiptSms(
        toPhone,
        invoice.customerName,
        invoice.invoiceNumber,
        invoice.total,
        paymentMethod?.cardLast4 ?? null,
        invoice.jobberClientId
      );
    }
  } catch (deliveryError) {
    console.error(
      `Autopay charge succeeded but receipt delivery failed for invoice ${invoice.invoiceNumber}:`,
      deliveryError
    );
  }

  return chargeResult;
}
