// One-off diagnostic route: a user-reported bug — an invoice issued on
// July 31st (Phoenix time, evening) synced into this app showing August
// 1st instead. The prime suspect is sync-invoices.ts's cleanDate():
//   new Date(value).toISOString().slice(0, 10)
// If Jobber's issuedDate is a real timestamp (not a bare date), this
// converts to UTC before slicing off the date — Phoenix is UTC-7, so
// anything issued after 5pm Phoenix time lands on "tomorrow" in UTC.
// This pulls the 5 most recent real invoices to see the exact raw
// issuedDate/dueDate strings Jobber returns, confirming whether they
// carry real time-of-day info (the bug) or are bare dates (a different
// bug, or no bug at all).
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const QUERY = `
  query InvoiceDateCheck {
    invoices(first: 5, sort: { key: ISSUED_DATE, direction: DESCENDING }) {
      nodes {
        id
        invoiceNumber
        issuedDate
        dueDate
        receivedDate
        createdAt
      }
    }
    invoiceType: __type(name: "Invoice") {
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

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    invoices: { nodes: Record<string, unknown>[] };
    invoiceType: {
      fields: {
        name: string;
        type: {
          name: string | null;
          kind: string;
          ofType: { name: string | null; kind: string } | null;
        };
      }[];
    };
  }>(QUERY);

  const dateFieldTypes = (data?.invoiceType?.fields ?? []).filter((f) =>
    /date|At$/i.test(f.name)
  );

  return NextResponse.json({
    data: {
      recentInvoices: data?.invoices?.nodes,
      dateFieldTypes,
    },
    errors,
  });
}
