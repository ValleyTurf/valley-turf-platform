import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// Round 2. Round 1 (see git history) got JobCreateAttributes' full field
// list: instructions is a plain String (no sub-type needed), lineItems
// is [JobCreateLineItemAttributes!] (fields already known: name,
// description, category, taxable, saveToProductsAndServices, unitPrice,
// quantity, etc.), and — the one this app needs to fix Recurring vs
// One-Time — scheduling is a JobSchedulingAttributes (none of round 1's
// speculative type-name guesses for it were right; this is the real
// name). timeframe (TimeframeAttributes) and arrivalWindow
// (ArrivalWindowAttributes) are separate optional fields alongside it.
//
// This round introspects the real shape of all three, plus a few
// speculative guesses at a nested recurrence sub-type in case
// JobSchedulingAttributes references one (harmless if wrong — __type
// just returns null for a name that doesn't exist), plus the
// ProductsAndServicesCategory enum values for the line-item category
// field discovered in round 1.
//
// Safe to delete once the recurring/pricing/instructions fields are
// confirmed working. Not linked from any UI, makes no data changes.
const SCHEMA_QUERY = `
  query JobSchedulingSchemaCheck {
    jobSchedulingAttributes: __type(name: "JobSchedulingAttributes") {
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

    timeframeAttributes: __type(name: "TimeframeAttributes") {
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

    arrivalWindowAttributes: __type(name: "ArrivalWindowAttributes") {
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

    productsAndServicesCategory: __type(name: "ProductsAndServicesCategory") {
      name
      enumValues {
        name
      }
    }

    recurringScheduleAttributes: __type(name: "RecurringScheduleAttributes") {
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

    recurrenceAttributes: __type(name: "RecurrenceAttributes") {
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

    jobRecurrenceAttributes: __type(name: "JobRecurrenceAttributes") {
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

    recurrenceFrequency: __type(name: "RecurrenceFrequency") {
      name
      enumValues {
        name
      }
    }

    recurringFrequency: __type(name: "RecurringFrequency") {
      name
      enumValues {
        name
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
    console.error("Jobber job-scheduling schema check failed:", error);

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
