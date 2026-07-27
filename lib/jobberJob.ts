// Shared, quote-agnostic pieces of "write a job into Jobber" — split out
// of lib/quoteJobConversion.ts once a second caller (manual job creation
// from app/(platform)/jobs/new) needed the same jobCreate mutation and
// property-resolution logic. See that file's header comment for the full
// history of how these mutation shapes were confirmed against Jobber's
// real schema (propertyId, not clientId; invoicing is required).
import "server-only";
import { jobberGraphQL } from "@/lib/jobber";

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// Argument name "input", type "JobCreateAttributes" — confirmed via two
// live errors against Jobber's real schema (argument name from "Field
// 'jobCreate' is missing required arguments: input"; type name from
// Jobber's job mutations predating their client ones and keeping the
// older "*Attributes" naming convention). propertyId + invoicing are
// JobCreateAttributes' only two required fields, confirmed via
// introspection (the one-off diagnostic route used for this has since
// been deleted, its job done).
const JOB_CREATE_MUTATION = `
  mutation CreateJob($input: JobCreateAttributes!) {
    jobCreate(input: $input) {
      job {
        id
        jobNumber
      }
      userErrors {
        message
      }
    }
  }
`;

// Finds a client's first existing property so a job has something to
// attach to without creating a duplicate one. Used both for quotes tied
// to an already-synced customer and for manual job creation.
const CLIENT_PROPERTY_QUERY = `
  query GetClientProperty($id: EncodedId!) {
    client(id: $id) {
      clientProperties(first: 1) {
        nodes {
          id
        }
      }
    }
  }
`;

export async function fetchExistingPropertyId(
  clientId: string
): Promise<string | null> {
  try {
    const { data, errors } = await jobberGraphQL<{
      client: {
        clientProperties: { nodes: { id: string }[] } | null;
      } | null;
    }>(CLIENT_PROPERTY_QUERY, { id: clientId });

    if (errors?.length) return null;

    return data?.client?.clientProperties?.nodes?.[0]?.id ?? null;
  } catch (error) {
    console.error("fetchExistingPropertyId failed:", error);
    return null;
  }
}

// invoicing is fixed at { invoicingType: FIXED_PRICE, invoicingSchedule:
// NEVER } for every job this app creates, so Jobber never auto-generates
// an invoice off a job whose pricing/scheduling isn't filled in yet —
// staff create the real invoice in Jobber once those are set, same as
// they already do for property details on quote-converted jobs.
//
// Only propertyId/title/invoicing are sent — every other JobCreateAttributes
// field (scheduling, lineItems, instructions, etc.) is still an unconfirmed
// guess against Jobber's real schema, and a single wrong field name fails
// the whole mutation (see lib/quoteJobConversion.ts's header for how many
// rounds that cost the first time). Staff fill in scope-of-work details,
// pricing, and scheduling directly in Jobber after creation, same as
// quote-converted jobs already work.
export async function createJobberJob(params: {
  propertyId: string;
  title: string;
}): Promise<MutationOutcome<{ jobId: string; jobNumber: string | null }>> {
  const { propertyId, title } = params;

  const input: Record<string, unknown> = {
    propertyId,
    title,
    invoicing: {
      invoicingType: "FIXED_PRICE",
      invoicingSchedule: "NEVER",
    },
  };

  const { data, errors } = await jobberGraphQL<{
    jobCreate: {
      job: { id: string; jobNumber: string | number | null } | null;
      userErrors: { message: string }[];
    };
  }>(JOB_CREATE_MUTATION, { input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.jobCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  const job = data?.jobCreate?.job;
  if (!job?.id) {
    return { ok: false, error: "Jobber did not return a job id." };
  }

  return {
    ok: true,
    value: {
      jobId: job.id,
      jobNumber: job.jobNumber != null ? String(job.jobNumber) : null,
    },
  };
}
