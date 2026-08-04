// One-time (but safely rerunnable) backfill: pulls every note logged
// directly in Jobber, on every job, into jobber_job_notes — see
// 027_add_jobber_job_notes.sql for why these are job-level rather than
// attached to a specific visit (Jobber has no per-visit granularity for
// notes at all). Photos are downloaded and re-hosted in this app's own
// visit-photos storage bucket rather than linking Jobber's URLs
// directly, so they keep working even if Jobber's URLs expire or the
// Jobber connection is ever disconnected.
//
// Idempotent via upsert on jobber_note_id — safe to hit more than once
// if it times out partway through a large history, or to pick up notes
// added in Jobber after the first run.
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

// Each job's notes carry nested file attachments, so this query is
// heavier than the plain jobs sync — smaller page size, longer pace
// between pages, same reasoning as sync-payments.ts/sync-visits.ts.
const JOB_BATCH_SIZE = 20;
const NOTES_PER_JOB = 50;
const FILES_PER_NOTE = 10;
const PAGE_DELAY_MS = 1200;
const THROTTLE_RETRY_DELAY_MS = 3500;
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

async function syncJobNotes() {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let jobsReceived = 0;
  let notesReceived = 0;
  let notesSaved = 0;
  let photosStored = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 100) {
      warnings.push("Sync stopped after 100 job pages for safety.");
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
  };
}

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
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

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncJobNotes();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.notesReceived,
      recordsSaved: syncResult.notesSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings, photosStored: syncResult.photosStored },
    });

    return NextResponse.json({
      success: true,
      message: "Jobber job notes synchronized successfully.",
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
