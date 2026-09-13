// TEMPORARY diagnostic route — same pattern as the invoice-schema-check /
// job-*-schema-check routes referenced in lib/jobberInvoice.ts's and
// lib/jobberJob.ts's header comments (both since deleted, their job done).
// Purpose: confirm which field(s) on Jobber's Invoice type expose the
// visit(s)/job(s) it covers, so app/api/jobber/webhook's INVOICE_CREATE/
// INVOICE_UPDATE handling can write jobber_visits.jobber_invoice_id back
// for a native visit once Jobber reports its invoice — right now that
// link only ever gets set by syncSingleVisit, which is a no-op for every
// native visit post-cutover (see jobberWebhookProcessor.ts), so an invoice
// created directly in Jobber (bypassing this app) never clears the visit
// off the /invoices "not yet invoiced" list.
//
// Two steps, since a GraphQL query referencing a field that doesn't exist
// fails the whole request (no partial results to fall back on):
//   1) __type introspection on Invoice — lists every real field name.
//   2) Once we can see candidate names in step 1's response, a second
//      call (?probe=<fieldName>) tries querying that field on a real
//      invoice to see its actual shape.
// DELETE THIS ROUTE once the real fix (in jobberWebhookProcessor.ts) is
// built and confirmed working — it's read-only (no mutations), but it's
// not meant to stick around like the rest of the API surface.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const INTROSPECT_QUERY = `
  query IntrospectInvoice {
    __type(name: "Invoice") {
      name
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

export async function GET(request: Request) {
  const probeField = new URL(request.url).searchParams.get("probe");

  try {
    if (!probeField) {
      const { data, errors } = await jobberGraphQL<{
        __type: {
          name: string;
          fields: {
            name: string;
            type: {
              name: string | null;
              kind: string;
              ofType: {
                name: string | null;
                kind: string;
                ofType: { name: string | null; kind: string } | null;
              } | null;
            };
          }[];
        } | null;
      }>(INTROSPECT_QUERY, {});

      if (errors?.length) {
        return NextResponse.json(
          { success: false, errors },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        step: "introspection",
        invoiceType: data?.__type,
        hint:
          "Look for a field name suggesting visits/jobs (e.g. jobVisits, visits, jobs, lineItems). Then re-hit this route with ?probe=<fieldName> to see real data.",
      });
    }

    // Step 2: probe one real field on one real invoice. We don't know its
    // sub-selection shape yet, so try a handful of common shapes in
    // sequence (a scalar, a { nodes { id } } connection, or a plain list
    // of ids) and report whichever one Jobber actually accepts.
    const candidateQueries = [
      `query Probe($id: EncodedId!) { invoice(id: $id) { id ${probeField} { nodes { id } } } }`,
      `query Probe($id: EncodedId!) { invoice(id: $id) { id ${probeField} { id } } }`,
      `query Probe($id: EncodedId!) { invoice(id: $id) { id ${probeField} } }`,
    ];

    // Grab one real invoice id to probe against.
    const { data: listData, errors: listErrors } = await jobberGraphQL<{
      invoices: { nodes: { id: string }[] };
    }>(`query { invoices(first: 1) { nodes { id } } }`, {});

    if (listErrors?.length) {
      return NextResponse.json(
        { success: false, step: "find-sample-invoice", errors: listErrors },
        { status: 500 }
      );
    }

    const sampleId = listData?.invoices?.nodes?.[0]?.id;

    if (!sampleId) {
      return NextResponse.json({
        success: false,
        step: "find-sample-invoice",
        message: "No invoices found in Jobber to probe against.",
      });
    }

    const attempts: { query: string; result: unknown }[] = [];

    for (const query of candidateQueries) {
      const { data, errors } = await jobberGraphQL(query, { id: sampleId });
      attempts.push({ query, result: errors?.length ? { errors } : data });

      if (!errors?.length) {
        return NextResponse.json({
          success: true,
          step: "probe",
          probeField,
          sampleInvoiceId: sampleId,
          workingQuery: query,
          data,
        });
      }
    }

    return NextResponse.json({
      success: false,
      step: "probe",
      probeField,
      sampleInvoiceId: sampleId,
      message: "None of the candidate shapes worked for this field.",
      attempts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
