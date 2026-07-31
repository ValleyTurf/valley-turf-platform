// One-off introspection route: where do Jobber's per-transaction credit
// card / ACH processing fees actually live?
// Round 7 found the real path: a TOP-LEVEL Query.paymentRecords field
// returning PaymentRecordInterfaceConnection (distinct from
// Invoice.paymentRecords, which returns the unrelated plain
// PaymentRecordConnection with no fee data). Round 8: introspect that
// top-level field's arguments (so we know how to scope/page it) and the
// PaymentRecordInterfaceConnection type's own fields (nodes/edges shape),
// to confirm this is queryable the way we need before writing the real
// sync query.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const INTROSPECTION_QUERY = `
  query PaymentFeeSchemaCheckRound8 {
    queryType: __type(name: "Query") {
      fields {
        name
        args {
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
    connectionType: __type(name: "PaymentRecordInterfaceConnection") {
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
    }
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    queryType: {
      fields: {
        name: string;
        args: {
          name: string;
          type: {
            name: string | null;
            kind: string;
            ofType: { name: string | null; kind: string } | null;
          };
        }[];
      }[];
    };
    connectionType: {
      name: string;
      kind: string;
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
    };
  }>(INTROSPECTION_QUERY);

  const topLevelPaymentRecordsField = (data?.queryType?.fields ?? []).find(
    (f) => f.name === "paymentRecords"
  );

  return NextResponse.json({
    data: {
      topLevelPaymentRecordsField,
      connectionType: data?.connectionType,
    },
    errors,
  });
}
