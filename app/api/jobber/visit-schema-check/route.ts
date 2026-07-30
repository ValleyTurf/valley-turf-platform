// One-off diagnostic route for skip/reschedule-a-single-visit + month-view
// drag-and-drop. Same read-only introspection pattern as the earlier
// job-create/job-edit schema checks — deleted once the real mutation
// names/shapes are confirmed.
//
// Round 1 (done) found the real mutation names: visitEditSchedule(id,
// input: VisitEditScheduleInput!) for moving a single visit's date/time,
// and visitDelete(visitIds: [EncodedId!]!) for removing one occurrence
// without touching the job or its recurring plan — exactly "skip".
//
// Round 2: full inputFields for VisitEditScheduleInput, so we know
// exactly what to send (startAt/endAt? a duration? an arrival window?).
import "server-only";
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const QUERY = `
  query DiagnoseVisitEditScheduleInput {
    visitEditScheduleInput: __type(name: "VisitEditScheduleInput") {
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
  }
`;

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<{
      visitEditScheduleInput: unknown;
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
