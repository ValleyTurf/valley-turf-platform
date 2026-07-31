// One-off introspection/data route: where do Jobber's per-transaction
// credit card / ACH processing fees actually live?
// Round 8 confirmed a top-level Query.paymentRecords(filter, sort, after,
// before, first, last) field returning PaymentRecordInterfaceConnection —
// the polymorphic connection whose nodes resolve to PaymentRecordInterface
// (distinct from Invoice.paymentRecords, which only ever returns the
// unrelated plain PaymentRecord with no fee data).
// Round 9 switches from pure schema introspection to a REAL query: pull a
// handful of actual payment records through this new path with inline
// fragments for the credit-card/ACH concrete types, to confirm the field
// names are right and see real fee values (and whether "id" lines up with
// what's already stored in jobber_payments.jobber_payment_id).
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const REAL_DATA_QUERY = `
  query PaymentFeeSchemaCheckRound9 {
    paymentRecords(first: 5, sort: { key: ENTRY_DATE, direction: DESCENDING }) {
      totalCount
      nodes {
        __typename
        id
        amount
        entryDate
        adjustmentType
        paymentType
        invoice {
          id
        }
        ... on JobberPaymentsCreditCardPaymentRecord {
          feeAmount
          surchargeAmount
        }
        ... on JobberPaymentsACHPaymentRecord {
          feeAmount
        }
      }
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    paymentRecords: {
      totalCount: number;
      nodes: Record<string, unknown>[];
    };
  }>(REAL_DATA_QUERY);

  return NextResponse.json({ data, errors });
}
