import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// One-time diagnostic route (not linked from any UI) to find the exact
// shape of JobCreateAttributes for lib/quoteJobConversion.ts. Round 2:
// the first pass found JobCreateAttributes needs propertyId + invoicing
// (a JobInvoicingAttributes with two required enums, invoicingType:
// BillingStrategy! and invoicingSchedule: BillingFrequencyEnum!) — this
// pass gets the actual valid enum values (rather than guessing strings
// that have to match exactly) and the full ClientCreateInput field list,
// to see whether creating a client can also create its first property in
// the same call (needed for the lead -> new-client path, since a job
// needs a propertyId and a brand-new client has none yet).
//
// Safe to delete once the job-creation mutation is confirmed working —
// this makes no data changes, it only reads Jobber's own schema.
const SCHEMA_QUERY = `
  query JobCreateSchemaCheckRound2 {
    billingStrategy: __type(name: "BillingStrategy") {
      name
      enumValues {
        name
      }
    }

    billingFrequency: __type(name: "BillingFrequencyEnum") {
      name
      enumValues {
        name
      }
    }

    clientCreateInput: __type(name: "ClientCreateInput") {
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

    propertyAttributes: __type(name: "PropertyAttributes") {
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
    console.error("Jobber job-create schema check (round 2) failed:", error);

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
