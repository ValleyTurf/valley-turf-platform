import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// One-time diagnostic route (not linked from any UI) to find the exact
// shape of JobCreateAttributes — specifically the required `propertyId`
// and `invoicing` fields that lib/quoteJobConversion.ts's jobCreate call
// is currently missing. Speculatively introspects a few likely names for
// the invoicing sub-type since GraphQL's __type just returns null for a
// name that doesn't exist (no error), so this can check several guesses
// in one round trip instead of one per request. Safe to delete once the
// job-creation mutation is confirmed working — this makes no changes to
// any data, it only reads Jobber's own schema.
const SCHEMA_QUERY = `
  query JobCreateSchemaCheck {
    jobCreateAttributes: __type(name: "JobCreateAttributes") {
      name
      inputFields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }
    }

    invoicingAttributes: __type(name: "InvoicingAttributes") {
      name
      inputFields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }

    jobInvoicingAttributes: __type(name: "JobInvoicingAttributes") {
      name
      inputFields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }

    jobCreateInvoicingAttributes: __type(name: "JobCreateInvoicingAttributes") {
      name
      inputFields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }

    clientType: __type(name: "Client") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }

    propertyType: __type(name: "Property") {
      name
      inputFields {
        name
      }
      fields {
        name
        type {
          kind
          name
        }
      }
    }
  }
`;

export async function GET() {
  try {
    const response = await jobberGraphQL<Record<string, unknown>>(SCHEMA_QUERY);

    if (response.errors?.length) {
      return NextResponse.json(
        { success: false, errors: response.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      schema: response.data,
    });
  } catch (error) {
    console.error("Jobber job-create schema check failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown schema check error.",
      },
      { status: 500 }
    );
  }
}
