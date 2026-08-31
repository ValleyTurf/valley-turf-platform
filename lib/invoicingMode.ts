// Stage 7 bucketing: does a Jobber client have a card on file in Jobber
// right now? Confirmed via the diagnostic route
// (app/api/jobber/diagnostic-payment-methods?names=...) against 6 real
// customers with known card-on-file status (Mackenzie Wolpe, Caroline
// Tade, Sarah Gombert, Cliff English = yes; Patrick Durkin, Nadine
// Tillawi = no) that Jobber's Job.willClientBeAutomaticallyCharged
// field, read on the client's UPCOMING job specifically, matches
// reality 6/6 -- it's true only on the current upcoming job for
// autopay customers, and false on already-completed/archived jobs
// regardless (since those either already got charged or the flag no
// longer applies once a job is done).
//
// There's no server-side job status filter available on Client.jobs
// that this app's Jobber API version accepts (a guessed
// ACTIVE_OR_UPCOMING filter value errored: "Expected type
// JobStatusTypeEnum"), so this pulls a page of recent jobs and filters
// client-side on jobStatus === "upcoming", which is the literal value
// Jobber returned in every real response seen so far.
import "server-only";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export type InvoicingModeSource = "auto_no_card" | "auto_has_card" | "manual";

type ClientJobsResponse = {
  client: {
    id: string;
    name: string;
    jobs: {
      nodes: {
        id: string;
        jobNumber: number | string | null;
        jobStatus: string | null;
        willClientBeAutomaticallyCharged: boolean | null;
      }[];
    };
  } | null;
};

const CLIENT_JOBS_QUERY = `
  query ClientUpcomingAutocharge($id: EncodedId!) {
    client(id: $id) {
      id
      name
      jobs(first: 20) {
        nodes {
          id
          jobNumber
          jobStatus
          willClientBeAutomaticallyCharged
        }
      }
    }
  }
`;

// Returns true/false once we found at least one upcoming job to check,
// or null if the client has no upcoming job at all (treated the same
// as "false" -- no card on file -- by callers, per Ryan's rule, but
// kept distinct here so the backfill can report it separately).
export async function checkClientHasCardOnFile(
  jobberClientId: string
): Promise<{ hasCardOnFile: boolean | null; error: string | null }> {
  const { data, errors } = await jobberGraphQL<ClientJobsResponse>(CLIENT_JOBS_QUERY, {
    id: jobberClientId,
  });

  if (errors?.length) {
    return { hasCardOnFile: null, error: errors.map((e) => e.message).join("; ") };
  }

  const jobs = data?.client?.jobs?.nodes ?? [];
  const upcomingJobs = jobs.filter((j) => j.jobStatus === "upcoming");

  if (upcomingJobs.length === 0) {
    return { hasCardOnFile: null, error: null };
  }

  const hasCardOnFile = upcomingJobs.some((j) => j.willClientBeAutomaticallyCharged === true);
  return { hasCardOnFile, error: null };
}

export type InvoicingModeRow = {
  jobber_client_id: string;
  full_name: string | null;
  native_invoicing_enabled: boolean;
  invoicing_mode_source: InvoicingModeSource | null;
};

// By default only customers never evaluated at all (invoicing_mode_source
// is null) -- so re-running the route after a partial run/timeout is
// free to just pick up where it left off. Pass includeStaleAuto=true to
// also re-check rows the backfill previously set itself (auto_no_card /
// auto_has_card), e.g. if a customer's Jobber card status has since
// changed -- this never touches a staff-set 'manual' row either way.
export async function getCustomersNeedingInvoicingModeBackfill(
  includeStaleAuto = false
): Promise<{ jobber_client_id: string }[]> {
  let query = supabaseServer
    .from("customers")
    .select("jobber_client_id")
    .not("jobber_client_id", "is", null);

  query = includeStaleAuto
    ? query.or("invoicing_mode_source.is.null,invoicing_mode_source.eq.auto_no_card,invoicing_mode_source.eq.auto_has_card")
    : query.is("invoicing_mode_source", null);

  const { data, error } = await query;

  if (error) throw new Error(`Failed reading customers: ${error.message}`);

  return (data ?? []).map((row) => ({ jobber_client_id: row.jobber_client_id as string }));
}

export async function setInvoicingMode(
  jobberClientId: string,
  nativeEnabled: boolean,
  source: InvoicingModeSource
): Promise<{ error: string | null }> {
  const { error } = await supabaseServer
    .from("customers")
    .update({ native_invoicing_enabled: nativeEnabled, invoicing_mode_source: source })
    .eq("jobber_client_id", jobberClientId);

  return { error: error?.message ?? null };
}

export async function listInvoicingModeRows(): Promise<InvoicingModeRow[]> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, native_invoicing_enabled, invoicing_mode_source")
    .not("jobber_client_id", "is", null)
    .order("full_name", { ascending: true });

  if (error) throw new Error(`Failed reading customers: ${error.message}`);

  return (data ?? []).map((row) => ({
    jobber_client_id: row.jobber_client_id as string,
    full_name: row.full_name as string | null,
    native_invoicing_enabled: Boolean(row.native_invoicing_enabled),
    invoicing_mode_source: (row.invoicing_mode_source as InvoicingModeSource | null) ?? null,
  }));
}
