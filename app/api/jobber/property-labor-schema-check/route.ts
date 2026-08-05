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

const UNION_POSSIBLE_TYPES_QUERY = `
  query UnionTypes($name: String!) {
    __type(name: $name) {
      name
      kind
      possibleTypes {
        name
      }
    }
  }
`;

type UnionTypesResult = {
  __type: { name: string; kind: string; possibleTypes: { name: string }[] | null } | null;
};

// Round 2, live data: now that we know Property/Client/Job all expose
// customFields, and Job exposes timeSheetEntries directly, pull a
// small real sample so we can see actual label/value pairs (to find
// which custom field is really "turf size") and how timeSheetEntries
// relate to a specific visit (via targetItem) rather than just the
// job as a whole.
const SAMPLE_QUERY = `
  query SampleData {
    jobs(first: 5) {
      nodes {
        id
        jobNumber
        property {
          id
          customFields {
            ... on CustomFieldText { label valueText }
            ... on CustomFieldNumeric { label valueNumeric unit }
            ... on CustomFieldTrueFalse { label valueTrueFalse }
            ... on CustomFieldDropdown { label valueDropdown }
            ... on CustomFieldArea { label unit valueArea { length width } }
          }
        }
        client {
          id
          customFields {
            ... on CustomFieldText { label valueText }
            ... on CustomFieldNumeric { label valueNumeric unit }
            ... on CustomFieldTrueFalse { label valueTrueFalse }
            ... on CustomFieldDropdown { label valueDropdown }
            ... on CustomFieldArea { label unit valueArea { length width } }
          }
        }
        visits(first: 5) {
          nodes {
            id
            startAt
            endAt
          }
        }
        timeSheetEntries(first: 10) {
          nodes {
            id
            startAt
            endAt
            finalDuration
            label
            timeSheetCategory
            user { id }
            targetItem {
              __typename
              ... on Visit { id }
              ... on Job { id }
            }
          }
        }
      }
    }
  }
`;

type SampleJob = {
  id: string;
  jobNumber: number | null;
  property: { id: string; customFields: Record<string, unknown>[] } | null;
  client: { id: string; customFields: Record<string, unknown>[] } | null;
  visits: { nodes: { id: string; startAt: string | null; endAt: string | null }[] };
  timeSheetEntries: {
    nodes: {
      id: string;
      startAt: string | null;
      endAt: string | null;
      finalDuration: number | null;
      label: string | null;
      timeSheetCategory: string | null;
      user: { id: string } | null;
      targetItem: { __typename: string; id: string } | null;
    }[];
  };
};

type SampleResult = { jobs: { nodes: SampleJob[] } };

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
      "TimerTarget",
      "CustomFieldUnion",
      "Name",
      "User",
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

  // Step 3: union possibleTypes for TimerTarget and CustomFieldUnion —
  // tells us exactly what a timer can be attached to (Job vs Visit)
  // and what custom field shapes exist.
  const unionResults: Record<string, unknown> = {};
  for (const name of ["TimerTarget", "CustomFieldUnion"]) {
    const response = await jobberGraphQL<UnionTypesResult>(UNION_POSSIBLE_TYPES_QUERY, { name });
    unionResults[name] = response.errors?.length
      ? { errors: response.errors }
      : response.data?.__type?.possibleTypes ?? null;
  }
  results.unionPossibleTypes = unionResults;

  // Step 4: live sample of 5 real jobs — actual custom field
  // labels/values (to find which one is "turf size" and whether it
  // lives on Property or Client), plus real timeSheetEntries next to
  // that job's visits so we can see how to match a labor entry to the
  // specific visit it belongs to.
  //
  // NOTE: this combined query is a single GraphQL operation, so if
  // timeSheetEntries turns out to be permission-gated, GraphQL null
  // propagation could wipe out the whole jobs list depending on
  // nullability — always surface partial `data` alongside `errors`
  // instead of discarding it, so a time-tracking permission problem
  // doesn't also hide the custom-field results we actually need.
  const sampleResponse = await jobberGraphQL<SampleResult>(SAMPLE_QUERY);
  results.sample = {
    errors: sampleResponse.errors ?? null,
    data: sampleResponse.data?.jobs?.nodes ?? null,
  };

  // Step 5: isolate timeSheetEntries in its OWN query, with nothing
  // else that could get nulled out alongside it — if this alone comes
  // back permission-denied, that confirms it's a scope problem with
  // the Jobber app connection (likely needs a broader OAuth
  // scope/reconnect) rather than something about how the query is
  // shaped.
  const TIME_SHEET_ONLY_QUERY = `
    query TimeSheetOnly {
      jobs(first: 3) {
        nodes {
          id
          timeSheetEntries(first: 3) {
            nodes {
              id
              finalDuration
            }
          }
        }
      }
    }
  `;
  const timeSheetResponse = await jobberGraphQL<{ jobs: { nodes: { id: string; timeSheetEntries: unknown }[] } }>(
    TIME_SHEET_ONLY_QUERY
  );
  results.timeSheetOnlyCheck = {
    errors: timeSheetResponse.errors ?? null,
    data: timeSheetResponse.data ?? null,
  };

  return NextResponse.json(results);
}
