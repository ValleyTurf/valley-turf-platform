// One-off diagnostic route for roadmap #8 ("manage existing recurring jobs
// from this app"). Same pattern as the job-create/job-recurring schema
// checks that discovered JobCreateAttributes/JobSchedulingAttributes
// earlier — read-only introspection against Jobber's real schema, no data
// changes, deleted once the real mutation names/shapes are confirmed.
//
// Round 1: list every Mutation-type field whose name starts with "job"
// (with its own argument types) — this tells us the REAL mutation names
// for editing a job, closing/archiving it, etc. without guessing, plus
// candidate "*Attributes" input types guessed from the same naming
// convention JobCreateAttributes already established (guessing costs
// nothing — a wrong type name just resolves to null).
import "server-only";
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const QUERY = `
  query DiagnoseJobEditSchema {
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
    jobEditAttrs: __type(name: "JobEditAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    jobUpdateAttrs: __type(name: "JobUpdateAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    jobCloseAttrs: __type(name: "JobCloseAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    jobArchiveAttrs: __type(name: "JobArchiveAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
    }
    jobCancelAttrs: __type(name: "JobCancelAttributes") {
      inputFields { name type { name kind ofType { name kind } } }
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
      jobEditAttrs: unknown;
      jobUpdateAttrs: unknown;
      jobCloseAttrs: unknown;
      jobArchiveAttrs: unknown;
      jobCancelAttrs: unknown;
    }>(QUERY);

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 200 });
    }

    const allJobMutations = (data?.mutationType?.fields ?? []).filter((f) =>
      f.name.toLowerCase().startsWith("job")
    );

    return NextResponse.json({
      success: true,
      jobMutations: allJobMutations,
      candidateAttributeTypes: {
        JobEditAttributes: data?.jobEditAttrs,
        JobUpdateAttributes: data?.jobUpdateAttrs,
        JobCloseAttributes: data?.jobCloseAttrs,
        JobArchiveAttributes: data?.jobArchiveAttrs,
        JobCancelAttributes: data?.jobCancelAttrs,
      },
    });
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
