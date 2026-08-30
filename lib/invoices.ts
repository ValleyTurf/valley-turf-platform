// Native invoicing (Tier 1, Stage 3) -- create/read helpers for the
// invoices/invoice_line_items tables added in migration 043.
//
// Nothing calls createInvoice() yet -- app/(platform)/invoices/actions.ts
// still calls createJobberInvoice() (lib/jobberInvoice.ts), and Stage 7
// is the actual cutover. This exists so the tables aren't just inert
// schema: Stage 4 (PDF generation + Resend delivery) builds directly on
// top of this.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export type InvoiceLineItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  // Internal cost (materials + labor), not shown to the customer --
  // same passthrough createJobberInvoice() already does from
  // visit_material_cost.
  cost?: number | null;
  // Nullable per the Tier 1 scope doc's visit-linkage decision -- can
  // point at a Jobber-synced visit today, a native visit once Tier 2
  // exists, or nothing at all (a one-off charge).
  jobberVisitId?: string | null;
};

export type CreateInvoiceParams = {
  jobberClientId: string | null;
  customerName: string | null;
  lineItems: InvoiceLineItemInput[];
  dueDate?: string | null; // ISO date, e.g. "2026-09-15"
  message?: string | null;
  createdByUserId: string;
  createdByName: string;
};

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type Invoice = {
  id: string;
  invoiceNumber: string;
  jobberClientId: string | null;
  customerName: string | null;
  status: InvoiceStatus;
  total: number;
  issueDate: string;
  dueDate: string | null;
  message: string | null;
  sentAt: string | null;
  paidAt: string | null;
  stripeCheckoutSessionId: string | null;
  createdAt: string;
};

// Wraps the next_invoice_number() Postgres function (migration 043) --
// atomic under concurrent calls via a row lock on the current year's
// counter row, not something worth reimplementing in application code.
export async function generateInvoiceNumber(): Promise<
  MutationOutcome<string>
> {
  const { data, error } = await supabaseServer.rpc("next_invoice_number");

  if (error) {
    return { ok: false, error: error.message };
  }

  if (typeof data !== "string" || !data) {
    return { ok: false, error: "Could not generate an invoice number." };
  }

  return { ok: true, value: data };
}

function lineTotal(item: InvoiceLineItemInput): number {
  return Math.round(item.quantity * item.unitPrice * 100) / 100;
}

export async function createInvoice(
  params: CreateInvoiceParams
): Promise<MutationOutcome<Invoice>> {
  const {
    jobberClientId,
    customerName,
    lineItems,
    dueDate,
    message,
    createdByUserId,
    createdByName,
  } = params;

  if (lineItems.length === 0) {
    return { ok: false, error: "An invoice needs at least one line item." };
  }

  for (const item of lineItems) {
    if (!item.description.trim()) {
      return { ok: false, error: "Every line item needs a description." };
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { ok: false, error: "Every line item needs a valid quantity." };
    }

    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return { ok: false, error: "Every line item needs a valid price." };
    }
  }

  const numberResult = await generateInvoiceNumber();

  if (!numberResult.ok) {
    return numberResult;
  }

  const total = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);

  const { data: invoiceRow, error: invoiceError } = await supabaseServer
    .from("invoices")
    .insert({
      invoice_number: numberResult.value,
      jobber_client_id: jobberClientId,
      customer_name: customerName,
      status: "draft",
      total,
      due_date: dueDate ?? null,
      message: message ?? null,
      created_by_user_id: createdByUserId,
      created_by_name: createdByName,
    })
    .select(
      "id, invoice_number, jobber_client_id, customer_name, status, total, issue_date, due_date, message, sent_at, paid_at, stripe_checkout_session_id, created_at"
    )
    .single();

  if (invoiceError || !invoiceRow) {
    return {
      ok: false,
      error: invoiceError?.message ?? "Failed to create invoice.",
    };
  }

  const { error: lineItemsError } = await supabaseServer
    .from("invoice_line_items")
    .insert(
      lineItems.map((item) => ({
        invoice_id: invoiceRow.id,
        description: item.description.trim(),
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: lineTotal(item),
        cost: item.cost ?? null,
        jobber_visit_id: item.jobberVisitId ?? null,
      }))
    );

  if (lineItemsError) {
    // Best-effort cleanup -- an invoice with no line items is useless
    // and would otherwise sit there consuming its sequential number for
    // nothing. Not wrapped in a real transaction (the Supabase JS
    // client doesn't support multi-statement transactions), so this is
    // the next best thing.
    await supabaseServer.from("invoices").delete().eq("id", invoiceRow.id);

    return { ok: false, error: lineItemsError.message };
  }

  return {
    ok: true,
    value: {
      id: invoiceRow.id,
      invoiceNumber: invoiceRow.invoice_number,
      jobberClientId: invoiceRow.jobber_client_id,
      customerName: invoiceRow.customer_name,
      status: invoiceRow.status as InvoiceStatus,
      total: Number(invoiceRow.total),
      issueDate: invoiceRow.issue_date,
      dueDate: invoiceRow.due_date,
      message: invoiceRow.message,
      sentAt: invoiceRow.sent_at,
      paidAt: invoiceRow.paid_at,
      stripeCheckoutSessionId: invoiceRow.stripe_checkout_session_id,
      createdAt: invoiceRow.created_at,
    },
  };
}
