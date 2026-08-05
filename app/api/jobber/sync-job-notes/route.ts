// One-time (but safely rerunnable) backfill: pulls every note logged
// directly in Jobber, on every job, into jobber_job_notes — see
// 027_add_jobber_job_notes.sql for why these are job-level rather than
// attached to a specific visit (Jobber has no per-visit granularity for
// notes at all). Photos are downloaded and re-hosted in this app's own
// visit-photos storage bucket rather than linking Jobber's URLs
// directly, so they keep working even if Jobber's URLs expire or the
// Jobber connection is ever disconnected.
//
// Idempotent via upsert on jobber_note_id, AND resumable via
// jobber_job_notes_sync_state (028_add_job_notes_sync_cursor.sql) — the
// cost-based throttling this query runs into forced small enough batch
// sizes that a full backfill routinely needs more than one hit to this
// route to finish. Just keep hitting it until the response says
// fullyCompleted: true; after that, ?restart=true starts over (e.g. to
// pick up new Jobber notes added since the last full pass).
//
// Not wired into the Vercel Cron rotation like sync-visits/sync-jobs/
// etc. — this is a deliberate one-time historical move-over, not an
// ongoing sync, per the original ask. Trigger it manually by hitting
// this route; add it to the cron schedule later if notes should also
// keep flowing in from Jobber on an ongoing basis.
import { NextResponse } from "next/server";
import { jobberGraphQL, getJobberAccessToken } from "@/lib/jobber";
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

const SYNC_TYPE = "job_notes";
const PHOTO_BUCKET = "visit-photos";

// Each job's notes carry TWO levels of nested connections (notes, then
// each note's fileAttachments) — Jobber's query-cost throttling counts
// the product of every `first` in the chain, so 20 jobs x 50 notes x
// 10 files (the original values here) priced this query high enough to
// get throttled on page 1 and stay throttled through every retry, not
// just occasionally rate-limited. Cut aggressively on all three, well
// below sync-payments.ts's already-cautious batch of 10 for its single
// level of nesting.
const JOB_BATCH_SIZE = 4;
const NOTES_PER_JOB = 15;
const FILES_PER_NOTE = 5;
const PAGE_DELAY_MS = 2500;

// Kept short enough that one page's worst-case retry time (sum of
// 4+8+12+16+20 = 60s here) leaves real headroom under
// SYNC_TIME_BUDGET_MS below for the fetch itself plus other pages —
// the original 8-retry/6s version could burn its entire 216s just
// retrying page 1, which is exactly how a run ended up stuck on
// "running" for 5+ minutes with nothing to show for it.
const THROTTLE_RETRY_DELAY_MS = 4000;
const MAX_THROTTLE_RETRIES = 5;

const JOB_NOTES_QUERY = `
  query GetJobNotesPage($limit: Int!, $cursor: String, $notesLimit: Int!, $filesLimit: Int!) {
    jobs(first: $limit, after: $cursor) {
      nodes {
        id
        jobNumber

        client {
          id
        }

        notes(first: $notesLimit) {
          edges {
            node {
              ... on JobNote {
                id
                message
                createdAt

                fileAttachments(first: $filesLimit) {
                  edges {
                    node {
                      id
                      fileName
                      contentType
                      downloadUrl
                      url
                    }
                  }
                }
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

type JobberFileAttachment = {
  id: string;
  fileName: string | null;
  contentType: string | null;
  downloadUrl: string | null;
  url: string | null;
};

type JobberJobNoteNode = {
  id: string;
  message: string | null;
  createdAt: string | null;
  fileAttachments: { edges: { node: JobberFileAttachment }[] } | null;
};

type JobberJobNode = {
  id: string;
  jobNumber: number | string | null;
  client: { id: string } | null;
  notes: { edges: { node: JobberJobNoteNode }[] } | null;
};

type JobNotesPage = {
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

function cleanText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

function extensionFor(fileName: string | null, contentType: string | null): string {
  const fromName = fileName ? /\.([a-zA-Z0-9]+)$/.exec(fileName) : null;
  if (fromName) return fromName[1].toLowerCase();

  if (contentType?.startsWith("image/")) {
    const subtype = contentType.split("/")[1];
    if (subtype) return subtype.split("+")[0].toLowerCase();
  }

  return "jpg";
}

// Jobber's file URLs might be pre-signed (usable as-is) or might expect
// the same bearer token the GraphQL API uses — tried in that order
// since a pre-signed URL is the more common vendor pattern and adding
// an unexpected Authorization header can itself break some pre-signed
// URLs. Only accepts a response that actually looks like an image;
// anything else (an HTML login page, a JSON error body) is treated as
// a failed download rather than silently stored as a "photo."
async function downloadAttachment(
  url: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  async function tryFetch(headers?: Record<string, string>) {
    try {
      return await fetch(url, headers ? { headers } : undefined);
    } catch {
      return null;
    }
  }

  let response = await tryFetch();

  if (!response || !response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) {
    const token = await getJobberAccessToken();
    if (token) {
      response = await tryFetch({ Authorization: `Bearer ${token}` });
    }
  }

  if (!response || !response.ok) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;

  const arrayBuffer = await response.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), contentType };
}

async function downloadAndStoreAttachments(
  jobberJobId: string,
  attachments: JobberFileAttachment[],
  warnings: string[]
): Promise<string[]> {
  const paths: string[] = [];

  for (const attachment of attachments) {
    const sourceUrl = attachment.downloadUrl ?? attachment.url;
    if (!sourceUrl) continue;

    const downloaded = await downloadAttachment(sourceUrl);
    if (!downloaded) {
      warnings.push(`Could not download attachment ${attachment.id} on job ${jobberJobId}.`);
      continue;
    }

    const ext = extensionFor(attachment.fileName, attachment.contentType ?? downloaded.contentType);
    const path = `jobber-import/${jobberJobId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseServer.storage
      .from(PHOTO_BUCKET)
      .upload(path, downloaded.bytes, {
        contentType: downloaded.contentType,
        upsert: true,
      });

    if (uploadError) {
      warnings.push(
        `Could not store attachment ${attachment.id} on job ${jobberJobId}: ${uploadError.message}`
      );
      continue;
    }

    paths.push(path);
  }

  return paths;
}

type SyncState = { cursor: string | null; completed: boolean };

// Single-row resumption state (028_add_job_notes_sync_cursor.sql) — see
// that migration's comment for why this exists: at the batch sizes
// Jobber's throttling forces here, a full backfill can easily span more
// than one request's time limit, so each run needs to pick up where the
// last one left off rather than restarting from page 1 every time.
async function readSyncState(): Promise<SyncState> {
  const { data } = await supabaseServer
    .from("jobber_job_notes_sync_state")
    .select("cursor, completed")
    .eq("id", true)
    .maybeSingle();

  return { cursor: data?.cursor ?? null, completed: data?.completed ?? false };
}

async function writeSyncState(state: SyncState): Promise<void> {
  const { error } = await supabaseServer.from("jobber_job_notes_sync_state").upsert(
    { id: true, cursor: state.cursor, completed: state.completed, updated_at: new Date().toISOString() },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (error) {
    console.error("Could not save job-notes sync cursor:", error.message);
  }
}

async function getJobNotesPage(
  cursor: string | null,
  pageNumber: number
): Promise<{ response: JobberGraphQLResponse<JobNotesPage>; throttleRetries: number }> {
  return fetchPageWithThrottleRetry<JobNotesPage>(
    () =>
      jobberGraphQL<JobNotesPage>(JOB_NOTES_QUERY, {
        limit: JOB_BATCH_SIZE,
        cursor,
        notesLimit: NOTES_PER_JOB,
        filesLimit: FILES_PER_NOTE,
      }),
    { pageNumber, maxRetries: MAX_THROTTLE_RETRIES, retryDelayMs: THROTTLE_RETRY_DELAY_MS, label: "job notes page" }
  );
}

async function syncJobNotes(startCursor: string | null) {
  let cursor: string | null = startCursor;
  let hasNextPage = true;
  let pageNumber = 0;
  let fullyCompleted = false;

  let jobsReceived = 0;
  let notesReceived = 0;
  let notesSaved = 0;
  let photosStored = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    // Per-invocation cap, not a total-history cap — this is deliberately
    // small enough to comfortably finish within one request's time
    // limit even in a worst case (every job's notes full of photos).
    // The cursor is saved after every page below, so hitting this just
    // means "come back and hit the route again"; nothing is lost.
    if (pageNumber > 25) {
      warnings.push("Stopped after 25 pages this run — hit the route again to continue.");
      break;
    }

    const pageResult = await getJobNotesPage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors.map((e) => e.message).filter(Boolean).join(", ");
      throw new Error(message || `Jobber failed on job notes page ${pageNumber}.`);
    }

    const jobs = jobberResponse.data?.jobs?.nodes ?? [];
    const pageInfo = jobberResponse.data?.jobs?.pageInfo;

    jobsReceived += jobs.length;

    for (const job of jobs) {
      const jobberClientId = job.client?.id ?? null;
      if (!jobberClientId) continue;

      const noteNodes = (job.notes?.edges ?? []).map((e) => e.node);
      notesReceived += noteNodes.length;

      for (const note of noteNodes) {
        const message = cleanText(note.message);
        const attachments = (note.fileAttachments?.edges ?? []).map((e) => e.node);

        const photoPaths =
          attachments.length > 0
            ? await downloadAndStoreAttachments(job.id, attachments, warnings)
            : [];

        if (!message && photoPaths.length === 0) continue;

        const { error: upsertError } = await supabaseServer.from("jobber_job_notes").upsert(
          {
            jobber_note_id: note.id,
            jobber_job_id: job.id,
            jobber_client_id: jobberClientId,
            job_number: cleanText(job.jobNumber),
            message,
            photo_paths: photoPaths,
            jobber_created_at: note.createdAt,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "jobber_note_id", ignoreDuplicates: false }
        );

        if (upsertError) {
          warnings.push(`Could not save note ${note.id} on job ${job.id}: ${upsertError.message}`);
          continue;
        }

        notesSaved += 1;
        photosStored += photoPaths.length;
      }
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(`Jobber reported another job page after page ${pageNumber}, but no cursor was returned.`);
      break;
    }

    // Persisted after every page (not just at the end) so a timeout or
    // crash mid-run only costs re-fetching the page in progress, not
    // the whole backfill.
    fullyCompleted = !hasNextPage;
    await writeSyncState({ cursor, completed: fullyCompleted });

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    jobsReceived,
    notesReceived,
    notesSaved,
    photosStored,
    pagesProcessed: pageNumber,
    throttleRetries,
    warnings,
    fullyCompleted,
    nextCursor: cursor,
  };
}

// A run stuck in "running" past this age almost certainly didn't fail
// gracefully — it got hard-killed by Vercel's function time limit
// before its own catch block (and failSyncRun) ever ran, which is
// exactly the failure mode SYNC_TIME_BUDGET_MS below is meant to
// prevent going forward. This lets the route self-heal from any run
// that got stuck before that fix, or from a genuinely wedged run,
// instead of requiring a manual SQL reset every time.
const STALE_RUN_THRESHOLD_MS = 6 * 60 * 1000;

// Vercel's maxDuration below is a hard kill with no cleanup — if the
// sync is still going this close to it, better to give up on our own
// terms (mark the run failed with a clear reason, respond to the
// request) than get silently killed and leave jobber_sync_status stuck
// on "running" forever.
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
      const startedAtMs = alreadyRunning.lastStartedAt
        ? new Date(alreadyRunning.lastStartedAt).getTime()
        : null;
      const isStale = startedAtMs !== null && Date.now() - startedAtMs > STALE_RUN_THRESHOLD_MS;

      if (!isStale) {
        return NextResponse.json(
          {
            success: false,
            alreadyRunning: true,
            message: "A Jobber job-notes sync is already running.",
            lastStartedAt: alreadyRunning.lastStartedAt,
          },
          { status: 409 }
        );
      }

      console.warn(
        `Job-notes sync stuck on "running" since ${alreadyRunning.lastStartedAt} — treating as orphaned and starting a new run.`
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
          "The job-notes backfill already finished a full pass. Hit this route with ?restart=true to run it again (e.g. to pick up new Jobber notes).",
      });
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await withTimeout(
      syncJobNotes(state.cursor),
      SYNC_TIME_BUDGET_MS,
      "Job notes sync exceeded its time budget for this run (likely stuck on a slow/throttled Jobber request). Progress through the last completed page was saved — hit the route again to resume."
    );

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.notesReceived,
      recordsSaved: syncResult.notesSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings, photosStored: syncResult.photosStored },
    });

    return NextResponse.json({
      success: true,
      message: syncResult.fullyCompleted
        ? "Jobber job notes fully synchronized."
        : "Made progress, but not finished yet — hit this route again to continue.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber job notes sync failed:", error);

    const errorMessage = error instanceof Error ? error.message : "An unknown job notes sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
