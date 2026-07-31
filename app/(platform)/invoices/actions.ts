"use server";

// Typed-args / {error, ...}-return Server Action, not a plain
// <form action> — same reasoning as my-day/actions.ts's
// startVisitTimer/stopVisitTimer: InvoiceCard.tsx is a client component
// that needs inline error/success feedback without a full page
// navigation, called via useTransition.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { createJobberInvoice } from "@/lib/jobberInvoice";

export async function createInvoice(params: {
  visitId: string;
  clientId: string;
  customerName: string | null;
  title: string;
  price: number;
  cost: number | null;
  subject: string;
  dueNetDays: number;
  markSent: boolean;
}): Promise<{
  error: string | null;
  invoiceNumber: string | null;
  jobberWebUri: string | null;
}> {
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
