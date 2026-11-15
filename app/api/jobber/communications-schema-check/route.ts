// One-off, read-only (2026-11-15). Ryan: "We moved over pictures and
// notes from Jobber, but we did not move over communication history.
// Is that something that can be done?" -- before promising anything,
// this asks Jobber's own API (schema introspection, no customer data
// read) whether it exposes sent emails/texts or two-way conversations
// at all: every type or field whose name looks communication-related,
// plus the full field list on Client so nothing with an unexpected
// name gets missed. Admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

type IntrospectedType = {
  name: string;
  kind: string;
  fields: { name: string }[] | null;
};

type SchemaResponse = {
  __schema: { types: IntrospectedType[] };
};

const SCHEMA_QUERY = `
  query CommunicationsSchemaCheck {
    __schema {
      types {
        name
        kind
        fields {
          name
        }
      }
    }
  }
`;

const KEYWORDS =
  /message|communicat|conversation|email|sms|text|inbox|thread|correspond|notification|reminder/i;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const response = await jobberGraphQL<SchemaResponse>(SCHEMA_QUERY);

    if (response.errors?.length) {
      return NextResponse.json({ success: false, errors: response.errors }, { status: 400 });
    }

    const types = (response.data?.__schema.types ?? []).filter(
      (type) => !type.name.startsWith("__")
    );

    const matchingTypes = types
      .filter((type) => KEYWORDS.test(type.name))
      .map((type) => ({
        name: type.name,
        kind: type.kind,
        fields: (type.fields ?? []).map((field) => field.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const matchingFields = types
      .filter((type) => type.kind === "OBJECT")
      .flatMap((type) =>
        (type.fields ?? [])
          .filter((field) => KEYWORDS.test(field.name))
          .map((field) => `${type.name}.${field.name}`)
      )
      .sort();

    const fieldsOf = (name: string) =>
      (types.find((type) => type.name === name)?.fields ?? [])
        .map((field) => field.name)
        .sort();

    return NextResponse.json({
      success: true,
      totalTypes: types.length,
      matchingTypes,
      matchingFields,
      clientFields: fieldsOf("Client"),
      queryFields: fieldsOf("Query"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown schema check error.",
      },
      { status: 500 }
    );
  }
}
