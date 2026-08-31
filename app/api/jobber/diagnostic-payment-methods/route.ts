// ONE-TIME DIAGNOSTIC -- delete once we've confirmed whether Jobber's
// API exposes "this client has a card on file / autopay enabled."
//
// Needed to scope the Stage 7 /invoices cutover split: customers with
// no card on file in Jobber move to native invoicing now, customers
// with a card on file stay on Jobber until autopay parity is confirmed
// for them individually. Nothing in this app's existing sync code
// tracks that today -- every payment record synced (sync-payments)
// just shows how a PAST payment was made, not whether a card is
// currently saved for future automatic charging.
//
// Runs GraphQL introspection against the Client and Job types (looking
// for anything payment/card/autopay/billing-shaped), and -- if a real
// client id is passed -- also tries a handful of plausible field names
// directly, since Jobber's production API may have introspection
// disabled entirely, in which case a "field doesn't exist" error is
// itself useful information.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

type IntrospectionField = {
  name: string;
  description: string | null;
  type: { name: string | null; kind: string; ofType: { name: string | null } | null };
};

type IntrospectionResult = {
  __type: { name: string; fields: IntrospectionField[] | null } | null;
};

const INTEREST_KEYWORDS = [
  "payment",
  "card",
  "auto",
  "bill",
  "recurring",
  "stripe",
  "wallet",
];

function looksInteresting(field: IntrospectionField): boolean {
  const haystack = `${field.name} ${field.description ?? ""}`.toLowerCase();
  return INTEREST_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

async function introspectType(typeName: string) {
  const query = `
    query IntrospectType($name: String!) {
      __type(name: $name) {
        name
        fields {
          name
          description
          type {
            name
            kind
            ofType { name }
          }
        }
      }
    }
  `;

  const result = await jobberGraphQL<IntrospectionResult>(query, { name: typeName });

  if (result.errors) {
    return { typeName, errors: result.errors, allFields: [], interestingFields: [] };
  }

  const allFields = result.data?.__type?.fields ?? [];
  const interestingFields = allFields.filter(looksInteresting);

  return {
    typeName,
    errors: null,
    fieldCount: allFields.length,
    allFields: allFields.map((f) => f.name),
    interestingFields,
  };
}

// Only attempted if ?clientId= is passed -- a handful of plausible
// direct field names in case introspection is disabled and returns
// nothing useful above.
async function tryCandidateFields(clientId: string) {
  const candidates = [
    "hasCardOnFile",
    "hasSavedPaymentMethod",
    "defaultPaymentMethod",
    "automaticPayments",
    "clientPaymentMethods",
    "paymentMethods",
    "savedPaymentMethods",
  ];

  const attempts: Record<string, { ok: boolean; message: string }> = {};

  for (const field of candidates) {
    const query = `
      query TryField($id: EncodedId!) {
        client(id: $id) {
          id
          ${field}
        }
      }
    `;

    const result = await jobberGraphQL(query, { id: clientId });

    if (result.errors && result.errors.length > 0) {
      attempts[field] = { ok: false, message: result.errors[0].message };
    } else {
      attempts[field] = { ok: true, message: "Field exists -- see full response separately." };
    }
  }

  return attempts;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const clientId = request.nextUrl.searchParams.get("clientId");

  const [clientType, jobType, invoiceType] = await Promise.all([
    introspectType("Client"),
    introspectType("Job"),
    introspectType("Invoice"),
  ]);

  const candidateFieldResults = clientId ? await tryCandidateFields(clientId) : null;

  return NextResponse.json({
    note: "Look at interestingFields on each type first. If errors are non-null, introspection is likely disabled -- pass ?clientId=<id> to try direct field guesses instead.",
    clientType,
    jobType,
    invoiceType,
    candidateFieldResults,
  });
}
