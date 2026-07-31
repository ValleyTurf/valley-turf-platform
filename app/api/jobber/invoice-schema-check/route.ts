// One-off introspection route for roadmap #3, "native invoicing" — same
// throwaway pattern used for the job-edit and visit mutation discovery
// rounds earlier (deleted once the real feature is confirmed working).
// Round 1: get the full Mutation field list (so we don't have to guess
// invoice mutation names one at a time) plus the Invoice object's own
// fields and a couple of likely input-type names.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const INTROSPECTION_QUERY = `
  query InvoiceSchemaCheck {
    mutationType: __type(name: "Mutation") {
      fields {
        name
      }
    }
    invoiceType: __type(name: "Invoice") {
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
    invoiceCreateAttributes: __type(name: "InvoiceCreateAttributes") {
      name
      inputFields {
        name
        type {
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
      }
    }
    invoiceCreateInput: __type(name: "InvoiceCreateInput") {
      name
      inputFields {
        name
        type {
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
      }
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL(INTROSPECTION_QUERY);

  return NextResponse.json({ data, errors });
}
