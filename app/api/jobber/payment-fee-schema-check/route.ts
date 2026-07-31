// One-off introspection route: does Jobber's payment record schema
// expose a processing-fee field anywhere?
// Round 1: PaymentRecord has no direct fee field.
// Round 2: "allocations" turned out to just be invoice/quote payment
// splitting (PaymentRecordAllocationInterface only has `amount`, no
// fee) — but the full-schema type scan surfaced PayoutRecord and a
// family of "*BalanceTransaction" types (FeeAdjustmentBalanceTransaction,
// InstantPayoutFeeBalanceTransaction, RefundFeeBalanceTransaction, etc.),
// which is how payment processors normally model this: individual
// payments get batched into a payout, and the FEE is a ledger line on
// the payout, not the payment. Round 3: PayoutRecord's own fields (to
// find what holds the balance transactions), two of the
// BalanceTransaction types' fields directly, and the Query type's
// top-level fields filtered for "payout" (to find how to actually query
// this at all). Deleted once the real feature (surfacing tips/fees on
// Revenue) is confirmed working.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const TYPE_FRAGMENT = `
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
`;

const INTROSPECTION_QUERY = `
  query PaymentFeeSchemaCheckRound3 {
    queryType: __type(name: "Query") {
      fields {
        name
      }
    }
    payoutRecord: __type(name: "PayoutRecord") {
      ${TYPE_FRAGMENT}
    }
    feeAdjustment: __type(name: "FeeAdjustmentBalanceTransaction") {
      ${TYPE_FRAGMENT}
    }
    instantPayoutFee: __type(name: "InstantPayoutFeeBalanceTransaction") {
      ${TYPE_FRAGMENT}
    }
    refundFee: __type(name: "RefundFeeBalanceTransaction") {
      ${TYPE_FRAGMENT}
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    queryType: { fields: { name: string }[] };
    payoutRecord: unknown;
    feeAdjustment: unknown;
    instantPayoutFee: unknown;
    refundFee: unknown;
  }>(INTROSPECTION_QUERY);

  const payoutRelatedQueryFields = (data?.queryType?.fields ?? []).filter(
    (f) => /payout/i.test(f.name)
  );

  return NextResponse.json({
    data: {
      payoutRelatedQueryFields,
      payoutRecord: data?.payoutRecord,
      feeAdjustment: data?.feeAdjustment,
      instantPayoutFee: data?.instantPayoutFee,
      refundFee: data?.refundFee,
    },
    errors,
  });
}
