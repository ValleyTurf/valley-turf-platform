import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

type TypeField = {
  name: string;
  type: {
    kind: string;
    name: string | null;
    ofType: {
      kind: string;
      name: string | null;
      ofType?: {
        kind: string;
        name: string | null;
      } | null;
    } | null;
  };
};

type SchemaCheckResponse = {
  clientType: {
    name: string;
    fields: TypeField[];
  } | null;
  jobType: {
    name: string;
    fields: TypeField[];
  } | null;
  queryType: {
    name: string;
    fields: TypeField[];
  } | null;
};

const SCHEMA_QUERY = `
  query ReactivationSchemaCheck {
    clientType: __type(name: "Client") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }
    }

    jobType: __type(name: "Job") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }
    }

    queryType: __type(name: "Query") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }
    }
  }
`;

export async function GET() {
  try {
    const response =
      await jobberGraphQL<SchemaCheckResponse>(
        SCHEMA_QUERY
      );

    if (response.errors?.length) {
      return NextResponse.json(
        {
          success: false,
          errors: response.errors,
        },
        { status: 400 }
      );
    }

    const clientFields =
      response.data?.clientType?.fields
        ?.map((field) => field.name)
        .filter((name) =>
          [
            "jobs",
            "invoices",
            "billingHistory",
            "requests",
            "quotes",
          ].some((keyword) =>
            name
              .toLowerCase()
              .includes(keyword.toLowerCase())
          )
        ) ?? [];

    const jobFields =
      response.data?.jobType?.fields
        ?.map((field) => field.name)
        .sort() ?? [];

    const queryFields =
      response.data?.queryType?.fields
        ?.map((field) => field.name)
        .filter((name) =>
          [
            "job",
            "invoice",
            "client",
          ].some((keyword) =>
            name
              .toLowerCase()
              .includes(keyword)
          )
        )
        .sort() ?? [];

    return NextResponse.json({
      success: true,
      clientFields,
      jobFields,
      queryFields,
    });
  } catch (error) {
    console.error(
      "Jobber schema check failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown schema check error.",
      },
      { status: 500 }
    );
  }
}