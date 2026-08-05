// THROWAWAY diagnostic route — same pattern as the deleted
// notes-schema-check route: live introspection against Jobber's real
// GraphQL schema before building real features, since this sandbox
// cannot reach Jobber's API directly. Delete once the turf-size custom
// field and job labor/duration data have been found and the real
// features (gate code / turf size / labor time import) are built and
// verified.
//
// Investigating three things at once, per the user's ask:
//  1. Gate codes — already have all the note text locally in
//     jobber_job_notes from the backfill, no new Jobber query needed.
//  2. Turf size — user confirmed it's a Jobber *custom field*, so we
//     need to find the real field/type names for custom fields on
//     Client/Property.
//  3. Labor time — user confirmed it's tracked as "Duration" under a
//     job's Labor section, so we need to find the real field name on
//     Job (and whether it's per-job or per-line-item/per-visit).
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

type IntrospectionField = {
  name: string;
  type: {
    name: string | null;
    kind: string;
    ofType: { name: string | null; kind: string; ofType: { name: string | null; kind: string } | null } | null;
  };
};

type TypeFieldsResult = {
  __type: { name: string; fields: IntrospectionField[] | null; kind: string } | null;
};

type SchemaTypesResult = {
  __schema: { types: { name: string; kind: string }[] };
};

const TYPE_FIELDS_QUERY = `
  query TypeFields($name: String!) {
    __type(name: $name) {
      name
      kind
      fields {
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
`;

const SCHEMA_TYPES_QUERY = `
  query SchemaTypes {
    __schema {
      types {
        name
        kind
      }
    }
  }
`;

const KEYWORDS = ["custom", "field", "labor", "labour", "duration", "timesheet", "time_sheet", "property"];

function matchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return KEYWORDS.some((keyword) => lower.includes(keyword));
}

export async function GET() {
  const results: Record<string, unknown> = {};

  // Step 1: scan every type name in the schema for anything related to
  // custom fields, labor/duration, or properties — this tells us the
  // REAL type names to introspect in detail next, instead of guessing.
  const schemaResponse = await jobberGraphQL<SchemaTypesResult>(SCHEMA_TYPES_QUERY);

  if (schemaResponse.errors?.length) {
    return NextResponse.json(
      { step: "schema_types", errors: schemaResponse.errors },
      { status: 500 }
    );
  }

  const allTypes = schemaResponse.data?.__schema?.types ?? [];
  const relevantTypeNames = allTypes.filter((t) => matchesKeyword(t.name)).map((t) => t.name).sort();

  results.relevantTypeNames = relevantTypeNames;

  // Step 2: introspect the types we already know exist from the app's
  // current queries (Client, Job) in full detail, since custom fields
  // and labor duration should show up as fields directly on these.
  const namesToIntrospect = Array.from(
    new Set([
      "Client",
      "Job",
      "ClientProperty",
      "Property",
      ...relevantTypeNames.filter(
        (name) =>
          !name.startsWith("__") &&
          (name.toLowerCase().includes("customfield") ||
            name.toLowerCase().includes("labor") ||
            name.toLowerCase().includes("labour") ||
            name.toLowerCase().includes("duration") ||
            name.toLowerCase().includes("timesheet") ||
            name === "Property" ||
            name === "ClientProperty")
      ),
    ])
  );

  const typeDetails: Record<string, unknown> = {};

  for (const name of namesToIntrospect) {
    const response = await jobberGraphQL<TypeFieldsResult>(TYPE_FIELDS_QUERY, { name });

    if (response.errors?.length) {
      typeDetails[name] = { errors: response.errors };
      continue;
    }

    const typeInfo = response.data?.__type;

    if (!typeInfo) {
      typeDetails[name] = null;
      continue;
    }

    typeDetails[name] = {
      kind: typeInfo.kind,
      fields: (typeInfo.fields ?? []).map((f) => ({
        name: f.name,
        type: f.type.name ?? f.type.ofType?.name ?? f.type.ofType?.ofType?.name ?? f.type.kind,
      })),
    };
  }

  results.typeDetails = typeDetails;

  return NextResponse.json(results);
}
