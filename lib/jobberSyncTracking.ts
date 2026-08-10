// Shared plumbing for the Jobber sync routes (sync-customers, sync-jobs,
// sync-invoices, sync-payments, sync-visits). Each route used to
// hand-roll its own copy of "check nothing else is running / write a
// jobber_sync_runs row / mirror it into jobber_sync_status / handle
// throttling with a retry loop" — this was drifting (sync-payments'
// throttle check didn't look at GraphQL error codes the way the others
// did, and sync-visits had none of this at all). Consolidated here so a
// fix only needs to happen in one place.
import { supabaseServer } from "@/lib/supabase-server";

export type SyncResultSummary = {
  recordsReceived: number;
  recordsSaved: number;
  pagesProcessed: number;
  throttleRetries: number;
  metadata?: Record<string, unknown>;
};

type GraphQLError = {
  message: string;
  extensions?: {
    code?: string;
  };
};

type GraphQLResponse<T> = {
  data: T | null;
  errors: GraphQLError[] | null;
};

// True whether Jobber signals throttling via the GraphQL error message
// text ("throttled", used consistently by lib/jobber.ts for both HTTP
// 429s and REST-style throttle messages) or via extensions.code.
export function isThrottledError(
  errors: GraphQLError[] | null | undefined
): boolean {
  return Boolean(
    errors?.some(
      (error) =>
        error.message.toLowerCase().includes("throttled") ||
        error.extensions?.code === "THROTTLED"
    )
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export type RetryOptions = {
  pageNumber: number;
  maxRetries?: number;
  retryDelayMs?: number;
  label?: string;
};

// Retries a single Jobber GraphQL page fetch while it keeps coming back
// throttled, with linearly-increasing backoff. Returns the eventual
// response (throttled or not) plus how many retries it took.
export async function fetchPageWithThrottleRetry<T>(
  fetchPage: () => Promise<GraphQLResponse<T>>,
  { pageNumber, maxRetries = 5, retryDelayMs = 3000, label = "page" }: RetryOptions
): Promise<{ response: GraphQLResponse<T>; throttleRetries: number }> {
  let retryNumber = 0;

  while (retryNumber <= maxRetries) {
    const response = await fetchPage();

    if (!isThrottledError(response.errors)) {
      return { response, throttleRetries: retryNumber };
    }

    retryNumber += 1;

    if (retryNumber > maxRetries) {
      throw new Error(
        `Jobber remained throttled after ${maxRetries} retries on ${label} ${pageNumber}.`
      );
    }

    const waitTime = retryDelayMs * retryNumber;

    console.warn(
      `Jobber throttled ${label} ${pageNumber}. Retry ${retryNumber}/${maxRetries} in ${waitTime}ms.`
    );

    await sleep(waitTime);
  }

  throw new Error(`Unable to load Jobber ${label} ${pageNumber}.`);
}

export type AlreadyRunningStatus = {
  lastStartedAt: string | null;
};

// A run stuck on "running" past this age almost certainly didn't fail
// gracefully — it got hard-killed by Vercel's function time limit before
// its own catch block (and failSyncRun) ever ran, which permanently wedges
// every future run behind a lock that's never released (confirmed live:
// sync-payments got stuck "running" on Aug 4 and every cron-triggered
// attempt since then silently no-op'd with "already running" for 6 days,
// with no error ever recorded anywhere). This treats a sufficiently old
// "running" row as orphaned and lets a new run start instead of requiring
// a manual SQL reset every time. Originally added only to
// sync-job-notes/route.ts; centralized here so every sync type that calls
// this shared helper (customers, jobs, invoices, payments, visits,
// job-notes) self-heals from this same failure mode, not just the one
// route it happened to be written for first.
const STALE_RUN_THRESHOLD_MS = 6 * 60 * 1000;

// Returns the "already running" info if a sync of this type is mid-run
// and that run isn't stale enough to be considered orphaned, or null if
// it's safe to start a new one.
export async function checkNotAlreadyRunning(
  syncType: string
): Promise<AlreadyRunningStatus | null> {
  const { data: currentStatus, error } = await supabaseServer
    .from("jobber_sync_status")
    .select("status, last_started_at")
    .eq("sync_type", syncType)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check current ${syncType} sync status: ${error.message}`
    );
  }

  if (currentStatus?.status === "running") {
    const startedAtMs = currentStatus.last_started_at
      ? new Date(currentStatus.last_started_at).getTime()
      : null;
    const isStale =
      startedAtMs !== null && Date.now() - startedAtMs > STALE_RUN_THRESHOLD_MS;

    if (!isStale) {
      return { lastStartedAt: currentStatus.last_started_at };
    }

    console.warn(
      `${syncType} sync stuck on "running" since ${currentStatus.last_started_at} — treating as orphaned and starting a new run.`
    );
  }

  return null;
}

export async function startSyncRun(syncType: string): Promise<string> {
  const startedAt = new Date().toISOString();

  const { data: syncRun, error: syncRunError } = await supabaseServer
    .from("jobber_sync_runs")
    .insert({
      sync_type: syncType,
      sync_mode: "manual",
      status: "running",
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    throw new Error(
      `Unable to start ${syncType} sync tracking: ${
        syncRunError?.message ?? "No sync run was created."
      }`
    );
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_sync_status")
    .upsert(
      {
        sync_type: syncType,
        status: "running",
        last_started_at: startedAt,
        last_error: null,
        updated_at: startedAt,
      },
      { onConflict: "sync_type", ignoreDuplicates: false }
    );

  if (statusError) {
    console.error(
      `Unable to update ${syncType} sync status to running:`,
      statusError
    );
  }

  return syncRun.id as string;
}

export async function completeSyncRun(
  syncType: string,
  syncRunId: string,
  result: SyncResultSummary
): Promise<void> {
  const completedAt = new Date().toISOString();

  const { error: syncRunError } = await supabaseServer
    .from("jobber_sync_runs")
    .update({
      status: "success",
      completed_at: completedAt,
      records_received: result.recordsReceived,
      records_saved: result.recordsSaved,
      pages_processed: result.pagesProcessed,
      throttle_retries: result.throttleRetries,
      metadata: result.metadata ?? {},
    })
    .eq("id", syncRunId);

  if (syncRunError) {
    console.error(
      `Unable to mark ${syncType} sync run successful:`,
      syncRunError
    );
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_sync_status")
    .upsert(
      {
        sync_type: syncType,
        status: "healthy",
        last_completed_at: completedAt,
        last_success_at: completedAt,
        records_received: result.recordsReceived,
        records_saved: result.recordsSaved,
        pages_processed: result.pagesProcessed,
        throttle_retries: result.throttleRetries,
        last_error: null,
        updated_at: completedAt,
      },
      { onConflict: "sync_type", ignoreDuplicates: false }
    );

  if (statusError) {
    console.error(
      `Unable to update ${syncType} sync status to healthy:`,
      statusError
    );
  }
}

export async function failSyncRun(
  syncType: string,
  syncRunId: string,
  errorMessage: string
): Promise<void> {
  const failedAt = new Date().toISOString();

  const { error: syncRunError } = await supabaseServer
    .from("jobber_sync_runs")
    .update({
      status: "failed",
      completed_at: failedAt,
      error_message: errorMessage,
    })
    .eq("id", syncRunId);

  if (syncRunError) {
    console.error(`Unable to mark ${syncType} sync run failed:`, syncRunError);
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_sync_status")
    .upsert(
      {
        sync_type: syncType,
        status: "failed",
        last_failed_at: failedAt,
        last_error: errorMessage,
        updated_at: failedAt,
      },
      { onConflict: "sync_type", ignoreDuplicates: false }
    );

  if (statusError) {
    console.error(
      `Unable to update ${syncType} sync status to failed:`,
      statusError
    );
  }
}
