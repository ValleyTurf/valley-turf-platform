// One-off introspection route: can we pull historical visit notes and
// photos that were entered directly in Jobber (before this CRM's own
// visit_notes table existed) so they show up on the Customer page's
// Past Visits alongside notes/photos added going forward? Same
// throwaway pattern as schema-check.ts / invoice-schema-check.ts —
// delete once the real field names are confirmed and the real sync is
// built.
//
// Round 1 (probing candidate type names directly by guessed name —
// Note/NoteConnection/Attachment/File/Photo — the same way
// schema-check.ts did for its first pass): none of those guessed names
// exist, but Visit/Job/Client all really do have a `notes` field
// (Job/Client also have `noteAttachments`), so the data is there —
// just under a type name we haven't guessed yet.
//
// Round 2: rather than keep guessing names one at a time, walk the
// whole schema (`__schema.types`) and keep anything whose name
// mentions "note" or "attach", plus resolve exactly what named type
// Visit.notes / Job.notes / Job.noteAttachments / Client.notes /
// Client.noteAttachments actually point to (unwrapping NON_NULL/LIST
// wrappers) so the next round can introspect that type's own fields
// directly instead of guessing further.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// 4 levels of ofType — enough to unwrap something as wrapped as
// `[Note!]!` (NON_NULL -> LIST -> NON_NULL -> Note).
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
        ofType {
          name
          kind
        }
      }
    }
  }
`;

const INTROSPECTION_QUERY = `
  query NotesSchemaCheckRound2 {
    schemaTypes: __schema {
      types {
        name
        kind
      }
    }
    visitType: __type(name: "Visit") {
      fields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    jobType: __type(name: "Job") {
      fields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
    clientType: __type(name: "Client") {
      fields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }
  }
`;

type IntrospectedTypeRef = {
  name: string | null;
  kind: string;
  ofType: IntrospectedTypeRef | null;
};

type IntrospectedField = { name: string; type: IntrospectedTypeRef };
type IntrospectedType = { fields: IntrospectedField[] | null } | null;

type NotesSchemaCheckResponse = {
  schemaTypes: { types: { name: string; kind: string }[] } | null;
  visitType: IntrospectedType;
  jobType: IntrospectedType;
  clientType: IntrospectedType;
};

// Walks past NON_NULL/LIST wrappers to the innermost named type —
// e.g. `[Note!]!` -> "Note".
function resolveNamedType(type: IntrospectedTypeRef | null): string | null {
  let current = type;
  while (current) {
    if (current.name) return current.name;
    current = current.ofType;
  }
  return null;
}

function findField(type: IntrospectedType, fieldName: string): IntrospectedField | null {
  return type?.fields?.find((f) => f.name === fieldName) ?? null;
}

function describeField(type: IntrospectedType, fieldName: string): { field: string; resolvesTo: string | null } {
  const field = findField(type, fieldName);
  return { field: fieldName, resolvesTo: field ? resolveNamedType(field.type) : null };
}

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<NotesSchemaCheckResponse>(
      INTROSPECTION_QUERY
    );

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const allTypeNames = data?.schemaTypes?.types ?? [];
    const noteOrAttachmentTypes = allTypeNames
      .filter(
        (t) =>
          t.kind !== "SCALAR" &&
          (t.name.toLowerCase().includes("note") ||
            t.name.toLowerCase().includes("attach"))
      )
      .map((t) => `${t.name} (${t.kind})`)
      .sort();

    return NextResponse.json({
      success: true,
      // Every schema type whose name mentions "note" or "attach" —
      // the real type name(s) to introspect next, whatever they
      // turned out to be called.
      noteOrAttachmentTypes,
      // What Visit.notes / Job.notes / Job.noteAttachments /
      // Client.notes / Client.noteAttachments actually resolve to.
      fieldResolutions: {
        visitNotes: describeField(data?.visitType ?? null, "notes"),
        jobNotes: describeField(data?.jobType ?? null, "notes"),
        jobNoteAttachments: describeField(data?.jobType ?? null, "noteAttachments"),
        clientNotes: describeField(data?.clientType ?? null, "notes"),
        clientNoteAttachments: describeField(data?.clientType ?? null, "noteAttachments"),
      },
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
