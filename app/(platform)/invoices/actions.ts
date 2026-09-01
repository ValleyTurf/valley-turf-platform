"use server";

// Typed-args / {error, ...}-return Server Action, not a plain
// <form action> — same reasoning as my-day/actions.ts's
// startVisitTimer/stopVisitTimer: InvoiceCard.tsx is a client component
// that needs inline error/success feedback without a full page
// navigation, called via useTransition.
//
// Stage 7 cutover: branches on customers.native_invoicing_enabled
// (migration 048, bucketed by /api/jobber/backfill-invoicing-mode,
// reviewed/overridden by Ryan on /invoices/routing). Customers marked
// false keep the exact original path -- createJobberInvoice(), nothing
// about that branch changed. Customers marked true get a native invoice
// (lib/invoices.ts, the same tables Stage 3-6 already built and proved
// out via /invoice-test), mirrored into jobber_invoices/jobber_payments
// (lib/payments.ts) so Revenue/Transactions/Job Costing Analytics/
// Dashboard/Reactivation keep working unchanged, with an autopay charge
// attempt + PDF/email/SMS delivery on send, matching /invoice-test's
// proven flow exactly.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { createJobberInvoice } from "@/lib/jobberInvoice";
import { createInvoice as createNativeInvoice } from "@/lib/invoices";
import { mirrorNativeInvoiceInJobberTables } from "@/lib/payments";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import {
  sendInvoiceEmail,
  sendInvoiceSms,
  sendAutopayReceiptEmail,
  sendAutopayReceiptSms,
} from "@/lib/notifications";
import { attemptAutopayCharge, getPaymentMethodByClientId } from "@/lib/autopay";
import { getBaseUrl } from "@/lib/baseUrl";

type CreateInvoiceParams = {
  visitId: string;
  clientId: string;
  customerName: string | null;
  title: string;
  price: number;
  cost: number | null;
  subject: string;
  dueNetDays: number;
  markSent: boolean;
};

type CreateInvoiceResult = {
  error: string | null;
  invoiceNumber: string | null;
  jobberWebUri: string | null;
  // Native-only extras -- InvoiceCard.tsx treats these as optional so
  // the Jobber-path result shape (above) doesn't need to change at all.
  autopayCharged?: boolean;
  delivered?: boolean;
};

async function createNativeInvoiceForVisit(
  params: CreateInvoiceParams,
  actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
): Promise<CreateInvoiceResult> {
  const { visitId, clientId, customerName, title, price, cost, subject, dueNetDays, markSent } =
    params;

  const { data: customerRow, error: customerError } = await supabaseServer
    .from("customers")
    .select("email, phone")
    .eq("jobber_client_id", clientId)
    .maybeSingle();

  if (customerError) {
    return {
      error: `Could not look up customer contact info: ${customerError.message}`,
      invoiceNumber: null,
      jobberWebUri: null,
    };
  }

  const customerEmail = (customerRow?.email as string | null) ?? null;
  const customerPhone = (customerRow?.phone as string | null) ?? null;

  if (markSent && !customerEmail && !customerPhone) {
    return {
      error:
        "This customer has no email or phone on file, so a native invoice can't be delivered. Add contact info on their Customer page first, or save as a draft.",
      invoiceNumber: null,
      jobberWebUri: null,
    };
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueNetDays);
  const dueDateIso = dueDate.toISOString().slice(0, 10);

  const invoiceResult = await createNativeInvoice({
    jobberClientId: clientId,
    customerName,
    lineItems: [
      {
        description: title,
        quantity: 1,
        unitPrice: price,
        cost: cost ?? undefined,
        jobberVisitId: visitId,
      },
    ],
    dueDate: dueDateIso,
    message: subject || null,
    createdByUserId: actor.id,
    createdByName: actor.name,
  });

  if (!invoiceResult.ok) {
    return { error: invoiceResult.error, invoiceNumber: null, jobberWebUri: null };
  }

  const invoice = invoiceResult.value;

  // Same visit-linkage mechanism the Jobber path uses -- /invoices'
  // "ready to invoice" query is just `.is("jobber_invoice_id", null)`,
  // so writing this synthetic id here is all that's needed for the
  // visit to correctly drop off that list. No query changes required.
  await supabaseServer
    .from("jobber_visits")
    .update({
      jobber_invoice_id: `native-${invoice.id}`,
      updated_at: new Date().toISOString(),
    })
    .eq("jobber_visit_id", visitId);

  // Mirror into jobber_invoices immediately (draft or about-to-be-sent
  // status) so Revenue/Transactions/Job Costing Analytics see it right
  // away, same as the Jobber path's own optimistic local write below.
  await mirrorNativeInvoiceInJobberTables({
    invoiceId: invoice.id,
    jobberClientId: clientId,
    customerName,
    invoiceNumber: invoice.invoiceNumber,
    subject: subject || title,
    status: "draft",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    total: invoice.total,
  });

  let autopayCharged = false;
  // undefined (not false) until a delivery attempt actually happens --
  // a saved draft (markSent=false) was never supposed to be delivered,
  // so it shouldn't render as a delivery failure in the UI.
  let delivered: boolean | undefined = undefined;

  if (markSent) {
    delivered = false;
    // Same order as /invoice-test/actions.ts's proven flow: try autopay
    // first, only fall through to email/SMS delivery if it didn't
    // charge (not enrolled, no card, decline, requires 3DS, etc.).
    const autopayResult = await attemptAutopayCharge(invoice);
    autopayCharged = autopayResult.charged;

    if (!autopayResult.charged) {
      console.log(
        `Autopay not applied for invoice ${invoice.invoiceNumber}: ${autopayResult.reason}`
      );
    }

    try {
      const baseUrl = await getBaseUrl();
      const payUrl = invoice.publicToken ? `${baseUrl}/pay/${invoice.publicToken}` : null;

      const pdfBuffer =
        customerEmail && payUrl
          ? await generateInvoicePdf(invoice, [
              { description: title, quantity: 1, unitPrice: price, lineTotal: price },
            ])
          : null;

      if (autopayCharged) {
        const paymentMethod = await getPaymentMethodByClientId(clientId);

        if (customerEmail && pdfBuffer) {
          delivered =
            (await sendAutopayReceiptEmail({
              toEmail: customerEmail,
              customerName,
              invoiceNumber: invoice.invoiceNumber,
              total: invoice.total,
              cardLast4: paymentMethod?.cardLast4 ?? null,
              pdfBuffer,
            })) || delivered;
        }

        if (customerPhone) {
          delivered =
            (await sendAutopayReceiptSms(
              customerPhone,
              customerName,
              invoice.invoiceNumber,
              invoice.total,
              paymentMethod?.cardLast4 ?? null
            )) || delivered;
        }
      } else if (payUrl) {
        if (customerEmail && pdfBuffer) {
          delivered =
            (await sendInvoiceEmail({
              toEmail: customerEmail,
              customerName,
              invoiceNumber: invoice.invoiceNumber,
              total: invoice.total,
              payNowUrl: payUrl,
              pdfBuffer,
            })) || delivered;
        }

        if (customerPhone) {
          delivered =
            (await sendInvoiceSms(
              customerPhone,
              customerName,
              invoice.invoiceNumber,
              payUrl
            )) || delivered;
        }
      }
    } catch (deliveryError) {
      console.error(
        `PDF/email/SMS generation threw for native invoice ${invoice.invoiceNumber}:`,
        deliveryError
      );
      // Not a hard failure -- the invoice and its mirror already exist,
      // same "degrade to a banner, don't crash the action" reasoning as
      // /invoice-test/actions.ts.
    }

    // Once autopay has charged, the invoice is handled regardless of
    // receipt delivery -- same reasoning as /invoice-test. Otherwise
    // flip both the native invoice and its mirror to "sent" once
    // delivery was attempted, whether or not it actually succeeded on
    // every channel (matches the Jobber path, which marks sent
    // regardless of whether Jobber's own email actually lands).
    if (!autopayCharged) {
      await supabaseServer
        .from("invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", invoice.id);

      await mirrorNativeInvoiceInJobberTables({
        invoiceId: invoice.id,
        jobberClientId: clientId,
        customerName,
        invoiceNumber: invoice.invoiceNumber,
        subject: subject || title,
        status: "sent",
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        total: invoice.total,
      });
    }
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: `${customerName ?? "Customer"} — ${title}`,
    after: {
      price,
      cost,
      due_net_days: dueNetDays,
      mark_sent: markSent,
      invoice_number: invoice.invoiceNumber,
      native: true,
      autopay_charged: autopayCharged,
      delivered,
    },
  });

  revalidatePath("/invoices");
  revalidatePath("/job-costs");
  revalidatePath("/job-costing-analytics");
  revalidatePath("/revenue");

  return {
    error: null,
    invoiceNumber: invoice.invoiceNumber,
    jobberWebUri: null,
    autopayCharged,
    delivered,
  };
}

export async function createInvoice(
  params: CreateInvoiceParams
): Promise<CreateInvoiceResult> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in.", invoiceNumber: null, jobberWebUri: null };
  }

  const {
    visitId,
    clientId,
    customerName,
    title,
    price,
    cost,
    subject,
    dueNetDays,
    markSent,
  } = params;

  if (!visitId || !clientId) {
    return { error: "Missing visit or customer.", invoiceNumber: null, jobberWebUri: null };
  }

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return { error: "Enter a line item description.", invoiceNumber: null, jobberWebUri: null };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Enter a valid price.", invoiceNumber: null, jobberWebUri: null };
  }

  const trimmedSubject = subject.trim();

  // Stage 7 branch point -- everything below this lookup is unchanged
  // from before the cutover for any customer not explicitly marked
  // native on /invoices/routing (default false, the safe/current
  // behavior).
  const { data: routingRow, error: routingError } = await supabaseServer
    .from("customers")
    .select("native_invoicing_enabled")
    .eq("jobber_client_id", clientId)
    .maybeSingle();

  if (routingError) {
    return {
      error: `Could not determine invoicing mode: ${routingError.message}`,
      invoiceNumber: null,
      jobberWebUri: null,
    };
  }

  if (routingRow?.native_invoicing_enabled) {
    return createNativeInvoiceForVisit(
      {
        visitId,
        clientId,
        customerName,
        title: trimmedTitle,
        price,
        cost,
        subject: trimmedSubject,
        dueNetDays,
        markSent,
      },
      actor
    );
  }

  const result = await createJobberInvoice({
    clientId,
    visitId,
    title: trimmedTitle,
    price,
    cost,
    subject: trimmedSubject || null,
    dueNetDays,
    markSent,
  });

  if (!result.ok) {
    return { error: result.error, invoiceNumber: null, jobberWebUri: null };
  }

  // Optimistic local mirror update — same pattern as reschedule/skip/
  // complete visit: Jobber will eventually push this back through a
  // webhook too (see lib/jobberWebhookProcessor.ts's syncSingleInvoice/
  // syncSingleVisit), but that's async and this app's own pages
  // (job-costs, this list) read the local mirror, not live Jobber, so
  // waiting for the webhook would leave a just-invoiced visit showing
  // as "needs invoicing" for an indeterminate amount of time.
  await supabaseServer
    .from("jobber_visits")
    .update({
      jobber_invoice_id: result.value.invoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("jobber_visit_id", visitId);

  // Best-effort local row so Revenue/Job Costing Analytics don't have to
  // wait for the nightly invoice sync either — total here is this app's
  // own entered price, not Jobber's calculated total (tax/discounts
  // aren't modeled), so the real sync will overwrite it with the exact
  // figure once it runs.
  await supabaseServer.from("jobber_invoices").upsert(
    {
      jobber_invoice_id: result.value.invoiceId,
      jobber_client_id: clientId,
      invoice_number: result.value.invoiceNumber,
      customer_name: customerName,
      subject: trimmedSubject || trimmedTitle,
      status: result.value.invoiceStatus,
      total: price,
      // Matches sync-invoices' own convention of always writing 0 here
      // rather than computing a real balance — the nightly invoice sync
      // (or the next webhook) overwrites this with Jobber's actual
      // figure regardless.
      balance: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "jobber_invoice_id" }
  );

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "invoice",
    entityId: result.value.invoiceId,
    entityLabel: `${customerName ?? "Customer"} — ${trimmedTitle}`,
    after: {
      price,
      cost,
      due_net_days: dueNetDays,
      mark_sent: markSent,
      invoice_number: result.value.invoiceNumber,
    },
  });

  revalidatePath("/invoices");
  revalidatePath("/job-costs");
  revalidatePath("/job-costing-analytics");
  revalidatePath("/revenue");

  return {
    error: null,
    invoiceNumber: result.value.invoiceNumber,
    jobberWebUri: result.value.jobberWebUri,
  };
}
