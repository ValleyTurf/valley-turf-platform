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
// Round 2: full inputFields for JobEditInput, JobEditLineItemsInput, and
// JobCloseInput, one level deep on any nested object/enum types so we can
// tell whether e.g. scheduling/recurrence is editable directly on
// JobEditInput or lives on a nested input object that needs its own
// follow-up query.
import "server-only";
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const TYPE_FIELDS = `
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
`;

const QUERY = `
  query DiagnoseJobEditInputs {
    jobEditInput: __type(name: "JobEditInput") {
      inputFields {
        name
        type { ${TYPE_FIELDS} }
      }
    }
    jobEditLineItemsInput: __type(name: "JobEditLineItemsInput") {
      inputFields {
        name
        type { ${TYPE_FIELDS} }
      }
    }
    jobCloseInput: __type(name: "JobCloseInput") {
      inputFields {
        name
        type { ${TYPE_FIELDS} }
      }
    }
    jobReopenPayload: __type(name: "JobReopenPayload") {
      fields {
        name
        type { ${TYPE_FIELDS} }
      }
    }
  }
`;

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<{
      jobEditInput: unknown;
      jobEditLineItemsInput: unknown;
      jobCloseInput: unknown;
      jobReopenPayload: unknown;
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
