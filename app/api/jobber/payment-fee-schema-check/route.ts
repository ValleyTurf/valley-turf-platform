// One-off introspection route: where do Jobber's per-transaction credit
// card / ACH processing fees actually live?
// Round 6 found that Invoice.paymentRecords resolves to
// PaymentRecordConnection (confirmed OBJECT, not the interface
// connection) — and comparing its node shape against round 1's
// PaymentRecord field list (tipAmount, jobberPaymentPaymentMethod, no
// fee) against PaymentRecordInterface's completely different field list
// (canEdit, client, details, invoice, paymentOrigin, paymentType, quote,
// rawAmount, sentAt — no tipAmount at all) proves these are two
// unrelated type hierarchies. Invoice.paymentRecords only ever returns
// the plain PaymentRecord shape with no fee data — the polymorphic
// interface (whose JobberPaymentsCreditCardPaymentRecord/
// JobberPaymentsACHPaymentRecord subtypes DO have feeAmount) must be
// reached some other way. Round 7: scan every top-level Query field
// for anything payment-related to find that other path.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const INTROSPECTION_QUERY = `
  query PaymentFeeSchemaCheckRound7 {
    queryType: __type(name: "Query") {
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
    clientType: __type(name: "Client") {
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
    queryType: {
      fields: {
        name: string;
        type: { name: string | null; kind: string; ofType: { name: string | null; kind: string } | null };
      }[];
    };
    clientType: {
      fields: {
        name: string;
        type: { name: string | null; kind: string; ofType: { name: string | null; kind: string } | null };
      }[];
    };
  }>(INTROSPECTION_QUERY);

  const paymentRelatedQueryFields = (data?.queryType?.fields ?? []).filter(
    (f) => /payment/i.test(f.name)
  );
  const paymentRelatedClientFields = (data?.clientType?.fields ?? []).filter(
    (f) => /payment/i.test(f.name)
  );

  return NextResponse.json({
    data: {
      paymentRelatedQueryFields,
      paymentRelatedClientFields,
    },
    errors,
  });
}
