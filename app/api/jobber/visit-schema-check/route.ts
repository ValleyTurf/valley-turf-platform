// One-off diagnostic route for skip/reschedule-a-single-visit + month-view
// drag-and-drop. Same read-only introspection pattern as the earlier
// job-create/job-edit schema checks — deleted once the real mutation
// names/shapes are confirmed.
//
// Round 1: list every Mutation-type field whose name starts with "visit"
// (with argument types), so we know the real mutation names for moving a
// single visit's date/time and, separately, whether "skip" is its own
// primitive or just means deleting one occurrence.
import "server-only";
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const QUERY = `
  query DiagnoseVisitSchema {
    mutationType: __type(name: "Mutation") {
      fields {
        name
        args {
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
  }
`;

type MutationField = {
  name: string;
  args: {
    name: string;
    type: {
      name: string | null;
      kind: string;
      ofType: { name: string | null; kind: string; ofType: { name: string | null; kind: string } | null } | null;
    };
  }[];
};

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<{
      mutationType: { fields: MutationField[] } | null;
    }>(QUERY);

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 200 });
    }

    const visitMutations = (data?.mutationType?.fields ?? []).filter((f) =>
      f.name.toLowerCase().startsWith("visit")
    );

    return NextResponse.json({ success: true, visitMutations });
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
