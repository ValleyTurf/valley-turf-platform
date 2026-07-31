// One-off introspection route: does Jobber's payment record schema
// expose a processing-fee field anywhere?
// Round 1: PaymentRecord has no direct fee field.
// Round 2: "allocations" is just invoice/quote payment splitting, not
// fees — but surfaced PayoutRecord and *BalanceTransaction types.
// Round 3: PayoutRecord itself has direct feeAmount/grossAmount/
// netAmount fields (Int, likely cents given the type — PaymentRecord's
// own amount is a Float/dollars, so this needs confirming once real
// data comes back) — no need to dig into individual balance
// transactions for an aggregate fee total per payout.
// Round 4: the payoutRecords query field's actual arguments (to know
// how to page through it), PayoutRecordConnection's shape, and the
// PayoutStatus/PayoutMethod/Payout enum values (to filter to only
// completed payouts and label things sensibly). Deleted once the real
// feature (surfacing tips/fees on Revenue) is confirmed working.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const ARG_TYPE_FRAGMENT = `
  name
  args {
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
  query PaymentFeeSchemaCheckRound4 {
    queryType: __type(name: "Query") {
      fields {
        ${ARG_TYPE_FRAGMENT}
      }
    }
    payoutConnection: __type(name: "PayoutRecordConnection") {
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
    payoutStatus: __type(name: "PayoutStatus") {
      enumValues {
        name
      }
    }
    payoutMethod: __type(name: "PayoutMethod") {
      enumValues {
        name
      }
    }
    payoutType: __type(name: "Payout") {
      enumValues {
        name
      }
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    queryType: {
      fields: { name: string; args: { name: string }[] }[];
    };
    payoutConnection: unknown;
    payoutStatus: unknown;
    payoutMethod: unknown;
    payoutType: unknown;
  }>(INTROSPECTION_QUERY);

  const payoutFields = (data?.queryType?.fields ?? []).filter((f) =>
    /^payoutRecords?$/.test(f.name)
  );

  return NextResponse.json({
    data: {
      payoutFields,
      payoutConnection: data?.payoutConnection,
      payoutStatus: data?.payoutStatus,
      payoutMethod: data?.payoutMethod,
      payoutType: data?.payoutType,
    },
    errors,
  });
}
