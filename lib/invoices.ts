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
  // Free-text sub-list shown under the description on the PDF -- e.g.
  // Jobber's "Quarterly Cleaning 1000-1250" line item carries a
  // description listing the included services (Turf Fluff Up, Debris
  // Removal, ...). Migration 058.
  details?: string | null;
};

export type CreateInvoiceParams = {
  jobberClientId: string | null;
  customerName: string | null;
  lineItems: InvoiceLineItemInput[];
  dueDate?: string | null; // ISO date, e.g. "2026-09-15"
  message?: string | null;
  createdByUserId: string;
  createdByName: string;
  // Snapshotted display address ("123 Main St\nPhoenix, AZ 85212") --
  // see migration 059. Resolved by the caller (actions.ts) from
  // customers.address_line_1/city/state/postal_code so this file
  // doesn't need to know that table's column layout.
  serviceAddress?: string | null;
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
  // Stable, unguessable link token (migration 046) -- the public
  // /pay/[publicToken] page is what actually gets emailed/texted to
  // customers, not a raw (expiring) Stripe Checkout Session URL. Same
  // pattern as quotes.public_token.
  publicToken: string | null;
  createdAt: string;
  serviceAddress: string | null;
};

// Compact, URL-safe token -- identical approach to
// lib/quotes.ts's generatePublicToken(), duplicated locally rather than
// imported so lib/invoices.ts doesn't take on a cross-feature dependency
// for one line of logic.
function generatePublicToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

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

const INVOICE_SELECT_COLUMNS =
  "id, invoice_number, jobber_client_id, customer_name, status, total, issue_date, due_date, message, sent_at, paid_at, stripe_checkout_session_id, public_token, created_at, service_address";

function mapInvoiceRow(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    invoiceNumber: row.invoice_number as string,
    jobberClientId: row.jobber_client_id as string | null,
    customerName: row.customer_name as string | null,
    status: row.status as InvoiceStatus,
    total: Number(row.total),
    issueDate: row.issue_date as string,
    dueDate: row.due_date as string | null,
    message: row.message as string | null,
    sentAt: row.sent_at as string | null,
    paidAt: row.paid_at as string | null,
    stripeCheckoutSessionId: row.stripe_checkout_session_id as string | null,
    publicToken: row.public_token as string | null,
    createdAt: row.created_at as string,
    serviceAddress: row.service_address as string | null,
  };
}

// Used by the "resend" action (app/(platform)/invoices/actions.ts's
// resendInvoice, surfaced from the Customer page) -- re-sending needs
// the exact same Invoice/line-item shapes createInvoice() already
// produces at creation time, so generateInvoicePdf()/sendInvoiceEmail()
// can be called again unchanged.
export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const { data, error } = await supabaseServer
    .from("invoices")
    .select(INVOICE_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return mapInvoiceRow(data);
}

export type InvoiceLineItemRow = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  details: string | null;
};

export async function getInvoiceLineItems(
  invoiceId: string
): Promise<InvoiceLineItemRow[]> {
  const { data, error } = await supabaseServer
    .from("invoice_line_items")
    .select("description, quantity, unit_price, line_total, details")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    description: row.description as string,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    details: row.details as string | null,
  }));
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
    serviceAddress,
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
      public_token: generatePublicToken(),
      service_address: serviceAddress?.trim() || null,
    })
    .select(
      "id, invoice_number, jobber_client_id, customer_name, status, total, issue_date, due_date, message, sent_at, paid_at, stripe_checkout_session_id, public_token, created_at, service_address"
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
        details: item.details?.trim() || null,
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
      publicToken: invoiceRow.public_token,
      createdAt: invoiceRow.created_at,
      serviceAddress: invoiceRow.service_address,
    },
  };
}
