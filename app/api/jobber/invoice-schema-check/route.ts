// One-off introspection route for roadmap #3, "native invoicing" — same
// throwaway pattern used for the job-edit and visit mutation discovery
// rounds earlier (deleted once the real feature is confirmed working).
// Round 1 (invoiceCreate exists, takes InvoiceCreateInput, required
// fields are clientId/dueDetails/tax/lineItems) is done. Round 2 found
// dueDetails=InvoiceDueDetails{dueDate,invoiceNet}, tax=TaxInputType{
// taxRateId, taxCalculationMethod!: TaxCalculationMethodType!}, and the
// real line-item type name: InvoiceCreationLineItemInput. Round 3:
// that line item type's fields, plus the TaxCalculationMethodType enum
// values (need to know what to pass when an invoice has no tax rate).
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const TYPE_FRAGMENT = `
  name
  kind
  ofType {
    name
    kind
    ofType {
      name
      kind
      ofType {
        name
        kind
      }
    }
  }
`;

const INTROSPECTION_QUERY = `
  query InvoiceSchemaCheckRound3 {
    lineItemInput: __type(name: "InvoiceCreationLineItemInput") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    taxCalcMethodEnum: __type(name: "TaxCalculationMethodType") {
      name
      enumValues {
        name
      }
    }
    invoiceStatusEnum: __type(name: "InvoiceStatusTypeEnum") {
      name
      enumValues {
        name
      }
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL(INTROSPECTION_QUERY);

  return NextResponse.json({ data, errors });
}
