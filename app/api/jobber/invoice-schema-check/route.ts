// One-off introspection route for roadmap #3, "native invoicing" — same
// throwaway pattern used for the job-edit and visit mutation discovery
// rounds earlier (deleted once the real feature is confirmed working).
// Round 1 (invoiceCreate exists, takes InvoiceCreateInput, required
// fields are clientId/dueDetails/tax/lineItems) is done. Round 2: the
// exact shapes of dueDetails (InvoiceDueDetails!), tax (TaxInputType!),
// and lineItems (a list of some not-yet-named input object — round 1's
// query wasn't deep enough to resolve its name through the
// NON_NULL(LIST(NON_NULL(?))) wrapper).
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
  query InvoiceSchemaCheckRound2 {
    invoiceCreateInput: __type(name: "InvoiceCreateInput") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    invoiceDueDetails: __type(name: "InvoiceDueDetails") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    taxInputType: __type(name: "TaxInputType") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    discountInput: __type(name: "DiscountInput") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    lineItemGuess1: __type(name: "InvoiceLineItemCreateAttributes") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    lineItemGuess2: __type(name: "InvoiceCreateLineItemAttributes") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    lineItemGuess3: __type(name: "LineItemCreateAttributes") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    lineItemGuess4: __type(name: "InvoiceLineItemAttributes") {
      name
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL(INTROSPECTION_QUERY);

  return NextResponse.json({ data, errors });
}
