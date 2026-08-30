"use server";

// Server action backing the Tier 1, Stage 4 test harness at
// /invoice-test. Ties Stages 2-4 together end to end: creates a real
// native invoice row (lib/invoices.ts, Stage 3), a Stripe Checkout
// session for it (lib/stripeCheckout.ts, Stage 2), a PDF
// (lib/invoicePdf.ts, Stage 4), and emails the PDF + Pay Now link
// (lib/notifications.ts's sendInvoiceEmail, Stage 4) -- all before
// Stage 7 cuts the real /invoices flow over to any of this.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { getBaseUrl } from "@/lib/baseUrl";
import { createInvoice } from "@/lib/invoices";
import { createCheckoutSession } from "@/lib/stripeCheckout";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { sendInvoiceEmail } from "@/lib/notifications";
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
  const description = String(formData.get("description") ?? "").trim();
  const amountDollars = Number(formData.get("amount"));

  if (
    !customerName ||
    !customerEmail ||
    !description ||
    !Number.isFinite(amountDollars) ||
    amountDollars <= 0
  ) {
    redirect("/invoice-test?error=invalid");
  }

  const invoiceResult = await createInvoice({
    jobberClientId: null,
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
  const baseUrl = await getBaseUrl();

  const checkoutResult = await createCheckoutSession({
    description,
    amountCents: Math.round(amountDollars * 100),
    successUrl: `${baseUrl}/invoice-test/success`,
    cancelUrl: `${baseUrl}/invoice-test?error=payment_cancelled`,
    customerEmail,
    metadata: { invoice_id: invoice.id },
  });

  if (!checkoutResult.ok) {
    redirect(`/invoice-test?error=${encodeURIComponent(checkoutResult.error)}`);
  }

  // Everything past this point (PDF generation, the Resend call) is new
  // code exercising a library (pdfkit) that's never run against real
  // Vercel infra before this stage -- an unhandled throw here otherwise
  // crashes the Server Action mid-response, which shows up in the
  // browser as a bare "This page couldn't load" rather than a clean
  // error message. Catch broadly and fall back to the same error-banner
  // redirect the rest of this action already uses, so a bug in PDF/email
  // generation degrades instead of taking out the whole request. The
  // invoice and Checkout session already exist at this point regardless.
  let emailSent = false;
  let stageError: string | null = null;

  try {
    // Link the Checkout session back to the invoice row so the webhook
    // processor (Stage 5) can find it. Best-effort -- if this update
    // fails the invoice still exists and the email still goes out, it
    // just won't auto-flip to "paid" later without a manual fix.
    const { error: linkError } = await supabaseServer
      .from("invoices")
      .update({
        stripe_checkout_session_id: checkoutResult.sessionId,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (linkError) {
      console.error("Failed to link Checkout session to invoice:", linkError);
    }

    const pdfBuffer = await generateInvoicePdf(invoice, [
      {
        description,
        quantity: 1,
        unitPrice: amountDollars,
        lineTotal: amountDollars,
      },
    ]);

    emailSent = await sendInvoiceEmail({
      toEmail: customerEmail,
      customerName,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      payNowUrl: checkoutResult.url,
      pdfBuffer,
    });
  } catch (error) {
    console.error(
      `PDF/email generation threw for invoice ${invoice.invoiceNumber}:`,
      error
    );
    stageError =
      error instanceof Error ? error.message : "PDF or email generation failed.";
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "invoice_test",
    entityId: invoice.id,
    entityLabel: invoice.invoiceNumber,
    after: {
      amount: amountDollars,
      customer_email: customerEmail,
      email_sent: emailSent,
    },
  });

  if (stageError) {
    redirect(
      `/invoice-test?error=${encodeURIComponent(
        `Invoice ${invoice.invoiceNumber} was created but PDF/email generation crashed: ${stageError}`
      )}`
    );
  }

  if (!emailSent) {
    redirect(
      `/invoice-test?error=${encodeURIComponent(
        `Invoice ${invoice.invoiceNumber} was created but the email failed to send. Check RESEND_API_KEY / RESEND_FROM_EMAIL.`
      )}`
    );
  }

  redirect(`/invoice-test?sent=${encodeURIComponent(invoice.invoiceNumber)}`);
}
