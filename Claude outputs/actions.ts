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
import {
  createInvoice as createNativeInvoice,
  getInvoiceById,
  getInvoiceLineItems,
} from "@/lib/invoices";
import { mirrorNativeInvoiceInJobberTables } from "@/lib/payments";
import { pushInvoiceToQuickbooks } from "@/lib/quickbooks";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import {
  sendInvoiceEmail,
  sendInvoiceSms,
  sendAutopayReceiptEmail,
  sendAutopayReceiptSms,
} from "@/lib/notifications";
import { attemptAutopayCharge, getPaymentMethodByClientId } from "@/lib/autopay";
import { getBaseUrl } from "@/lib/baseUrl";
import { getNotificationRecipients } from "@/lib/customerContacts";

export type InvoiceLineItemParam = {
  description: string;
  quantity: number;
  unitPrice: number;
  // Free-text sub-list (one included service per line), shown as
  // bullets under the description on the native-invoice PDF -- e.g. a
  // "Quarterly Cleaning 1000-1250" line item's Turf Fluff Up / Debris
  // Removal / ... breakdown. Not sent to Jobber's own invoiceCreate
  // mutation (that line-item type has no description field per
  // lib/jobberInvoice.ts's schema notes), so this only shows up on
  // native invoices, which use this app's own PDF renderer.
  details?: string | null;
};

type CreateInvoiceParams = {
  visitId: string;
  clientId: string;
  customerName: string | null;
  lineItems: InvoiceLineItemParam[];
  cost: number | null;
  subject: string;
  dueNetDays: number;
  markSent: boolean;
};

function lineItemsTotal(lineItems: InvoiceLineItemParam[]): number {
  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
}

// Default line-item summary used anywhere a single short label is
// needed (audit log entity labels, the Jobber-mirror `subject` fallback)
// -- joins descriptions rather than picking just the first, so a
// multi-service invoice still reads clearly in those single-line spots.
function summarizeLineItems(lineItems: InvoiceLineItemParam[]): string {
  return lineItems.map((item) => item.description).join(", ");
}

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
  const { visitId, clientId, customerName, lineItems, cost, subject, dueNetDays, markSent } =
    params;
  const title = summarizeLineItems(lineItems);
  const price = lineItemsTotal(lineItems);

  const { data: customerRow, error: customerError } = await supabaseServer
    .from("customers")
    .select("email, phone, address_line_1, address_line_2, city, state, postal_code")
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

  // Snapshotted onto the invoice (migration 059) so it keeps showing
  // whatever address it was actually billed to, even if the customer's
  // address or current_property_id override (migration 052) changes
  // later. Note this reflects whichever property is currently "current"
  // for the customer -- there's no per-visit property link anywhere in
  // this app (Jobber doesn't expose one, and neither do jobber_visits),
  // so for a customer with more than one property, staff need to make
  // sure the right one is selected on the Customer page before creating
  // this invoice.
  const streetLine = [customerRow?.address_line_1, customerRow?.address_line_2]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
  const cityStateZip = [customerRow?.city, customerRow?.state]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
  const cityStateZipLine = [cityStateZip, customerRow?.postal_code]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
  const serviceAddress =
    [streetLine, cityStateZipLine].filter(Boolean).join("\n") || null;

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
    // Cost (the visit's whole direct-cost figure) is attached to the
    // first line item only -- same "cost is per-visit, not per-service"
    // simplification the Jobber-invoicing path uses.
    lineItems: lineItems.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cost: index === 0 ? cost ?? undefined : undefined,
      jobberVisitId: visitId,
      details: item.details ?? undefined,
    })),
    dueDate: dueDateIso,
    message: subject || null,
    serviceAddress,
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

  // Stage 8: push to QuickBooks right away, same timing as the
  // jobber_invoices mirror above -- best-effort, never blocks invoice
  // creation. Jobber already syncs its own invoices to QuickBooks, so
  // this only needs to cover native invoices (the gap Jobber's sync
  // can't see). Failure just leaves quickbooks_push_error set for
  // later follow-up rather than failing the whole action.
  const qbPushResult = await pushInvoiceToQuickbooks({
    invoiceId: invoice.id,
    jobberClientId: clientId,
    customerName,
    customerEmail,
    customerPhone,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    lineItems: lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  });

  if (qbPushResult.ok) {
    await supabaseServer
      .from("invoices")
      .update({ quickbooks_invoice_id: qbPushResult.quickbooksInvoiceId, quickbooks_push_error: null })
      .eq("id", invoice.id);
  } else {
    console.error(`QuickBooks push failed for invoice ${invoice.invoiceNumber}:`, qbPushResult.error);
    await supabaseServer
      .from("invoices")
      .update({ quickbooks_push_error: qbPushResult.error })
      .eq("id", invoice.id);
  }

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
      const logoUrl = `${baseUrl}/branding/logo.png`;
      // Same public_token as the Pay Now link -- see lib/invoiceRatings.ts
      // and lib/notifications.ts's InvoiceEmail.rateUrl for why the
      // Google review URL itself is no longer read here (it's looked up
      // at click time in /rate/[token] instead, only for a genuine
      // 5-star).
      const rateUrl = invoice.publicToken ? `${baseUrl}/rate/${invoice.publicToken}` : null;

      // Fans out to any additional customer_contacts rows (migration 060)
      // explicitly flagged receives_notifications, alongside the primary
      // email/phone -- always includes the primary even if it's null (the
      // helper just drops empties), so this is a straight swap-in for the
      // old customerEmail/customerPhone singulars below.
      const recipients = await getNotificationRecipients(
        clientId,
        customerEmail,
        customerPhone
      );

      const pdfBuffer =
        recipients.emails.length > 0 && payUrl
          ? await generateInvoicePdf(
              invoice,
              lineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.quantity * item.unitPrice,
                details: item.details,
              }))
            )
          : null;

      if (autopayCharged) {
        const paymentMethod = await getPaymentMethodByClientId(clientId);

        if (pdfBuffer) {
          for (const toEmail of recipients.emails) {
            delivered =
              (await sendAutopayReceiptEmail({
                toEmail,
                customerName,
                invoiceNumber: invoice.invoiceNumber,
                total: invoice.total,
                cardLast4: paymentMethod?.cardLast4 ?? null,
                pdfBuffer,
                jobberClientId: clientId,
              })) || delivered;
          }
        }

        for (const toPhone of recipients.phones) {
          delivered =
            (await sendAutopayReceiptSms(
              toPhone,
              customerName,
              invoice.invoiceNumber,
              invoice.total,
              paymentMethod?.cardLast4 ?? null,
              clientId
            )) || delivered;
        }
      } else if (payUrl) {
        if (pdfBuffer) {
          for (const toEmail of recipients.emails) {
            delivered =
              (await sendInvoiceEmail({
                toEmail,
                customerName,
                invoiceNumber: invoice.invoiceNumber,
                total: invoice.total,
                payNowUrl: payUrl,
                pdfBuffer,
                jobberClientId: clientId,
                logoUrl,
                rateUrl,
              })) || delivered;
          }
        }

        for (const toPhone of recipients.phones) {
          delivered =
            (await sendInvoiceSms(
              toPhone,
              customerName,
              invoice.invoiceNumber,
              payUrl,
              clientId
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
    lineItems,
    cost,
    subject,
    dueNetDays,
    markSent,
  } = params;

  if (!visitId || !clientId) {
    return { error: "Missing visit or customer.", invoiceNumber: null, jobberWebUri: null };
  }

  const trimmedLineItems = lineItems
    .map((item) => ({
      ...item,
      description: item.description.trim(),
      details: item.details?.trim() || null,
    }))
    .filter((item) => item.description);

  if (trimmedLineItems.length === 0) {
    return { error: "Enter at least one line item.", invoiceNumber: null, jobberWebUri: null };
  }

  for (const item of trimmedLineItems) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: "Enter a valid quantity for every line item.", invoiceNumber: null, jobberWebUri: null };
    }

    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      return { error: "Enter a valid price for every line item.", invoiceNumber: null, jobberWebUri: null };
    }
  }

  const price = lineItemsTotal(trimmedLineItems);
  const trimmedTitle = summarizeLineItems(trimmedLineItems);
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
        lineItems: trimmedLineItems,
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
    lineItems: trimmedLineItems,
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

export type ResendInvoiceResult = {
  error: string | null;
  delivered?: boolean;
};

// Re-sends an already-created NATIVE invoice's email/text -- Ryan's
// request, surfaced as a "Resend" button on the Customer page (see
// customers/[id]/actions.ts's resendCustomerInvoice wrapper). Native
// only: a real Jobber invoice is sent through Jobber's own system, which
// already has its own resend built in from within Jobber itself, so
// there's nothing for this app to re-trigger there.
//
// Deliberately does NOT touch status/sent_at or attempt another autopay
// charge -- this is "send the same invoice again," not "process it
// again." A paid or voided invoice has nothing left to resend.
export async function resendInvoice(invoiceId: string): Promise<ResendInvoiceResult> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const invoice = await getInvoiceById(invoiceId);

  if (!invoice) {
    return { error: "Invoice not found." };
  }

  if (invoice.status === "paid") {
    return { error: "This invoice has already been paid -- nothing to resend." };
  }

  if (invoice.status === "void") {
    return { error: "This invoice has been voided -- nothing to resend." };
  }

  if (!invoice.jobberClientId) {
    return { error: "This invoice has no linked customer to resend to." };
  }

  if (!invoice.publicToken) {
    return { error: "This invoice has no payment link to send." };
  }

  const lineItems = await getInvoiceLineItems(invoiceId);

  if (lineItems.length === 0) {
    return { error: "Couldn't load this invoice's line items." };
  }

  const { data: customerRow, error: customerError } = await supabaseServer
    .from("customers")
    .select("email, phone")
    .eq("jobber_client_id", invoice.jobberClientId)
    .maybeSingle();

  if (customerError) {
    return { error: `Could not look up customer contact info: ${customerError.message}` };
  }

  const customerEmail = (customerRow?.email as string | null) ?? null;
  const customerPhone = (customerRow?.phone as string | null) ?? null;

  const recipients = await getNotificationRecipients(
    invoice.jobberClientId,
    customerEmail,
    customerPhone
  );

  if (recipients.emails.length === 0 && recipients.phones.length === 0) {
    return {
      error:
        "This customer has no email or phone on file. Add contact info on their Customer page first.",
    };
  }

  const baseUrl = await getBaseUrl();
  const payUrl = `${baseUrl}/pay/${invoice.publicToken}`;
  const logoUrl = `${baseUrl}/branding/logo.png`;
  const rateUrl = `${baseUrl}/rate/${invoice.publicToken}`;

  let delivered = false;

  try {
    const pdfBuffer =
      recipients.emails.length > 0
        ? await generateInvoicePdf(invoice, lineItems)
        : null;

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
          invoice.jobberClientId
        )) || delivered;
    }
  } catch (deliveryError) {
    console.error(
      `Resend failed for invoice ${invoice.invoiceNumber}:`,
      deliveryError
    );
    return { error: "Something went wrong generating or sending the invoice." };
  }

  if (!delivered) {
    return { error: "Couldn't deliver the invoice on any channel. Check the logs." };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: `${invoice.customerName ?? "Customer"} — Invoice ${invoice.invoiceNumber}`,
    after: { resent: true },
  });

  return { error: null, delivered: true };
}
