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
import { supabaseServer } from "@/lib/supabase-server";

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

// Confirms the willClientBeAutomaticallyCharged field found via
// introspection actually reflects reality, by checking it against real
// customers the user already knows have (or don't have) a saved
// card/autopay running in Jobber today.
async function checkAutochargeForClient(jobberClientId: string) {
  const query = `
    query ClientJobsAutocharge($id: EncodedId!) {
      client(id: $id) {
        id
        name
        jobs(first: 20, filter: { status: ACTIVE_OR_UPCOMING }) {
          nodes {
            id
            jobNumber
            jobStatus
            willClientBeAutomaticallyCharged
          }
        }
      }
    }
  `;

  const result = await jobberGraphQL(query, { id: jobberClientId });

  if (result.errors && result.errors.length > 0) {
    // The status filter above is a guess at Jobber's real enum/shape --
    // if it errors, retry with no filter so we still get useful data
    // rather than nothing.
    const fallbackQuery = `
      query ClientJobsAutochargeFallback($id: EncodedId!) {
        client(id: $id) {
          id
          name
          jobs(first: 20) {
            nodes {
              id
              jobNumber
              jobStatus
              willClientBeAutomaticallyCharged
            }
          }
        }
      }
    `;
    const fallbackResult = await jobberGraphQL(fallbackQuery, { id: jobberClientId });
    return { jobberClientId, primaryAttemptErrors: result.errors, result: fallbackResult };
  }

  return { jobberClientId, primaryAttemptErrors: null, result };
}

async function lookupClientIdsByName(names: string[]) {
  const matches: Record<string, { jobber_client_id: string; full_name: string }[]> = {};

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .ilike("full_name", `%${trimmed}%`);

    matches[trimmed] = error ? [] : (data ?? []).map((row) => ({
      jobber_client_id: row.jobber_client_id as string,
      full_name: row.full_name as string,
    }));
  }

  return matches;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const clientId = request.nextUrl.searchParams.get("clientId");
  const namesParam = request.nextUrl.searchParams.get("names");

  // Skip the introspection block once we're just spot-checking real
  // customers by name -- it's already confirmed and just adds noise.
  const skipIntrospection = Boolean(namesParam);

  const [clientType, jobType, invoiceType] = skipIntrospection
    ? [null, null, null]
    : await Promise.all([
        introspectType("Client"),
        introspectType("Job"),
        introspectType("Invoice"),
      ]);

  const candidateFieldResults = clientId && !namesParam ? await tryCandidateFields(clientId) : null;

  let nameSpotCheck: unknown = null;

  if (namesParam) {
    const names = namesParam.split(",").map((n) => n.trim()).filter(Boolean);
    const clientIdsByName = await lookupClientIdsByName(names);

    const perNameResults: Record<string, unknown> = {};

    for (const [name, matches] of Object.entries(clientIdsByName)) {
      if (matches.length === 0) {
        perNameResults[name] = { found: false, note: "No customer matched this name in the local customers table." };
        continue;
      }

      const checks = await Promise.all(
        matches.map((m) => checkAutochargeForClient(m.jobber_client_id))
      );

      perNameResults[name] = { found: true, matches, checks };
    }

    nameSpotCheck = perNameResults;
  }

  return NextResponse.json({
    note: "Look at interestingFields on each type first. If errors are non-null, introspection is likely disabled -- pass ?clientId=<id> to try direct field guesses instead. Pass ?names=Full Name,Another Name to spot-check willClientBeAutomaticallyCharged against real customers by name.",
    clientType,
    jobType,
    invoiceType,
    candidateFieldResults,
    nameSpotCheck,
  });
}
