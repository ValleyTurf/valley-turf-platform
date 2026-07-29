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
      // Defaulting every recurring job to a 5-year window rather than
      // adding a duration field to the form — most recurring lawn-care
      // contracts don't have a hard end date anyway, and staff can
      // extend or adjust the recurring schedule in Jobber same as they
      // already adjust pricing/scope there.
      ...(recurrence ? { durationValue: 5, durationUnits: "YEARS" } : {}),
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

// ---------------------------------------------------------------------
// Everything below is for roadmap #8, "manage existing recurring jobs
// from this app" — editing an already-created job's title/instructions/
// price/schedule, and pausing (closing) or resuming (reopening) it.
// Mutation names/shapes confirmed via three rounds of live introspection
// against Jobber's real schema (the job-edit-schema-check diagnostic
// route, since deleted): jobEdit/jobEditLineItems/jobCreateLineItems/
// jobClose/jobReopen, none of which follow JobCreateAttributes' *Attributes
// convention except where explicitly noted below.
// ---------------------------------------------------------------------

export type JobDetails = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  instructions: string | null;
  jobStatus: string | null;
  lineItems: { id: string; name: string | null; unitPrice: number | null }[];
};

const JOB_DETAILS_QUERY = `
  query GetJobDetails($id: EncodedId!) {
    job(id: $id) {
      id
      jobNumber
      title
      instructions
      jobStatus
      lineItems(first: 5) {
        nodes {
          id
          name
          unitPrice
        }
      }
    }
  }
`;

export async function fetchJobDetails(
  jobId: string
): Promise<JobDetails | null> {
  try {
    const { data, errors } = await jobberGraphQL<{
      job: {
        id: string;
        jobNumber: string | number | null;
        title: string | null;
        instructions: string | null;
        jobStatus: string | null;
        lineItems: {
          nodes: { id: string; name: string | null; unitPrice: number | string | null }[];
        } | null;
      } | null;
    }>(JOB_DETAILS_QUERY, { id: jobId });

    if (errors?.length || !data?.job) return null;

    return {
      id: data.job.id,
      jobNumber: data.job.jobNumber != null ? String(data.job.jobNumber) : null,
      title: data.job.title,
      instructions: data.job.instructions,
      jobStatus: data.job.jobStatus,
      lineItems: (data.job.lineItems?.nodes ?? []).map((li) => ({
        id: li.id,
        name: li.name,
        unitPrice: li.unitPrice != null ? Number(li.unitPrice) : null,
      })),
    };
  } catch (error) {
    console.error("fetchJobDetails failed:", error);
    return null;
  }
}

// jobEdit(jobId, input: JobEditInput!) — confirmed via introspection to
// reuse the exact same TimeframeAttributes/JobSchedulingAttributes shapes
// JobCreateAttributes already uses for scheduling, so an existing job's
// recurring cadence can be changed with the same RECURRENCE_RULES this
// file already builds for jobCreate. Price is NOT part of JobEditInput —
// Jobber keeps line items on their own mutations (jobEditLineItems /
// jobCreateLineItems), called separately by setJobberJobPrice below.
const JOB_EDIT_MUTATION = `
  mutation EditJob($jobId: EncodedId!, $input: JobEditInput!) {
    jobEdit(jobId: $jobId, input: $input) {
      job { id jobNumber }
      userErrors { message }
    }
  }
`;

export async function editJobberJob(params: {
  jobId: string;
  title?: string | null;
  instructions?: string | null;
  startDate?: string | null;
  recurrence?: RecurrenceFrequency | null;
  updateSchedule?: boolean;
}): Promise<MutationOutcome<{ jobId: string }>> {
  const { jobId, title, instructions, startDate, recurrence, updateSchedule } =
    params;

  const input: Record<string, unknown> = {};

  if (title) {
    input.title = title;
  }

  // instructions is a plain nullable String — sending an empty string
  // clears it, same as any other text field, so unlike title (which
  // Jobber requires non-blank) this is allowed to be explicitly cleared.
  if (instructions !== undefined) {
    input.instructions = instructions ?? "";
  }

  // Only touch scheduling/timeframe when the caller explicitly opted in
  // (the edit form's "Update recurring schedule" toggle) — this app has
  // no reliable way to read a job's CURRENT cadence back out of Jobber to
  // show as a default, so rather than guess and risk silently resetting
  // an unrelated job's schedule, scheduling is only ever sent when staff
  // deliberately fill in a new start date/frequency.
  if (updateSchedule && startDate) {
    input.timeframe = {
      startAt: startDate,
      ...(recurrence ? { durationValue: 5, durationUnits: "YEARS" } : {}),
    };
    input.scheduling = {
      createVisits: true,
      notifyTeam: false,
      ...(recurrence ? { recurrence: RECURRENCE_RULES[recurrence] } : {}),
    };
  }

  if (Object.keys(input).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  const { data, errors } = await jobberGraphQL<{
    jobEdit: {
      job: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(JOB_EDIT_MUTATION, { jobId, input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.jobEdit?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  const job = data?.jobEdit?.job;
  if (!job?.id) {
    return { ok: false, error: "Jobber did not return a job id." };
  }

  return { ok: true, value: { jobId: job.id } };
}

// Price lives on the job's line items, not on the job itself. This app
// only ever creates a single flat-price line item per job (see
// createJobberJob above), so editing price here assumes that same
// shape: one existing line item gets its unitPrice updated
// (jobEditLineItems), or — if the job has none yet, e.g. it was created
// without a price — one gets added (jobCreateLineItems). A job with
// MORE than one line item (built up manually in Jobber) is left alone
// and reported back as an error rather than guessed at, since silently
// picking "the first one" could edit the wrong line of a real multi-line
// invoice.
const JOB_EDIT_LINE_ITEMS_MUTATION = `
  mutation EditJobLineItems($jobId: EncodedId!, $input: JobEditLineItemsInput!) {
    jobEditLineItems(jobId: $jobId, input: $input) {
      job { id }
      userErrors { message }
    }
  }
`;

// JobCreateLineItemsInput's shape isn't independently confirmed via
// introspection (inferred by symmetry with JobEditLineItemsInput, which
// IS confirmed: { lineItems: [Attributes!]! }) — if this guess is wrong,
// Jobber's own error on first live use will say so, same as every other
// mutation shape in this file that started as an introspected guess.
const JOB_CREATE_LINE_ITEMS_MUTATION = `
  mutation CreateJobLineItems($jobId: EncodedId!, $input: JobCreateLineItemsInput!) {
    jobCreateLineItems(jobId: $jobId, input: $input) {
      job { id }
      userErrors { message }
    }
  }
`;

export async function setJobberJobPrice(
  jobId: string,
  title: string,
  price: number
): Promise<MutationOutcome<null>> {
  const details = await fetchJobDetails(jobId);

  if (!details) {
    return { ok: false, error: "Couldn't load this job's current line items." };
  }

  if (details.lineItems.length > 1) {
    return {
      ok: false,
      error:
        "This job has more than one line item — edit its price directly in Jobber to avoid touching the wrong line.",
    };
  }

  if (details.lineItems.length === 1) {
    const { data, errors } = await jobberGraphQL<{
      jobEditLineItems: {
        job: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(JOB_EDIT_LINE_ITEMS_MUTATION, {
      jobId,
      input: {
        lineItems: [
          { lineItemId: details.lineItems[0].id, unitPrice: price },
        ],
      },
    });

    if (errors?.length) {
      return { ok: false, error: errors.map((e) => e.message).join("; ") };
    }

    const userErrors = data?.jobEditLineItems?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
    }

    return { ok: true, value: null };
  }

  const { data, errors } = await jobberGraphQL<{
    jobCreateLineItems: {
      job: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(JOB_CREATE_LINE_ITEMS_MUTATION, {
    jobId,
    input: {
      lineItems: [
        {
          name: title,
          category: "SERVICE",
          unitPrice: price,
          quantity: 1,
          saveToProductsAndServices: false,
        },
      ],
    },
  });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.jobCreateLineItems?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  return { ok: true, value: null };
}

// jobClose requires a decision on incomplete visits — Jobber only offers
// two, no plain "cancel future visits but leave past ones alone AND keep
// the job open" option:
//   - COMPLETE_PAST_DESTROY_FUTURE: marks already-past visits complete,
//     deletes upcoming ones. This is what "cancel this recurring
//     service" means in the UI — history stays, nothing further gets
//     scheduled.
//   - DESTROY_ALL: wipes past AND future visits. Not exposed in the UI
//     here; a customer canceling doesn't mean their service history
//     should disappear too.
// There's no "pause" primitive on Jobber's side — closing IS the pause,
// jobReopen is the resume. Reopening does not by itself regenerate a
// recurring schedule (the future visits jobClose destroyed are gone for
// good), so resuming a real recurring plan means reopening AND then
// setting a fresh schedule via editJobberJob.
const JOB_CLOSE_MUTATION = `
  mutation CloseJob($jobId: EncodedId!, $input: JobCloseInput!) {
    jobClose(jobId: $jobId, input: $input) {
      job { id }
      userErrors { message }
    }
  }
`;

export async function cancelJobberJob(
  jobId: string
): Promise<MutationOutcome<null>> {
  const { data, errors } = await jobberGraphQL<{
    jobClose: {
      job: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(JOB_CLOSE_MUTATION, {
    jobId,
    input: { modifyIncompleteVisitsBy: "COMPLETE_PAST_DESTROY_FUTURE" },
  });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.jobClose?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  return { ok: true, value: null };
}

const JOB_REOPEN_MUTATION = `
  mutation ReopenJob($jobId: EncodedId!) {
    jobReopen(jobId: $jobId) {
      job { id }
      userErrors { message }
    }
  }
`;

export async function reopenJobberJob(
  jobId: string
): Promise<MutationOutcome<null>> {
  const { data, errors } = await jobberGraphQL<{
    jobReopen: {
      job: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(JOB_REOPEN_MUTATION, { jobId });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.jobReopen?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  return { ok: true, value: null };
}
