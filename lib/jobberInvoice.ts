// Native invoicing (roadmap #3) — lets staff bill a completed visit
// directly from this app instead of switching to Jobber. Mutation
// name/shape confirmed via three rounds of live introspection (the
// invoice-schema-check diagnostic route, since deleted):
//   - invoiceCreate(input: InvoiceCreateInput!) — clientId, dueDetails,
//     tax, and lineItems are the only required fields. propertyId/jobId
//     are both optional (Jobber resolves them from visitIds when given),
//     so this always passes visitIds: [visitId] instead of looking up
//     the job/property separately.
//   - dueDetails: InvoiceDueDetails { dueDate, invoiceNet } — both
//     individually optional, but the object itself is required. This
//     always sends invoiceNet (days until due, e.g. 0 = due on receipt)
//     rather than a literal dueDate, so callers don't need to do date
//     math themselves.
//   - tax: TaxInputType { taxRateId, taxCalculationMethod! }. This app
//     doesn't model sales tax anywhere else (materials/quotes are all
//     flat-price, no tax fields), so taxRateId is always omitted —
//     taxCalculationMethod is still required even with no rate set, so
//     EXCLUSIVE (price doesn't include tax) is sent as an arbitrary but
//     harmless default.
//   - lineItems: [InvoiceCreationLineItemInput!]! — real type name is
//     InvoiceCreationLineItemInput, NOT InvoiceCreateLineItemAttributes/
//     InvoiceLineItemCreateAttributes (both guessed and confirmed absent
//     via introspection first). Unlike job/quote line items, this type
//     has no saveToProductsAndServices field at all, so there's no
//     catalog-pollution flag to worry about. It also has an optional
//     "cost" field (separate from the customer-facing unitPrice) — this
//     app passes the visit's already-logged direct cost (materials +
//     labor, from visit_material_cost) through to it when available, so
//     Jobber's own cost tracking on the invoice line matches what
//     job-costing analytics already knows.
import "server-only";
import { jobberGraphQL } from "@/lib/jobber";

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const INVOICE_CREATE_MUTATION = `
  mutation CreateInvoice($input: InvoiceCreateInput!) {
    invoiceCreate(input: $input) {
      invoice {
        id
        invoiceNumber
        invoiceStatus
        jobberWebUri
      }
      userErrors {
        message
      }
    }
  }
`;

export async function createJobberInvoice(params: {
  clientId: string;
  visitId: string;
  title: string;
  price: number;
  cost?: number | null;
  subject?: string | null;
  message?: string | null;
  dueNetDays: number;
  markSent: boolean;
}): Promise<
  MutationOutcome<{
    invoiceId: string;
    invoiceNumber: string | null;
    invoiceStatus: string | null;
    jobberWebUri: string | null;
  }>
> {
  const {
    clientId,
    visitId,
    title,
    price,
    cost,
    subject,
    message,
    dueNetDays,
    markSent,
  } = params;

  const lineItem: Record<string, unknown> = {
    name: title,
    quantity: 1,
    unitPrice: price,
    taxable: false,
  };

  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
    lineItem.cost = cost;
  }

  const input: Record<string, unknown> = {
    clientId,
    visitIds: [visitId],
    dueDetails: { invoiceNet: dueNetDays },
    tax: { taxCalculationMethod: "EXCLUSIVE" },
    lineItems: [lineItem],
    markSent,
  };

  if (subject) {
    input.subject = subject;
  }

  if (message) {
    input.message = message;
  }

  const { data, errors } = await jobberGraphQL<{
    invoiceCreate: {
      invoice: {
        id: string;
        invoiceNumber: string | number | null;
        invoiceStatus: string | null;
        jobberWebUri: string | null;
      } | null;
      userErrors: { message: string }[];
    };
  }>(INVOICE_CREATE_MUTATION, { input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.invoiceCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  const invoice = data?.invoiceCreate?.invoice;
  if (!invoice?.id) {
    return { ok: false, error: "Jobber did not return an invoice id." };
  }

  return {
    ok: true,
    value: {
      invoiceId: invoice.id,
      invoiceNumber:
        invoice.invoiceNumber != null ? String(invoice.invoiceNumber) : null,
      invoiceStatus: invoice.invoiceStatus,
      jobberWebUri: invoice.jobberWebUri,
    },
  };
}
