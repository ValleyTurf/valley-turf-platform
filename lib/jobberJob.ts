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

// Recurring cadences this app offers, expressed as the iCalendar RRULE
// value Jobber's `scheduling.recurrence: ICalendarRule` field expects.
// Live error confirmed the exact required format: the full "RRULE:"
// property line, not just the bare rule content — Jobber's own error
// message gave "RRULE:FREQ=WEEKLY;BYDAY=MO" as an example, and the
// first live attempt (sent without the "RRULE:" prefix) failed with
// "Recurrence should be a valid iCalendarRecurrenceRule." "Bi-Monthly"
// here means every 2 months (the trade meaning used throughout this
// app's own service categories — see job-costs/page.tsx's
// RECURRING_CATEGORIES and the schedule page's service-color rules),
// not twice a month.
export type RecurrenceFrequency =
  | "weekly"
  | "bimonthly"
  | "monthly"
  | "quarterly"
  | "semiannual";

const RECURRENCE_RULES: Record<RecurrenceFrequency, string> = {
  weekly: "RRULE:FREQ=WEEKLY;INTERVAL=1",
  bimonthly: "RRULE:FREQ=MONTHLY;INTERVAL=2",
  monthly: "RRULE:FREQ=MONTHLY;INTERVAL=1",
  quarterly: "RRULE:FREQ=MONTHLY;INTERVAL=3",
  semiannual: "RRULE:FREQ=MONTHLY;INTERVAL=6",
};

// invoicing is fixed at { invoicingType: FIXED_PRICE, invoicingSchedule:
// NEVER } for every job this app creates, so Jobber never auto-generates
// an invoice off a job whose pricing/scheduling isn't filled in yet —
// staff create the real invoice in Jobber once those are set, same as
// they already do for property details on quote-converted jobs.
//
// Everything below besides propertyId/title/invoicing is optional and
// only sent when the caller actually provides it — confirmed against
// Jobber's real schema via introspection (see the two job-*-schema-check
// diagnostic routes' commit history) rather than guessed field names,
// after the original propertyId/invoicing discovery cost several rounds
// of live errors doing exactly that:
//   - instructions: a plain String field directly on JobCreateAttributes
//     (no sub-type) — used for scope-of-work / special instructions.
//   - lineItems: [JobCreateLineItemAttributes!] — this app only ever
//     sends a single line item (name = the job title, unitPrice = the
//     price passed in, quantity 1), matching the flat-price model
//     quotes already use. saveToProductsAndServices is required and
//     always false so creating a job here never pollutes Jobber's
//     Products & Services catalog.
//   - timeframe.startAt + scheduling: only sent when a start date is
//     given. scheduling.createVisits/notifyTeam are required booleans
//     whenever scheduling is sent at all — createVisits is always true
//     (the whole point is to get real visits on the calendar instead of
//     an unscheduled job), notifyTeam is always false since this app
//     has no crew-assignment UI yet (assignedTo is left empty, so
//     there's no one to notify). scheduling.recurrence is only included
//     for recurring jobs — omitting it (one-time) still schedules a
//     single visit on startAt, it just doesn't repeat. This is also
//     the fix for jobs landing as Jobber's default "One-Time" even when
//     the customer is meant to be recurring: previously no scheduling
//     info was sent at all, so Jobber had nothing to make it recurring
//     from.
export async function createJobberJob(params: {
  propertyId: string;
  title: string;
  instructions?: string | null;
  price?: number | null;
  startDate?: string | null;
  recurrence?: RecurrenceFrequency | null;
}): Promise<MutationOutcome<{ jobId: string; jobNumber: string | null }>> {
  const { propertyId, title, instructions, price, startDate, recurrence } =
    params;

  const input: Record<string, unknown> = {
    propertyId,
    title,
    invoicing: {
      invoicingType: "FIXED_PRICE",
      invoicingSchedule: "NEVER",
    },
  };

  if (instructions) {
    input.instructions = instructions;
  }

  if (typeof price === "number" && Number.isFinite(price) && price > 0) {
    input.lineItems = [
      {
        name: title,
        category: "SERVICE",
        unitPrice: price,
        quantity: 1,
        saveToProductsAndServices: false,
      },
    ];
  }

  if (startDate) {
    input.timeframe = {
      startAt: startDate,
      // Jobber requires a duration on the timeframe whenever
      // scheduling.recurrence is set (confirmed live: "If scheduling
      // recurrence is informed, duration is required."), with no
      // "indefinite" option in DurationUnit (DAYS/WEEKS/MONTHS/YEARS).
      // Defaulting every recurring job to a 1-year window rather than
      // adding a duration field to the form — most recurring lawn-care
      // contracts don't have a hard end date anyway, and staff can
      // extend or adjust the recurring schedule in Jobber same as they
      // already adjust pricing/scope there.
      ...(recurrence ? { durationValue: 1, durationUnits: "YEARS" } : {}),
    };
    input.scheduling = {
      createVisits: true,
      notifyTeam: false,
      ...(recurrence ? { recurrence: RECURRENCE_RULES[recurrence] } : {}),
    };
  }

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
