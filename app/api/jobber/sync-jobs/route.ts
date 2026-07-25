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

type JobberClient = {
  id: string;
  name: string | null;
};

type JobberJob = {
  id: string;
  jobNumber: number | string | null;
  title: string | null;
  jobStatus: string | null;
  jobType: string | null;
  jobberWebUri: string | null;
  endAt: string | null;
  completedAt: string | null;
  client: JobberClient | null;
};

type JobsPage = {
  jobs: {
    nodes: JobberJob[];
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
    };
  };
};

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }> | null;
};

type JobUpsert = {
  jobber_job_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  job_number: string | null;
  job_status: string | null;
  job_type: string | null;
  jobber_web_uri: string | null;
  end_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type SyncResult = {
  jobsReceived: number;
  jobsSaved: number;
  pagesProcessed: number;
  throttleRetries: number;
  warnings: string[];
};

const SYNC_TYPE = "jobs";

const JOB_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 750;
const THROTTLE_RETRY_DELAY_MS = 3000;
const MAX_THROTTLE_RETRIES = 5;

const JOBS_QUERY = `
  query GetJobsPage(
    $limit: Int!
    $cursor: String
  ) {
    jobs(
      first: $limit
      after: $cursor
    ) {
      nodes {
        id
        jobNumber
        title
        jobStatus
        jobType
        jobberWebUri
        endAt
        completedAt

        client {
          id
          name
        }
      }

      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function cleanText(
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned ? cleaned : null;
}

function formatJob(job: JobberJob): JobUpsert {
  return {
    jobber_job_id: job.id,
    jobber_client_id: job.client?.id ?? null,
    customer_name: cleanText(job.client?.name),
    title: cleanText(job.title),
    job_number: cleanText(job.jobNumber),
    job_status: cleanText(job.jobStatus),
    job_type: cleanText(job.jobType),
    jobber_web_uri: cleanText(job.jobberWebUri),
    end_at: job.endAt ?? null,
    completed_at: job.completedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function getJobsPage(
  cursor: string | null,
  pageNumber: number
): Promise<{
  response: JobberGraphQLResponse<JobsPage>;
  throttleRetries: number;
}> {
  return fetchPageWithThrottleRetry<JobsPage>(
    () =>
      jobberGraphQL<JobsPage>(JOBS_QUERY, {
        limit: JOB_BATCH_SIZE,
        cursor,
      }),
    {
      pageNumber,
      maxRetries: MAX_THROTTLE_RETRIES,
      retryDelayMs: THROTTLE_RETRY_DELAY_MS,
      label: "job page",
    }
  );
}

async function syncJobs(): Promise<SyncResult> {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let jobsReceived = 0;
  let jobsSaved = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 100) {
      warnings.push(
        "Sync stopped after 100 pages for safety."
      );

      break;
    }

    console.log(
      `Syncing Jobber job page ${pageNumber}...`
    );

    const pageResult = await getJobsPage(
      cursor,
      pageNumber
    );

    const jobberResponse =
      pageResult.response;

    throttleRetries +=
      pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(
        message ||
          `Jobber failed on job page ${pageNumber}.`
      );
    }

    const jobs =
      jobberResponse.data?.jobs?.nodes ?? [];

    const pageInfo =
      jobberResponse.data?.jobs?.pageInfo;

    jobsReceived += jobs.length;

    if (jobs.length > 0) {
      const jobRows = jobs.map(formatJob);

      const { error: upsertError } =
        await supabaseServer
          .from("jobber_jobs")
          .upsert(jobRows, {
            onConflict: "jobber_job_id",
            ignoreDuplicates: false,
          });

      if (upsertError) {
        throw new Error(
          `Supabase failed on job page ${pageNumber}: ${upsertError.message}`
        );
      }

      jobsSaved += jobRows.length;
    }

    console.log(
      `Job page ${pageNumber} complete. Saved ${jobsSaved} jobs.`
    );

    hasNextPage =
      pageInfo?.hasNextPage ?? false;

    cursor =
      pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another job page after page ${pageNumber}, but no cursor was returned.`
      );

      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    jobsReceived,
    jobsSaved,
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
          message: "A Jobber job sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncJobs();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.jobsReceived,
      recordsSaved: syncResult.jobsSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings },
    });

    return NextResponse.json({
      success: true,
      message: "Jobber jobs synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber job sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown job sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}