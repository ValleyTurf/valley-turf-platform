import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// One-time diagnostic route (not linked from any UI) to find the real
// shape of the fields lib/jobberJob.ts's createJobberJob() doesn't send
// yet: scheduling (needed so a job can be created as Recurring instead
// of always landing as One-Time), lineItems (pricing), and whatever
// holds free-text scope-of-work/instructions. The full JobCreateAttributes
// field list tells us the exact referenced type name for each of those —
// no need to guess field names one at a time and burn error-message
// round trips the way the original propertyId/invoicing discovery did.
// Also speculatively checks a few likely type names for the scheduling
// and line-item sub-types directly, since __type just returns null for a
// name that doesn't exist (no error), so several guesses can ride in one
// request.
//
// Safe to delete once the recurring/pricing/instructions fields are
// confirmed working — this makes no data changes, it only reads
// Jobber's own schema.
const SCHEMA_QUERY = `
  query JobRecurringSchemaCheck {
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

    jobCreateScheduleAttributes: __type(name: "JobCreateScheduleAttributes") {
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

    schedulingAttributes: __type(name: "SchedulingAttributes") {
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

    jobScheduleAttributes: __type(name: "JobScheduleAttributes") {
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

    lineItemAttributes: __type(name: "LineItemAttributes") {
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

    jobLineItemCreateAttributes: __type(name: "JobLineItemCreateAttributes") {
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

    jobCreateLineItemAttributes: __type(name: "JobCreateLineItemAttributes") {
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

    recurringJobFrequency: __type(name: "RecurringJobFrequency") {
      name
      enumValues {
        name
      }
    }

    scheduleFrequency: __type(name: "ScheduleFrequency") {
      name
      enumValues {
        name
      }
    }

    jobRecurrenceFrequency: __type(name: "JobRecurrenceFrequency") {
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
    console.error("Jobber job-recurring schema check failed:", error);

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
