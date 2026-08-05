// One-time (but safely rerunnable) backfill: pulls Jobber's own
// tracked labor time (Job > Labor section > time entries, confirmed
// live via the now-deleted property-labor-schema-check diagnostic
// route) into jobber_visit_labor — see 029_add_jobber_visit_labor.sql
// for why this is a separate table from this app's own
// visit_time_logs.
//
// IMPORTANT — this route will fail with a permissions error
// ("An object of type TimeSheetEntry was hidden due to permissions")
// until the Jobber app connection has time-tracking access enabled
// (checked in Jobber's Developer Center, then reconnect via
// /api/jobber/connect to pick up the new scope on a fresh token).
// Confirmed via an isolated introspection query during discovery —
// this is a real scope gap, not a bug in this route.
//
// Idempotent via upsert on jobber_visit_id, AND resumable via
// jobber_visit_labor_sync_state (030_add_visit_labor_sync_cursor.sql)
// — same reasoning as sync-job-notes: the jobs -> timeSheetEntries
// nested connection can get expensive under Jobber's cost-based
// throttling, so a full backfill may need more than one hit to this
// route. Keep hitting it until fullyCompleted: true.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  fetchPageWithThrottleRetry,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_TYPE = "visit_labor";

const JOB_BATCH_SIZE = 10;
const ENTRIES_PER_JOB = 50;
const PAGE_DELAY_MS = 1500;

const THROTTLE_RETRY_DELAY_MS = 4000;
const MAX_THROTTLE_RETRIES = 5;

const VISIT_LABOR_QUERY = `
  query GetVisitLaborPage($limit: Int!, $cursor: String, $entriesLimit: Int!) {
    jobs(first: $limit, after: $cursor) {
      nodes {
        id
        client {
          id
        }
        timeSheetEntries(first: $entriesLimit) {
          nodes {
            id
            finalDuration
            targetItem {
              __typename
              ... on Visit {
                id
              }
            }
          }
        }
      }

      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

type TimeSheetEntryNode = {
  id: string;
  finalDuration: number | null;
  targetItem: { __typename: string; id?: string } | null;
};

type JobberJobNode = {
  id: string;
  client: { id: string } | null;
  timeSheetEntries: { nodes: TimeSheetEntryNode[] } | null;
};

type VisitLaborPage = {
  jobs: {
    nodes: JobberJobNode[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
};

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: Array<{ message: string; extensions?: { code?: string } }> | null;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type SyncState = { cursor: string | null; completed: boolean };

async function readSyncState(): Promise<SyncState> {
  const { data } = await supabaseServer
    .from("jobber_visit_labor_sync_state")
    .select("cursor, completed")
    .eq("id", true)
    .maybeSingle();

  return { cursor: data?.cursor ?? null, completed: data?.completed ?? false };
}

async function writeSyncState(state: SyncState): Promise<void> {
  const { error } = await supabaseServer.from("jobber_visit_labor_sync_state").upsert(
    { id: true, cursor: state.cursor, completed: state.completed, updated_at: new Date().toISOString() },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (error) {
    console.error("Could not save visit-labor sync cursor:", error.message);
  }
}

async function getVisitLaborPage(
  cursor: string | null,
  pageNumber: number
): Promise<{ response: JobberGraphQLResponse<VisitLaborPage>; throttleRetries: number }> {
  return fetchPageWithThrottleRetry<VisitLaborPage>(
    () =>
      jobberGraphQL<VisitLaborPage>(VISIT_LABOR_QUERY, {
        limit: JOB_BATCH_SIZE,
        cursor,
        entriesLimit: ENTRIES_PER_JOB,
      }),
    { pageNumber, maxRetries: MAX_THROTTLE_RETRIES, retryDelayMs: THROTTLE_RETRY_DELAY_MS, label: "visit labor page" }
  );
}

async function syncVisitLabor(startCursor: string | null) {
  let cursor: string | null = startCursor;
  let hasNextPage = true;
  let pageNumber = 0;
  let fullyCompleted = false;

  let jobsReceived = 0;
  let entriesReceived = 0;
  let entriesAttributedToVisit = 0;
  let visitsUpdated = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 40) {
      warnings.push("Stopped after 40 pages this run — hit the route again to continue.");
      break;
    }

    const pageResult = await getVisitLaborPage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors.map((e) => e.message).filter(Boolean).join(", ");
      throw new Error(message || `Jobber failed on visit labor page ${pageNumber}.`);
    }

    const jobs = jobberResponse.data?.jobs?.nodes ?? [];
    const pageInfo = jobberResponse.data?.jobs?.pageInfo;
    jobsReceived += jobs.length;

    // Sum durations per visit within this page — a visit could in
    // theory show up more than once across jobs pages, but Jobber jobs
    // don't share visits, so per-page aggregation is safe here.
    const durationByVisit = new Map<string, { jobberJobId: string; jobberClientId: string; seconds: number; count: number }>();

    for (const job of jobs) {
      const jobberClientId = job.client?.id ?? null;
      if (!jobberClientId) continue;

      const entries = job.timeSheetEntries?.nodes ?? [];
      entriesReceived += entries.length;

      for (const entry of entries) {
        if (entry.targetItem?.__typename !== "Visit" || !entry.targetItem.id) continue;
        if (typeof entry.finalDuration !== "number" || !Number.isFinite(entry.finalDuration)) continue;

        entriesAttributedToVisit += 1;

        const visitId = entry.targetItem.id;
        const existing = durationByVisit.get(visitId);
        if (existing) {
          existing.seconds += entry.finalDuration;
          existing.count += 1;
        } else {
          durationByVisit.set(visitId, {
            jobberJobId: job.id,
            jobberClientId,
            seconds: entry.finalDuration,
            count: 1,
          });
        }
      }
    }

    for (const [visitId, totals] of durationByVisit) {
      const { error: upsertError } = await supabaseServer.from("jobber_visit_labor").upsert(
        {
          jobber_visit_id: visitId,
          jobber_job_id: totals.jobberJobId,
          jobber_client_id: totals.jobberClientId,
          duration_seconds: Math.round(totals.seconds),
          entry_count: totals.count,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "jobber_visit_id", ignoreDuplicates: false }
      );

      if (upsertError) {
        warnings.push(`Could not save labor for visit ${visitId}: ${upsertError.message}`);
        continue;
      }

      visitsUpdated += 1;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(`Jobber reported another job page after page ${pageNumber}, but no cursor was returned.`);
      break;
    }

    fullyCompleted = !hasNextPage;
    await writeSyncState({ cursor, completed: fullyCompleted });

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    jobsReceived,
    entriesReceived,
    entriesAttributedToVisit,
    visitsUpdated,
    pagesProcessed: pageNumber,
    throttleRetries,
    warnings,
    fullyCompleted,
    nextCursor: cursor,
  };
}

const STALE_RUN_THRESHOLD_MS = 6 * 60 * 1000;
const SYNC_TIME_BUDGET_MS = 250_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function GET(request: Request) {
  let syncRunId: string | null = null;

  try {
    const restart = new URL(request.url).searchParams.get("restart") === "true";

    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      const startedAtMs = alreadyRunning.lastStartedAt ? new Date(alreadyRunning.lastStartedAt).getTime() : null;
      const isStale = startedAtMs !== null && Date.now() - startedAtMs > STALE_RUN_THRESHOLD_MS;

      if (!isStale) {
        return NextResponse.json(
          {
            success: false,
            alreadyRunning: true,
            message: "A Jobber visit-labor sync is already running.",
            lastStartedAt: alreadyRunning.lastStartedAt,
          },
          { status: 409 }
        );
      }

      console.warn(
        `Visit-labor sync stuck on "running" since ${alreadyRunning.lastStartedAt} — treating as orphaned and starting a new run.`
      );
    }

    if (restart) {
      await writeSyncState({ cursor: null, completed: false });
    }

    const state = await readSyncState();

    if (state.completed) {
      return NextResponse.json({
        success: true,
        alreadyComplete: true,
        message:
          "The visit-labor backfill already finished a full pass. Hit this route with ?restart=true to run it again.",
      });
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await withTimeout(
      syncVisitLabor(state.cursor),
      SYNC_TIME_BUDGET_MS,
      "Visit labor sync exceeded its time budget for this run. Progress through the last completed page was saved — hit the route again to resume."
    );

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.entriesReceived,
      recordsSaved: syncResult.visitsUpdated,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings, entriesAttributedToVisit: syncResult.entriesAttributedToVisit },
    });

    return NextResponse.json({
      success: true,
      message: syncResult.fullyCompleted
        ? "Jobber visit labor fully synchronized."
        : "Made progress, but not finished yet — hit this route again to continue.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber visit labor sync failed:", error);

    const errorMessage = error instanceof Error ? error.message : "An unknown visit labor sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
