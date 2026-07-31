// One-off introspection route: does Jobber's payment record schema
// expose a processing-fee field anywhere? Round 1 found PaymentRecord
// has no direct "fee" field, but does have an "allocations"
// (PaymentRecordAllocationInterfaceConnection) and "refunds" connection
// — a fee is plausibly modeled as one kind of allocation rather than a
// flat field. Round 2: pull every type name in the whole schema so
// anything fee/allocation/payout-related can be found by name instead
// of guessing one at a time, plus the allocation interface's own shape.
// Deleted once the real feature (surfacing tips/fees on Revenue) is
// confirmed working.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const INTROSPECTION_QUERY = `
  query PaymentFeeSchemaCheckRound2 {
    __schema {
      types {
        name
        kind
      }
    }
    allocationInterface: __type(name: "PaymentRecordAllocationInterface") {
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
    allocationConnection: __type(name: "PaymentRecordAllocationInterfaceConnection") {
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
  }
`;

export async function GET() {
  const { data, errors } = await jobberGraphQL<{
    __schema: { types: { name: string; kind: string }[] };
    allocationInterface: unknown;
    allocationConnection: unknown;
  }>(INTROSPECTION_QUERY);

  // Trim the full type list down to anything that looks relevant —
  // the raw list is 1000+ entries, too much to usefully read otherwise.
  const filteredTypes = (data?.__schema?.types ?? []).filter((t) =>
    /fee|allocation|payout|surcharge|processing/i.test(t.name)
  );

  return NextResponse.json({
    data: {
      matchingTypes: filteredTypes,
      allocationInterface: data?.allocationInterface,
      allocationConnection: data?.allocationConnection,
    },
    errors,
  });
}
