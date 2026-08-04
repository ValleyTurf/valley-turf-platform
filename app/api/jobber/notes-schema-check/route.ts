// One-off introspection route: can we pull historical visit notes and
// photos that were entered directly in Jobber (before this CRM's own
// visit_notes table existed) so they show up on the Customer page's
// Past Visits alongside notes/photos added going forward? Same
// throwaway pattern as schema-check.ts / invoice-schema-check.ts —
// delete once the real field names are confirmed and the real sync is
// built.
//
// Probes several candidate type names at once (GraphQL's
// __type(name:) just returns null for anything that doesn't exist, so
// this is safe to fire in one shot rather than iterating round by
// round like the invoice mutation discovery did): a dedicated `Note`
// type, an `Attachment`/`File` type for photos, and `notes`-shaped
// fields on `Visit`, `Job`, `Client`, and `Property` — Jobber's notes
// feature is usually attachable to more than one entity, so it's not
// obvious up front which of these actually carries technician visit
// notes/photos.
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
    }
  }
`;

const FIELD_FRAGMENT = `
  name
  type {
    ${TYPE_FRAGMENT}
  }
`;

const INTROSPECTION_QUERY = `
  query NotesSchemaCheck {
    visitType: __type(name: "Visit") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    jobType: __type(name: "Job") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    clientType: __type(name: "Client") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    propertyType: __type(name: "Property") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    noteType: __type(name: "Note") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    noteConnectionType: __type(name: "NoteConnection") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    attachmentType: __type(name: "Attachment") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    fileType: __type(name: "File") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    photoType: __type(name: "Photo") {
      name
      fields {
        ${FIELD_FRAGMENT}
      }
    }
    queryType: __type(name: "Query") {
      name
      fields {
        name
      }
    }
  }
`;

type IntrospectedField = { name: string };
type IntrospectedType = { name: string; fields: IntrospectedField[] | null } | null;

type NotesSchemaCheckResponse = {
  visitType: IntrospectedType;
  jobType: IntrospectedType;
  clientType: IntrospectedType;
  propertyType: IntrospectedType;
  noteType: IntrospectedType;
  noteConnectionType: IntrospectedType;
  attachmentType: IntrospectedType;
  fileType: IntrospectedType;
  photoType: IntrospectedType;
  queryType: IntrospectedType;
};

function fieldsMatching(type: IntrospectedType, keyword: string): string[] {
  return (type?.fields ?? [])
    .map((f) => f.name)
    .filter((name) => name.toLowerCase().includes(keyword))
    .sort();
}

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<NotesSchemaCheckResponse>(
      INTROSPECTION_QUERY
    );

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      // Which candidate types actually exist in this Jobber account's schema.
      typesFound: {
        Visit: Boolean(data?.visitType),
        Job: Boolean(data?.jobType),
        Client: Boolean(data?.clientType),
        Property: Boolean(data?.propertyType),
        Note: Boolean(data?.noteType),
        NoteConnection: Boolean(data?.noteConnectionType),
        Attachment: Boolean(data?.attachmentType),
        File: Boolean(data?.fileType),
        Photo: Boolean(data?.photoType),
      },
      // Fields on each entity type whose name mentions notes/photos/
      // attachments/files/media — the shortlist worth digging into
      // further once we know which of these exist.
      candidateFields: {
        visit: [
          ...fieldsMatching(data?.visitType ?? null, "note"),
          ...fieldsMatching(data?.visitType ?? null, "photo"),
          ...fieldsMatching(data?.visitType ?? null, "attach"),
          ...fieldsMatching(data?.visitType ?? null, "file"),
          ...fieldsMatching(data?.visitType ?? null, "media"),
        ],
        job: [
          ...fieldsMatching(data?.jobType ?? null, "note"),
          ...fieldsMatching(data?.jobType ?? null, "photo"),
          ...fieldsMatching(data?.jobType ?? null, "attach"),
          ...fieldsMatching(data?.jobType ?? null, "file"),
          ...fieldsMatching(data?.jobType ?? null, "media"),
        ],
        client: [
          ...fieldsMatching(data?.clientType ?? null, "note"),
          ...fieldsMatching(data?.clientType ?? null, "photo"),
          ...fieldsMatching(data?.clientType ?? null, "attach"),
        ],
        property: [
          ...fieldsMatching(data?.propertyType ?? null, "note"),
          ...fieldsMatching(data?.propertyType ?? null, "photo"),
          ...fieldsMatching(data?.propertyType ?? null, "attach"),
        ],
        note: (data?.noteType?.fields ?? []).map((f) => f.name).sort(),
        attachment: (data?.attachmentType?.fields ?? []).map((f) => f.name).sort(),
        file: (data?.fileType?.fields ?? []).map((f) => f.name).sort(),
        photo: (data?.photoType?.fields ?? []).map((f) => f.name).sort(),
      },
      // Top-level query fields that look note/photo-related, in case
      // notes are fetched via their own root query rather than nested
      // under Visit/Job/Client.
      topLevelQueryFields: fieldsMatching(data?.queryType ?? null, "note"),
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
