// One-off introspection route: where do Jobber's per-transaction credit
// card / ACH processing fees actually live?
// Rounds 1-4: ruled out PaymentRecord (no fee field) and PayoutRecord
// (feeAmount is 0 for every real payout on this account) as sources.
// Round 5: found a whole family of payment-method-specific types —
// JobberPaymentsCreditCardPaymentRecord, JobberPaymentsACHPaymentRecord,
// etc. — plus a PaymentRecordInterface distinct from the concrete
// PaymentRecord object type. sync-payments.ts's existing query asks for
// plain fields with no inline fragments, which only ever returns
// whatever's declared on the interface itself — if Invoice.paymentRecords
// actually resolves to that interface, a fee field declared only on
// JobberPaymentsCreditCardPaymentRecord would be invisible without an
// "... on JobberPaymentsCreditCardPaymentRecord { ... }" fragment. Round
// 6: confirm what Invoice.paymentRecords actually returns, and get the
// full field lists for PaymentRecordInterface + the two JobberPayments-
// branded concrete types to look for a fee field on them directly.
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
  query PaymentFeeSchemaCheckRound6 {
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
    paymentRecordInterface: __type(name: "PaymentRecordInterface") {
      name
      kind
      possibleTypes {
        name
      }
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
    creditCardRecord: __type(name: "JobberPaymentsCreditCardPaymentRecord") {
      ${TYPE_FRAGMENT}
    }
    achRecord: __type(name: "JobberPaymentsACHPaymentRecord") {
      ${TYPE_FRAGMENT}
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    invoiceType: {
      fields: { name: string; type: unknown }[];
    };
    paymentRecordInterface: unknown;
    creditCardRecord: unknown;
    achRecord: unknown;
  }>(INTROSPECTION_QUERY);

  const paymentRecordsField = (data?.invoiceType?.fields ?? []).find(
    (f) => f.name === "paymentRecords"
  );

  return NextResponse.json({
    data: {
      paymentRecordsField,
      paymentRecordInterface: data?.paymentRecordInterface,
      creditCardRecord: data?.creditCardRecord,
      achRecord: data?.achRecord,
    },
    errors,
  });
}
