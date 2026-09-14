// TEMPORARY diagnostic route -- follow-up to the now-deleted
// diagnose-invoice-schema route. That route confirmed Invoice.visits
// exists and is queryable as `visits(first: 50) { nodes { id } }`, and
// jobberWebhookProcessor.ts / sync-invoices now use exactly that shape
// to backfill jobber_visits.jobber_invoice_id.
//
// Confirmed working for Kaleen Carter (invoice-per-visit billing): her
// 9/12 invoice's `visits` connection contained her 9/12 visit id, and
// the backfill linked it correctly.
//
// NOT yet confirmed for prepaid/period billing (Darcy Wearing, Patricia
// Bach, Dawn Kamal, Wendy Roberts): Ryan says their invoice issued on
// the 1st of the month is meant to cover a cleaning later that same
// month, but those visits are still showing up as "needs invoice" on
// /invoices/create after the sync ran. Two live possibilities this
// route exists to distinguish:
//   1) Invoice.visits genuinely does NOT include the later visit for
//      this billing pattern (Jobber only populates it for visits that
//      existed at invoice-creation time) -- would need a different
//      linking strategy entirely (e.g. by job + billing period).
//   2) Invoice.visits DOES include it, but our webhook never re-ran
//      for this invoice after the visit was completed (no INVOICE_*
//      event fires just because a VISIT_COMPLETE happened) -- would
//      mean the retroactive sync-invoices route is the only thing
//      that ever re-checks it, and it already ran once already.
//
// Usage: GET /api/jobber/inspect-invoice?id=<EncodedId>
// DELETE THIS ROUTE once the real fix is built and confirmed -- same
// disposable-diagnostic convention as every other *-schema-check /
// diagnose-* route referenced in this codebase's header comments.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

const INSPECT_QUERY = `
  query InspectInvoice($id: EncodedId!) {
    invoice(id: $id) {
      id
      invoiceNumber
      issuedDate
      dueDate
      visits(first: 50) {
        nodes {
          id
          title
          startAt
          completedAt
        }
      }
      jobs(first: 50) {
        nodes {
          id
          jobNumber
        }
      }
    }
  }
`;

export async function GET(request: Request) {
  const invoiceId = new URL(request.url).searchParams.get("id");

  if (!invoiceId) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Pass ?id=<EncodedId> -- e.g. Darcy Wearing's 9/1 invoice: Z2lkOi8vSm9iYmVyL0ludm9pY2UvMTcwNTc0Nzc1",
      },
      { status: 400 }
    );
  }

  try {
    const { data, errors } = await jobberGraphQL<{
      invoice: {
        id: string;
        invoiceNumber: string | null;
        issuedDate: string | null;
        dueDate: string | null;
        visits: { nodes: { id: string; title: string | null; startAt: string | null; completedAt: string | null }[] };
        jobs: { nodes: { id: string; jobNumber: number | null }[] };
      } | null;
    }>(INSPECT_QUERY, { id: invoiceId });

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      invoice: data?.invoice,
      visitCount: data?.invoice?.visits?.nodes?.length ?? 0,
      jobCount: data?.invoice?.jobs?.nodes?.length ?? 0,
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
