// One-time (but safely rerunnable) import: Jobber's live schema
// (checked via the now-deleted property-labor-schema-check diagnostic
// route) confirmed every client's primary service property exposes a
// "Turf Size" custom field, and in every real sample it was a
// CustomFieldDropdown whose valueDropdown strings ("<300", "750-1000",
// etc.) are an EXACT match for this app's own turf_size_range preset
// options (see TurfSizeField.tsx's RANGE_OPTIONS) — Jobber and this
// app happen to already use the same range buckets. Also handles the
// Numeric/Text custom-field shapes defensively in case some
// properties were set up differently, even though every sample seen
// so far was a dropdown.
//
// Per the same "don't clobber a manual entry" reasoning as the gate
// code import (app/api/import/gate-codes/route.ts): only fills
// turf_size_range/turf_size_sqft when BOTH are currently blank. If
// staff already entered a size by hand, this leaves it alone.
//
// Idempotent via re-filtering to "still blank" on every write, AND
// resumable via jobber_turf_size_sync_state
// (031_add_turf_size_sync_cursor.sql) — the first version of this
// route had neither a cursor nor a time budget and wrote customers one
// at a time, sequentially, which was slow enough on a real account to
// blow straight through Vercel's function time limit as a raw 504
// (FUNCTION_INVOCATION_TIMEOUT) instead of a clean response. Fixed the
// same way sync-job-notes was: a proactive timeout that fails
// gracefully with progress saved, self-healing for a run that gets
// hard-killed anyway, and writes to Supabase running with bounded
// concurrency instead of one at a time.
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

const SYNC_TYPE = "turf_size";
const TURF_SIZE_LABEL = "turf size";

const CLIENT_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 500;
const THROTTLE_RETRY_DELAY_MS = 3000;
const MAX_THROTTLE_RETRIES = 5;

// How many customers.update() calls run at once per page. This is
// local Supabase traffic only (no extra Jobber calls), so it isn't
// subject to Jobber's throttling — the earlier all-sequential version
// is what actually caused the 504, not Jobber being slow.
const UPDATE_CONCURRENCY = 10;

// Same preset list as TurfSizeField.tsx's RANGE_OPTIONS — kept as a
// literal copy rather than a shared import since one lives in a
// client component (bundled to the browser) and this is a
// server-only route; duplicating a short constant list is simpler and
// safer than restructuring that boundary just for this.
const KNOWN_RANGE_OPTIONS = new Set([
  "<300",
  "300-500",
  "500-750",
  "750-1000",
  "1000-1250",
  "1250-1500",
  "1500-1750",
  "1750-2000",
  "2000-2250",
  "2250-2500",
  "2500-2750",
  "2750-3000",
  ">3000",
]);

const TURF_SIZE_QUERY = `
  query GetTurfSizePage($limit: Int!, $cursor: String) {
    clients(first: $limit, after: $cursor) {
      nodes {
        id
        clientProperties(first: 1) {
          nodes {
            customFields {
              ... on CustomFieldDropdown {
                label
                valueDropdown
              }
              ... on CustomFieldNumeric {
                label
                valueNumeric
              }
              ... on CustomFieldText {
                label
                valueText
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

type CustomFieldNode = {
  label: string | null;
  valueDropdown?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
};

type JobberClientNode = {
  id: string;
  clientProperties: { nodes: { customFields: CustomFieldNode[] }[] };
};

type TurfSizePage = {
  clients: {
    nodes: JobberClientNode[];
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

// Same bounded-concurrency pool used to fix sync-job-notes's photo
// downloads — here it's Supabase update() calls instead of fetches,
// but the problem it solves is identical: a plain sequential
// for-loop of awaited round trips scales linearly with customer count
// and is what actually timed out.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) return;

    results[index] = await worker(items[index]);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);

  return results;
}

function findTurfSizeField(client: JobberClientNode): CustomFieldNode | null {
  const property = client.clientProperties?.nodes?.[0];
  if (!property) return null;

  return (
    property.customFields.find((field) => (field.label ?? "").trim().toLowerCase() === TURF_SIZE_LABEL) ?? null
  );
}

// Returns which column to write and what value, or null if the field
// wasn't usable (blank dropdown, a range string that doesn't match our
// known presets, etc.) — better to skip than write something the
// TurfSizeField dropdown can't display.
function resolveTurfSizeValue(
  field: CustomFieldNode
): { range: string | null; sqft: number | null } | null {
  if (typeof field.valueDropdown === "string" && field.valueDropdown.trim()) {
    const value = field.valueDropdown.trim();
    if (KNOWN_RANGE_OPTIONS.has(value)) {
      return { range: value, sqft: null };
    }
    return null;
  }

  if (typeof field.valueNumeric === "number" && Number.isFinite(field.valueNumeric)) {
    return { range: null, sqft: field.valueNumeric };
  }

  if (typeof field.valueText === "string" && field.valueText.trim()) {
    const text = field.valueText.trim();
    if (KNOWN_RANGE_OPTIONS.has(text)) {
      return { range: text, sqft: null };
    }
    const asNumber = Number(text.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return { range: null, sqft: asNumber };
    }
  }

  return null;
}

type SyncState = { cursor: string | null; completed: boolean };

async function readSyncState(): Promise<SyncState> {
  const { data } = await supabaseServer
    .from("jobber_turf_size_sync_state")
    .select("cursor, completed")
    .eq("id", true)
    .maybeSingle();

  return { cursor: data?.cursor ?? null, completed: data?.completed ?? false };
}

async function writeSyncState(state: SyncState): Promise<void> {
  const { error } = await supabaseServer.from("jobber_turf_size_sync_state").upsert(
    { id: true, cursor: state.cursor, completed: state.completed, updated_at: new Date().toISOString() },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (error) {
    console.error("Could not save turf-size sync cursor:", error.message);
  }
}

async function getTurfSizePage(
  cursor: string | null,
  pageNumber: number
): Promise<{ response: JobberGraphQLResponse<TurfSizePage>; throttleRetries: number }> {
  return fetchPageWithThrottleRetry<TurfSizePage>(
    () => jobberGraphQL<TurfSizePage>(TURF_SIZE_QUERY, { limit: CLIENT_BATCH_SIZE, cursor }),
    { pageNumber, maxRetries: MAX_THROTTLE_RETRIES, retryDelayMs: THROTTLE_RETRY_DELAY_MS, label: "turf size page" }
  );
}

async function syncTurfSize(startCursor: string | null) {
  let cursor: string | null = startCursor;
  let hasNextPage = true;
  let pageNumber = 0;
  let fullyCompleted = false;

  let clientsReceived = 0;
  let turfSizeFieldsFound = 0;
  let customersUpdated = 0;
  let throttleRetries = 0;
  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    // Per-invocation cap, not a total cap — the cursor is saved after
    // every page below, so hitting this just means "come back and hit
    // the route again."
    if (pageNumber > 60) {
      warnings.push("Stopped after 60 pages this run — hit the route again to continue.");
      break;
    }

    const pageResult = await getTurfSizePage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors.map((e) => e.message).filter(Boolean).join(", ");
      throw new Error(message || `Jobber failed on turf size page ${pageNumber}.`);
    }

    const clients = jobberResponse.data?.clients?.nodes ?? [];
    const pageInfo = jobberResponse.data?.clients?.pageInfo;
    clientsReceived += clients.length;

    const candidates = clients
      .map((client) => {
        const turfField = findTurfSizeField(client);
        if (!turfField) return null;

        const resolved = resolveTurfSizeValue(turfField);
        if (!resolved) return null;

        return { clientId: client.id, resolved };
      })
      .filter((c): c is { clientId: string; resolved: { range: string | null; sqft: number | null } } => c !== null);

    turfSizeFieldsFound += candidates.length;

    const updateResults = await mapWithConcurrency(candidates, UPDATE_CONCURRENCY, async (candidate) => {
      // Only fill in when BOTH are currently blank — never overwrite a
      // manually entered size. .select() after .update() makes
      // Supabase return the rows that were actually changed, so we can
      // tell a real update apart from "matched nothing" (already had a
      // manual value, so the .or()/.is() filters excluded it).
      const { data, error } = await supabaseServer
        .from("customers")
        .update({
          turf_size_range: candidate.resolved.range,
          turf_size_sqft: candidate.resolved.sqft,
        })
        .eq("jobber_client_id", candidate.clientId)
        .or("turf_size_range.is.null,turf_size_range.eq.")
        .is("turf_size_sqft", null)
        .select("jobber_client_id");

      if (error) {
        return { updated: 0, warning: `Could not update turf size for ${candidate.clientId}: ${error.message}` };
      }

      return { updated: data?.length ?? 0, warning: null };
    });

    for (const result of updateResults) {
      customersUpdated += result.updated;
      if (result.warning) warnings.push(result.warning);
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(`Jobber reported another page after page ${pageNumber}, but no cursor was returned.`);
      break;
    }

    fullyCompleted = !hasNextPage;
    await writeSyncState({ cursor, completed: fullyCompleted });

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    clientsReceived,
    turfSizeFieldsFound,
    customersUpdated,
    pagesProcessed: pageNumber,
    throttleRetries,
    warnings,
    fullyCompleted,
    nextCursor: cursor,
  };
}

// Same self-healing + proactive-timeout pattern as sync-job-notes and
// sync-visit-labor — see those routes' comments for the full
// reasoning. maxDuration above is a hard kill with no cleanup, so
// SYNC_TIME_BUDGET_MS gives up on our own terms first.
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
            message: "A turf size sync is already running.",
            lastStartedAt: alreadyRunning.lastStartedAt,
          },
          { status: 409 }
        );
      }

      console.warn(
        `Turf-size sync stuck on "running" since ${alreadyRunning.lastStartedAt} — treating as orphaned and starting a new run.`
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
        message: "The turf-size sync already finished a full pass. Hit this route with ?restart=true to run it again.",
      });
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await withTimeout(
      syncTurfSize(state.cursor),
      SYNC_TIME_BUDGET_MS,
      "Turf size sync exceeded its time budget for this run. Progress through the last completed page was saved — hit the route again to resume."
    );

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.clientsReceived,
      recordsSaved: syncResult.customersUpdated,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings, turfSizeFieldsFound: syncResult.turfSizeFieldsFound },
    });

    return NextResponse.json({
      success: true,
      message: syncResult.fullyCompleted
        ? "Jobber turf sizes fully synchronized."
        : "Made progress, but not finished yet — hit this route again to continue.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Turf size sync failed:", error);

    const errorMessage = error instanceof Error ? error.message : "An unknown turf size sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
