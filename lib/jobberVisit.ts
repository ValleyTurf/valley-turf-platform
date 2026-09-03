// Visit-level Jobber mutations — a visit is its own entity distinct from
// the job it belongs to (see lib/jobberJob.ts for job-level mutations).
// Built for skip/reschedule-a-single-visit and the schedule page's
// month-view drag-and-drop, both of which need to move or remove exactly
// ONE occurrence without touching the job's recurring plan or any other
// visit — jobClose (lib/jobberJob.ts's cancelJobberJob) operates on
// every future visit at once, which is the wrong tool for this.
//
// Mutation names/shapes confirmed via three rounds of live introspection
// (the visit-schema-check diagnostic route, since deleted):
//   - visitEditSchedule(id, input: VisitEditScheduleInput!) — moves a
//     single visit's start/end. Each of startAt/endAt is its own
//     LocalDateTimeAttributes { date: ISO8601Date!, time: ISO8601Time,
//     timezone: Timezone! } — a wall-clock date+time+zone triple, not a
//     UTC instant, which is why callers pass Phoenix-local date/time
//     strings rather than ISO timestamps.
//   - visitDelete(visitIds: [EncodedId!]!) — removes one or more visit
//     occurrences outright. This IS "skip": Jobber has no separate
//     "skip this one" primitive: deleting the single visit is the
//     mechanism, and it doesn't touch the job or its other visits.
import "server-only";
import { jobberGraphQL } from "@/lib/jobber";
import { isNativeId } from "@/lib/nativeJobs";

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// This business operates only in Phoenix, which doesn't observe DST, so
// this is always correct as a fixed identifier — same assumption already
// made throughout the app (see schedule/page.tsx's getPhoenixToday, etc).
const BUSINESS_TIMEZONE = "America/Phoenix";

const VISIT_EDIT_SCHEDULE_MUTATION = `
  mutation EditVisitSchedule($id: EncodedId!, $input: VisitEditScheduleInput!) {
    visitEditSchedule(id: $id, input: $input) {
      visit {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

export async function rescheduleJobberVisit(params: {
  visitId: string;
  date: string; // YYYY-MM-DD, Phoenix-local
  startTime: string | null; // HH:MM, Phoenix-local
  endTime: string | null; // HH:MM, Phoenix-local
}): Promise<MutationOutcome<null>> {
  const { visitId, date, startTime, endTime } = params;

  // Tier 2 (Jobber Independence Roadmap) — a native visit (see
  // lib/nativeJobs.ts) never existed in Jobber, so there's no mutation to
  // call. The action files that call this (schedule/actions.ts's
  // rescheduleVisit) already write the local jobber_visits row themselves
  // right after this returns ok — for a Jobber-sourced visit that's a
  // deliberate "don't make staff wait for the webhook" optimization; for
  // a native visit it's simply the only place that write happens at all.
  // Short-circuiting here means that one shared code path handles both.
  if (isNativeId(visitId)) {
    return { ok: true, value: null };
  }

  const input: Record<string, unknown> = {};

  if (startTime) {
    input.startAt = {
      date,
      time: `${startTime}:00`,
      timezone: BUSINESS_TIMEZONE,
    };
  }

  if (endTime) {
    input.endAt = {
      date,
      time: `${endTime}:00`,
      timezone: BUSINESS_TIMEZONE,
    };
  }

  if (!input.startAt && !input.endAt) {
    return { ok: false, error: "Nothing to reschedule." };
  }

  const { data, errors } = await jobberGraphQL<{
    visitEditSchedule: {
      visit: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(VISIT_EDIT_SCHEDULE_MUTATION, { id: visitId, input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.visitEditSchedule?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  if (!data?.visitEditSchedule?.visit?.id) {
    return { ok: false, error: "Jobber did not confirm the reschedule." };
  }

  return { ok: true, value: null };
}

const VISIT_DELETE_MUTATION = `
  mutation DeleteVisit($visitIds: [EncodedId!]!) {
    visitDelete(visitIds: $visitIds) {
      userErrors {
        message
      }
    }
  }
`;

export async function skipJobberVisit(
  visitId: string
): Promise<MutationOutcome<null>> {
  // Same reasoning as rescheduleJobberVisit above — schedule/actions.ts's
  // skipVisit already deletes the local jobber_visits row (and its
  // material/equipment usage) itself right after this returns ok, which
  // is exactly what "skip" means for a native visit too.
  if (isNativeId(visitId)) {
    return { ok: true, value: null };
  }

  const { data, errors } = await jobberGraphQL<{
    visitDelete: { userErrors: { message: string }[] } | null;
  }>(VISIT_DELETE_MUTATION, { visitIds: [visitId] });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.visitDelete?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  return { ok: true, value: null };
}

// visitComplete(visitId, input: VisitCompleteInput) — input's own type
// isn't wrapped in NON_NULL in the schema (confirmed during the same
// round-1 visit-mutation introspection that found visitEditSchedule/
// visitDelete), meaning the argument itself is optional. Marking a stop
// done from My Day doesn't need anything beyond "complete it now," so
// this omits input entirely rather than spending a round of
// introspection on VisitCompleteInput's fields for something unused.
const VISIT_COMPLETE_MUTATION = `
  mutation CompleteVisit($visitId: EncodedId!) {
    visitComplete(visitId: $visitId) {
      visit {
        id
        visitStatus
        completedAt
      }
      userErrors {
        message
      }
    }
  }
`;

export async function completeJobberVisit(
  visitId: string
): Promise<MutationOutcome<{ completedAt: string | null }>> {
  // Same reasoning as rescheduleJobberVisit/skipJobberVisit above —
  // my-day/actions.ts's completeVisit already writes visit_status/
  // completed_at onto the local jobber_visits row itself right after
  // this returns ok, falling back to "now" when completedAt is null
  // exactly like it already does for a Jobber-sourced visit whenever
  // Jobber's response doesn't include one.
  if (isNativeId(visitId)) {
    return { ok: true, value: { completedAt: null } };
  }

  const { data, errors } = await jobberGraphQL<{
    visitComplete: {
      visit: { id: string; visitStatus: string | null; completedAt: string | null } | null;
      userErrors: { message: string }[];
    } | null;
  }>(VISIT_COMPLETE_MUTATION, { visitId });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.visitComplete?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  return {
    ok: true,
    value: { completedAt: data?.visitComplete?.visit?.completedAt ?? null },
  };
}
