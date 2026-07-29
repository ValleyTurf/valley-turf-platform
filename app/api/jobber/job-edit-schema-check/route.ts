// One-off diagnostic route for roadmap #8 ("manage existing recurring jobs
// from this app"). Same pattern as the job-create/job-recurring schema
// checks that discovered JobCreateAttributes/JobSchedulingAttributes
// earlier — read-only introspection against Jobber's real schema, no data
// changes, deleted once the real mutation names/shapes are confirmed.
//
// Round 1 (done) found the real mutation names: jobEdit(jobId, input:
// JobEditInput!), jobEditLineItems(jobId, input: JobEditLineItemsInput!),
// jobClose(jobId, input: JobCloseInput!), jobReopen(jobId) — note the
// *Input naming here rather than JobCreateAttributes' *Attributes
// convention, so this round introspects the real type names instead of
// guessing.
//
// Round 2 (done) found JobEditInput reuses the exact same
// TimeframeAttributes/JobSchedulingAttributes types JobCreateAttributes
// already uses for scheduling/recurrence — so editing a job's cadence can
// reuse lib/jobberJob.ts's existing RECURRENCE_RULES construction as-is,
// no new mutation shape needed there. It also found jobCloseInput needs a
// required IncompleteVisitDecisionEnum, and jobEditLineItemsInput.lineItems
// is a list whose element type wasn't resolved (query only went deep
// enough to see LIST -> NON_NULL, not the named type inside).
//
// Round 3: resolve that line-item element type name (one more level of
// ofType), the IncompleteVisitDecisionEnum's actual values (needed to call
// jobClose at all, since the field is required), and — since guessing
// costs nothing — speculative inputFields lookups for likely names of the
// line-item edit type, in case the guess lands and saves a round trip.
import "server-only";
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const QUERY = `
  query DiagnoseJobEditRound3 {
    jobEditLineItemsInput: __type(name: "JobEditLineItemsInput") {
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
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    }
    incompleteVisitEnum: __type(name: "IncompleteVisitDecisionEnum") {
      enumValues { name }
    }
    guess1: __type(name: "JobLineItemEditAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    guess2: __type(name: "JobEditLineItemAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    guess3: __type(name: "LineItemEditAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    guess4: __type(name: "JobCreateLineItemAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
  }
`;

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<{
      jobEditLineItemsInput: unknown;
      incompleteVisitEnum: unknown;
      guess1: unknown;
      guess2: unknown;
      guess3: unknown;
      guess4: unknown;
    }>(QUERY);

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 200 });
    }

    return NextResponse.json({ success: true, schema: data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}
