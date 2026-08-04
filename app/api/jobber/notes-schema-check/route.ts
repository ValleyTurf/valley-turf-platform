// One-off introspection route: can we pull historical visit notes and
// photos that were entered directly in Jobber (before this CRM's own
// visit_notes table existed) so they show up on the Customer page's
// Past Visits alongside notes/photos added going forward? Same
// throwaway pattern as schema-check.ts / invoice-schema-check.ts —
// delete once the real field names are confirmed and the real sync is
// built.
//
// Round 1: guessed type names (Note/Attachment/File/Photo) don't
// exist, but Visit/Job/Client all really do have a `notes` field
// (Job/Client also have `noteAttachments`).
//
// Round 2: walked `__schema.types` instead of guessing further.
// Visit.notes AND Job.notes both resolve to `JobNoteUnionConnection`
// — i.e. Jobber models these as notes on the JOB, not the visit.
// Job.noteAttachments resolves to `JobNoteFileConnection`.
//
// Round 3: the open questions before writing the real backfill —
// (a) what fields does a `JobNote`/`NoteInterface` actually expose
// (body text, createdAt, author)? (b) same for `JobNoteFile`/
// `NoteFileInterface` (a download URL is the whole point). (c) most
// important: does a job-level note carry ANY reference back to which
// visit it was logged during, or would a backfill have to guess by
// matching timestamps to the nearest visit date? (d) what does
// `Visit.notes` accept as arguments — maybe it already filters
// job-level notes down to the ones relevant to that specific visit,
// which would answer (c) for free.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const TYPE_FRAGMENT = `
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
`;

const FIELD_FRAGMENT = `
  fields {
    name
    type {
      ${TYPE_FRAGMENT}
    }
  }
`;

const INTROSPECTION_QUERY = `
  query NotesSchemaCheckRound3 {
    jobNoteUnion: __type(name: "JobNoteUnion") {
      possibleTypes { name }
    }
    jobNote: __type(name: "JobNote") {
      interfaces { name }
      ${FIELD_FRAGMENT}
    }
    noteInterface: __type(name: "NoteInterface") {
      possibleTypes { name }
      ${FIELD_FRAGMENT}
    }
    jobNoteFile: __type(name: "JobNoteFile") {
      interfaces { name }
      ${FIELD_FRAGMENT}
    }
    noteFileInterface: __type(name: "NoteFileInterface") {
      possibleTypes { name }
      ${FIELD_FRAGMENT}
    }
    noteCreatedByUnion: __type(name: "NoteCreatedByUnion") {
      possibleTypes { name }
    }
    visitType: __type(name: "Visit") {
      fields {
        name
        args {
          name
          type {
            ${TYPE_FRAGMENT}
          }
        }
      }
    }
  }
`;

type PossibleType = { name: string };
type IntrospectedTypeRef = { name: string | null; kind: string; ofType: IntrospectedTypeRef | null };
type IntrospectedField = { name: string; type: IntrospectedTypeRef };
type ArgField = { name: string; args: { name: string; type: IntrospectedTypeRef }[] };

type Round3Response = {
  jobNoteUnion: { possibleTypes: PossibleType[] } | null;
  jobNote: { interfaces: PossibleType[]; fields: IntrospectedField[] } | null;
  noteInterface: { possibleTypes: PossibleType[]; fields: IntrospectedField[] } | null;
  jobNoteFile: { interfaces: PossibleType[]; fields: IntrospectedField[] } | null;
  noteFileInterface: { possibleTypes: PossibleType[]; fields: IntrospectedField[] } | null;
  noteCreatedByUnion: { possibleTypes: PossibleType[] } | null;
  visitType: { fields: ArgField[] } | null;
};

function resolveNamedType(type: IntrospectedTypeRef | null): string {
  let current = type;
  while (current) {
    if (current.name) return current.name;
    current = current.ofType;
  }
  return "?";
}

function summarizeFields(fields: IntrospectedField[] | undefined | null): string[] {
  return (fields ?? [])
    .map((f) => `${f.name}: ${resolveNamedType(f.type)}`)
    .sort();
}

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<Round3Response>(INTROSPECTION_QUERY);

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const visitNotesField = data?.visitType?.fields?.find((f) => f.name === "notes");

    return NextResponse.json({
      success: true,
      jobNoteUnionMembers: (data?.jobNoteUnion?.possibleTypes ?? []).map((t) => t.name),
      jobNote: {
        implements: (data?.jobNote?.interfaces ?? []).map((t) => t.name),
        fields: summarizeFields(data?.jobNote?.fields),
      },
      noteInterface: {
        implementedBy: (data?.noteInterface?.possibleTypes ?? []).map((t) => t.name),
        fields: summarizeFields(data?.noteInterface?.fields),
      },
      jobNoteFile: {
        implements: (data?.jobNoteFile?.interfaces ?? []).map((t) => t.name),
        fields: summarizeFields(data?.jobNoteFile?.fields),
      },
      noteFileInterface: {
        implementedBy: (data?.noteFileInterface?.possibleTypes ?? []).map((t) => t.name),
        fields: summarizeFields(data?.noteFileInterface?.fields),
      },
      noteCreatedByUnionMembers: (data?.noteCreatedByUnion?.possibleTypes ?? []).map((t) => t.name),
      // Does Visit.notes take arguments that would filter job-level
      // notes down to just the ones for that visit?
      visitNotesFieldArgs: (visitNotesField?.args ?? []).map(
        (a) => `${a.name}: ${resolveNamedType(a.type)}`
      ),
    });
  } catch (error) {
    console.error("Jobber notes schema check failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown schema check error.",
      },
      { status: 500 }
    );
  }
}
