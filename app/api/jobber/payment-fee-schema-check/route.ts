// One-off introspection route: does Jobber's payment record schema
// expose a processing-fee field anywhere? sync-payments/route.ts
// already pulls amount/entryDate/adjustmentType/paymentMethod/
// transactionStatus/tipAmount off "PaymentRecord" (inferred type name
// from the "jobberPayment*"-prefixed field names in that query), but
// never went looking for a fee field since nothing needed it until now.
// Deleted once the real feature (surfacing tips/fees on Revenue) is
// confirmed working.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const INTROSPECTION_QUERY = `
  query PaymentFeeSchemaCheck {
    paymentRecord: __type(name: "PaymentRecord") {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
    invoicePayment: __type(name: "InvoicePayment") {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
    deposit: __type(name: "Deposit") {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL(INTROSPECTION_QUERY);

  return NextResponse.json({ data, errors });
}
