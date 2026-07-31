// One-off introspection route: where do Jobber's per-transaction credit
// card / ACH processing fees actually live?
// Rounds 1-4 (see git history) confirmed PaymentRecord has no direct fee
// field, and PayoutRecord's feeAmount comes back as 0 for every real
// payout on this account (gross_amount === net_amount on all of them) —
// so the payout-level fee isn't where the per-transaction card/ACH fee
// shows up, if it's tracked at all via this API.
// Round 5: PaymentRecord's own fields are prefixed "jobberPayment*"
// (jobberPaymentLast4, jobberPaymentPaymentMethod,
// jobberPaymentTransactionStatus) — a common GraphQL pattern for a
// record type proxying a few fields from a related object without
// exposing the whole thing. Looking for that underlying "JobberPayment"
// type directly (it may expose a fee PaymentRecord doesn't), plus a
// broader type-name scan for anything "Payment"-shaped that round 2's
// narrower fee/allocation/payout scan wouldn't have caught.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const TYPE_FRAGMENT = `
  name
  kind
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
  query PaymentFeeSchemaCheckRound5 {
    __schema {
      types {
        name
        kind
      }
    }
    jobberPayment: __type(name: "JobberPayment") {
      ${TYPE_FRAGMENT}
    }
    cardPayment: __type(name: "CardPayment") {
      ${TYPE_FRAGMENT}
    }
    achPayment: __type(name: "AchPayment") {
      ${TYPE_FRAGMENT}
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    __schema: { types: { name: string; kind: string }[] };
    jobberPayment: unknown;
    cardPayment: unknown;
    achPayment: unknown;
  }>(INTROSPECTION_QUERY);

  const paymentRelatedTypes = (data?.__schema?.types ?? []).filter((t) =>
    /payment/i.test(t.name)
  );

  return NextResponse.json({
    data: {
      paymentRelatedTypes,
      jobberPayment: data?.jobberPayment,
      cardPayment: data?.cardPayment,
      achPayment: data?.achPayment,
    },
    errors,
  });
}
