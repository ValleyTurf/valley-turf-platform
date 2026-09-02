// Turns a freshly-submitted /request-quote lead directly into a real
// Jobber client + property, so Ryan's "create a customer profile" wish
// actually happens at intake time rather than waiting for a quote to be
// accepted. Deliberately best-effort/non-blocking, same pattern as
// lib/quoteJobConversion.ts's createJobberClientForQuote (which this is
// adapted from) and every other Jobber write in this app: never throws,
// a Jobber outage or bad field never blocks the lead itself from being
// saved — the office can always create the client manually in Jobber
// later from the Leads page, same as leads always could before this
// existed.
//
// Differs from createJobberClientForQuote in one way: this form collects
// structured Street/City/State/Zip fields (quotes only ever had a single
// flat recipient_address string), so the property address here is sent
// with city/province/postalCode/country populated too, not just street1.
import "server-only";
import { jobberGraphQL } from "@/lib/jobber";

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const CLIENT_CREATE_MUTATION = `
  mutation CreateClientFromLead($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client {
        id
        clientProperties(first: 1) {
          nodes {
            id
          }
        }
      }
      userErrors {
        message
      }
    }
  }
`;

export function splitName(fullName: string): {
  firstName: string;
  lastName: string | null;
} {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return { firstName: trimmed || "Customer", lastName: null };
  }

  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || null,
  };
}

export type LeadForJobberClient = {
  fullName: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export async function createJobberClientForLead(
  lead: LeadForJobberClient
): Promise<MutationOutcome<{ clientId: string; propertyId: string | null }>> {
  const { firstName, lastName } = splitName(lead.fullName || "Customer");

  const input: Record<string, unknown> = {
    firstName,
    ...(lastName ? { lastName } : {}),
  };

  if (lead.email) {
    input.emails = [{ description: "MAIN", primary: true, address: lead.email }];
  }

  if (lead.phone) {
    input.phones = [{ description: "MAIN", primary: true, number: lead.phone }];
  }

  const trimmedStreet = lead.street?.trim();
  if (trimmedStreet) {
    input.properties = [
      {
        address: {
          street1: trimmedStreet,
          ...(lead.city?.trim() ? { city: lead.city.trim() } : {}),
          ...(lead.state?.trim() ? { province: lead.state.trim() } : {}),
          ...(lead.zip?.trim() ? { postalCode: lead.zip.trim() } : {}),
          country: "US",
        },
      },
    ];
  }

  const { data, errors } = await jobberGraphQL<{
    clientCreate: {
      client: {
        id: string;
        clientProperties: { nodes: { id: string }[] } | null;
      } | null;
      userErrors: { message: string }[];
    };
  }>(CLIENT_CREATE_MUTATION, { input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.clientCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  const clientId = data?.clientCreate?.client?.id;
  if (!clientId) {
    return { ok: false, error: "Jobber did not return a client id." };
  }

  const propertyId =
    data?.clientCreate?.client?.clientProperties?.nodes?.[0]?.id ?? null;

  return { ok: true, value: { clientId, propertyId } };
}
