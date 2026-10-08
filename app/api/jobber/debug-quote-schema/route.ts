// One-off (2026-10-08): Ryan wants the real price preserved for quotes
// that only ever existed in Jobber (see customers/[id]/page.tsx's
// 2026-10-07 fix -- those quotes come back from getJobberClient's
// quotes(first: 40) query with no price at all, which is why the Past
// Quotes pill correctly shows nothing for them today). Before writing
// a backfill that asks Jobber's API for a price field, this introspects
// Jobber's actual live GraphQL schema for the Quote type instead of
// guessing a field name -- an invalid field in a real query would error
// out the whole request, not just the price part, so this is cheaper
// and safer than trial-and-error against the live customer page.
//
// Read-only, admin-gated, manual-trigger only. Not meant to stay in
// the app long-term -- delete once the backfill's query is confirmed
// working against the real field name this turns up.
//
// 2026-10-08 follow-up: Quote.amounts turned out to be a non-null
// QuoteAmounts object, not a scalar -- ?type=QuoteAmounts (or any other
// type name) introspects that nested type instead, so the one deployed
// route covers both lookups rather than needing a second deploy.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const INTROSPECT_TYPE = `
  query IntrospectType($typeName: String!) {
    __type(name: $typeName) {
      name
      fields {
        name
        type {
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
`;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const typeName = request.nextUrl.searchParams.get("type") || "Quote";

  const response = await jobberGraphQL<{
    __type: {
      name: string;
      fields: Array<{
        name: string;
        type: {
          name: string | null;
          kind: string;
          ofType: { name: string | null; kind: string } | null;
        };
      }>;
    } | null;
  }>(INTROSPECT_TYPE, { typeName });

  if (response.errors?.length) {
    return NextResponse.json(
      {
        success: false,
        errors: response.errors,
      },
      { status: 500 }
    );
  }

  if (!response.data?.__type) {
    return NextResponse.json(
      {
        success: false,
        error: `Jobber returned no '${typeName}' type -- introspection may be disabled, or the type is named something else.`,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    typeName,
    fields: response.data.__type.fields,
  });
}
