"use server";

// Server action backing the /invoice-test test harness. Ties together
// native invoice creation (lib/invoices.ts, Stage 3), the stable
// /pay/[token] link (migration 046, ahead-of-Stage-7 gap fix), PDF
// generation (lib/invoicePdf.ts, Stage 4), and email/SMS delivery
// (lib/notifications.ts, Stage 4 + the SMS/stable-link fix) -- all
// before Stage 7 cuts the real /invoices flow over to any of this.
//
// Unlike the original version of this action, a Stripe Checkout Session
// is NOT created here anymore -- that happens lazily in
// app/pay/[token]/actions.ts when the customer actually clicks Pay Now.
// Embedding a session URL directly in an email/text meant it could go
// stale (Checkout sessions expire ~24h after creation) before anyone
// opened the message; the stable link fixes that for both channels.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { getBaseUrl } from "@/lib/baseUrl";
import { createInvoice } from "@/lib/invoices";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import {
  sendInvoiceEmail,
  sendInvoiceSms,
  sendAutopayReceiptEmail,
  sendAutopayReceiptSms,
} from "@/lib/notifications";
import { attemptAutopayCharge, getPaymentMethodByClientId } from "@/lib/autopay";
import { supabaseServer } from "@/lib/supabase-server";

export async function createTestInvoiceAndSend(
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    redirect("/login");
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountDollars = Number(formData.get("amount"));
  // Optional, testing-only field -- lets this harness exercise the
  // autopay charge attempt (lib/autopay.ts) before Stage 7 wires it into
  // the real /invoices flow, which is the only other place a native
  // invoice ever gets a jobberClientId today. Leave blank to test the
  // normal email/SMS Pay Now path unchanged.
  const jobberClientId =
    String(formData.get("jobberClientId") ?? "").trim() || null;

  if (
    !customerName ||
    !description ||
    !Number.isFinite(amountDollars) ||
    amountDollars <= 0
  ) {
    redirect("/invoice-test?error=invalid");
  }

  // Phone-only customers are exactly the case this harness exists to
  // test -- email is no longer required, but at least one delivery
  // channel has to exist or the invoice would be created and then just
  // sit there with no way for the customer to ever see it.
  if (!customerEmail && !customerPhone) {
    redirect("/invoice-test?error=Enter+an+email+or+a+phone+number.");
  }

  const invoiceResult = await createInvoice({
    jobberClientId,
    customerName,
    lineItems: [
      {
        description,
        quantity: 1,
        unitPrice: amountDollars,
      },
    ],
    createdByUserId: actor.id,
    createdByName: actor.name,
  });

  if (!invoiceResult.ok) {
    redirect(`/invoice-test?error=${encodeURIComponent(invoiceResult.error)}`);
  }

  const invoice = invoiceResult.value;

  if (!invoice.publicToken) {
    // Shouldn't happen -- createInvoice() always generates one -- but a
    // link-less invoice is useless, so treat it as a hard failure rather
    // than silently sending a broken/missing link.
    redirect(
      `/invoice-test?error=${encodeURIComponent(
        `Invoice ${invoice.invoiceNumber} was created but has no public link. Contact support.`
      )}`
    );
  }

  const baseUrl = await getBaseUrl();
  const payUrl = `${baseUrl}/pay/${invoice.publicToken}`;

  // Autopay attempt happens before any email/SMS -- if this invoice's
  // customer has autopay enabled (lib/autopay.ts), try to charge their
  // saved card off-session first. Only falls through to the normal
  // email/SMS Pay Now flow below if the customer isn't enrolled, has no
  // card on file, or the charge itself fails (declined, requires 3D
  // Secure authentication, etc.) -- attemptAutopayCharge() reports all of
  // those the same way (`charged: false`) rather than throwing, since
  // none of them are application errors.
  let autopayCharged = false;

  if (jobberClientId) {
    const autopayResult = await attemptAutopayCharge(invoice);
    autopayCharged = autopayResult.charged;

    if (!autopayResult.charged) {
      console.log(
        `Autopay not applied for invoice ${invoice.invoiceNumber}: ${autopayResult.reason}`
      );
    }
  }

  // Same reasoning as the previous version of this action: PDF/email/SMS
  // generation exercises libraries (pdfkit, Resend, Twilio) that can
  // fail in ways this sandbox can't fully predict -- catch broadly so a
  // failure here degrades to an error banner instead of crashing the
  // whole Server Action ("This page couldn't load").
  let emailSent: boolean | null = null;
  let smsSent: boolean | null = null;
  let stageError: string | null = null;

  try {
    const pdfBuffer = customerEmail
      ? await generateInvoicePdf(invoice, [
          {
            description,
            quantity: 1,
            unitPrice: amountDollars,
            lineTotal: amountDollars,
          },
        ])
      : null;

    if (autopayCharged) {
      // Receipt, not a request for payment -- the card's already been
      // charged (or is about to be marked paid once
      // payment_intent.succeeded arrives via the webhook). cardLast4 is
      // just for a friendlier message; missing it isn't worth failing
      // over.
      const paymentMethod = await getPaymentMethodByClientId(jobberClientId!);

      if (customerEmail && pdfBuffer) {
        emailSent = await sendAutopayReceiptEmail({
          toEmail: customerEmail,
          customerName,
          invoiceNumber: invoice.invoiceNumber,
          total: invoice.total,
          cardLast4: paymentMethod?.cardLast4 ?? null,
          pdfBuffer,
        });
      }

      if (customerPhone) {
        smsSent = await sendAutopayReceiptSms(
          customerPhone,
          customerName,
          invoice.invoiceNumber,
          invoice.total,
          paymentMethod?.cardLast4 ?? null
        );
      }
    } else {
      if (customerEmail && pdfBuffer) {
        emailSent = await sendInvoiceEmail({
          toEmail: customerEmail,
          customerName,
          invoiceNumber: invoice.invoiceNumber,
          total: invoice.total,
          payNowUrl: payUrl,
          pdfBuffer,
        });
      }

      if (customerPhone) {
        smsSent = await sendInvoiceSms(
          customerPhone,
          customerName,
          invoice.invoiceNumber,
          payUrl
        );
      }
    }
  } catch (error) {
    console.error(
      `PDF/email/SMS generation threw for invoice ${invoice.invoiceNumber}:`,
      error
    );
    stageError =
      error instanceof Error ? error.message : "PDF, email, or SMS generation failed.";
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "invoice_test",
    entityId: invoice.id,
    entityLabel: invoice.invoiceNumber,
    after: {
      amount: amountDollars,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
      jobber_client_id: jobberClientId,
      autopay_charged: autopayCharged,
      email_sent: emailSent,
      sms_sent: smsSent,
    },
  });

  if (stageError) {
    redirect(
      `/invoice-test?error=${encodeURIComponent(
        `Invoice ${invoice.invoiceNumber} was created but delivery crashed: ${stageError}`
      )}`
    );
  }

  // Once autopay has actually charged the card, the invoice is
  // considered handled regardless of whether the receipt email/text also
  // went out -- unlike the Pay Now flow, there's no link the customer
  // still needs in order to pay. A failed receipt just means they'll
  // find out from their bank statement / the portal instead.
  if (!autopayCharged) {
    // Only fail the whole thing if every channel the customer actually
    // provided failed -- if they gave both email and phone and only one
    // went through, that's still a delivered invoice.
    const anyChannelAttempted = emailSent !== null || smsSent !== null;
    const anyChannelSucceeded = emailSent === true || smsSent === true;

    if (anyChannelAttempted && !anyChannelSucceeded) {
      redirect(
        `/invoice-test?error=${encodeURIComponent(
          `Invoice ${invoice.invoiceNumber} was created but delivery failed on every channel provided. Check RESEND_API_KEY/RESEND_FROM_EMAIL and TWILIO_* env vars.`
        )}`
      );
    }

    // The invoice is now considered delivered -- flip it out of draft
    // regardless of exactly which channel(s) succeeded, same as the
    // original version of this action did once its single email send
    // succeeded. Skipped entirely when autopay charged: the invoice
    // stays in whatever status it's in (draft) until the webhook's
    // payment_intent.succeeded handler marks it paid directly -- flipping
    // it to "sent" here first would just be a status this app skipped
    // straight past.
    const { error: sentError } = await supabaseServer
      .from("invoices")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", invoice.id);

    if (sentError) {
      console.error("Failed to mark invoice sent:", sentError);
    }
  }

  redirect(
    autopayCharged
      ? `/invoice-test?charged=${encodeURIComponent(invoice.invoiceNumber)}`
      : `/invoice-test?sent=${encodeURIComponent(invoice.invoiceNumber)}`
  );
}
