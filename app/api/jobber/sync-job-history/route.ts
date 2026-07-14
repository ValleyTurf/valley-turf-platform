import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type JobberClient = {
  id: string;
};

type JobberJob = {
  id: string;
  createdAt: string | null;
  completedAt: string | null;
  jobStatus: string | null;
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

type CustomerJobHistory = {
  jobberClientId: string;
  firstJobAt: string | null;
  lastJobAt: string | null;
  totalJobs: number;
  totalCompletedJobs: number;
};

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
        createdAt
        completedAt
        jobStatus

        client {
          id
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

function isThrottled<T>(
  response: JobberGraphQLResponse<T>
): boolean {
  return Boolean(
    response.errors?.some(
      (error) =>
        error.message.toLowerCase().includes("throttled") ||
        error.extensions?.code === "THROTTLED"
    )
  );
}

function isCompletedJob(job: JobberJob): boolean {
  if (job.completedAt) {
    return true;
  }

  return (
    job.jobStatus?.toLowerCase() === "completed"
  );
}

function getJobDate(job: JobberJob): string | null {
  return job.completedAt || job.createdAt;
}

async function getJobsPage(
  cursor: string | null,
  pageNumber: number
): Promise<JobberGraphQLResponse<JobsPage>> {
  let retryNumber = 0;

  while (retryNumber <= MAX_THROTTLE_RETRIES) {
    const response = await jobberGraphQL<JobsPage>(
      JOBS_QUERY,
      {
        limit: JOB_BATCH_SIZE,
        cursor,
      }
    );

    if (!isThrottled(response)) {
      return response;
    }

    retryNumber += 1;

    if (retryNumber > MAX_THROTTLE_RETRIES) {
      throw new Error(
        `Jobber remained throttled after ${MAX_THROTTLE_RETRIES} retries on job page ${pageNumber}.`
      );
    }

    console.warn(
      `Jobber throttled job page ${pageNumber}. Retry ${retryNumber}/${MAX_THROTTLE_RETRIES}.`
    );

    await sleep(
      THROTTLE_RETRY_DELAY_MS * retryNumber
    );
  }

  throw new Error(
    `Unable to load Jobber job page ${pageNumber}.`
  );
}

function addJobToHistory(
  history: Map<string, CustomerJobHistory>,
  job: JobberJob
) {
  const jobberClientId = job.client?.id;

  if (!jobberClientId) {
    return;
  }

  const jobDate = getJobDate(job);
  const completed = isCompletedJob(job);

  const existing = history.get(jobberClientId) ?? {
    jobberClientId,
    firstJobAt: null,
    lastJobAt: null,
    totalJobs: 0,
    totalCompletedJobs: 0,
  };

  existing.totalJobs += 1;

  if (completed) {
    existing.totalCompletedJobs += 1;
  }

  if (jobDate) {
    const jobTime = new Date(jobDate).getTime();

    if (
      !existing.firstJobAt ||
      jobTime < new Date(existing.firstJobAt).getTime()
    ) {
      existing.firstJobAt = jobDate;
    }

    if (
      !existing.lastJobAt ||
      jobTime > new Date(existing.lastJobAt).getTime()
    ) {
      existing.lastJobAt = jobDate;
    }
  }

  history.set(jobberClientId, existing);
}

async function updateCustomers(
  history: Map<string, CustomerJobHistory>
) {
  let customersUpdated = 0;
  let customersNotFound = 0;

  for (const customerHistory of history.values()) {
    const { data, error } = await supabaseServer
      .from("customers")
      .update({
        first_job_at: customerHistory.firstJobAt,
        last_job_at: customerHistory.lastJobAt,
        total_jobs: customerHistory.totalJobs,
        total_completed_jobs:
          customerHistory.totalCompletedJobs,
      })
      .eq(
        "jobber_client_id",
        customerHistory.jobberClientId
      )
      .select("id");

    if (error) {
      throw new Error(
        `Supabase failed updating Jobber client ${customerHistory.jobberClientId}: ${error.message}`
      );
    }

    if (!data || data.length === 0) {
      customersNotFound += 1;
      continue;
    }

    customersUpdated += data.length;
  }

  return {
    customersUpdated,
    customersNotFound,
  };
}

async function syncJobHistory() {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;
  let jobsReceived = 0;

  const history =
    new Map<string, CustomerJobHistory>();

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 500) {
      warnings.push(
        "Job history sync stopped after 500 pages for safety."
      );

      break;
    }

    console.log(
      `Syncing Jobber job page ${pageNumber}...`
    );

    const response = await getJobsPage(
      cursor,
      pageNumber
    );

    if (response.errors?.length) {
      const message = response.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(
        message ||
          `Jobber job sync failed on page ${pageNumber}.`
      );
    }

    const jobs =
      response.data?.jobs?.nodes ?? [];

    const pageInfo =
      response.data?.jobs?.pageInfo;

    jobsReceived += jobs.length;

    for (const job of jobs) {
      addJobToHistory(history, job);
    }

    console.log(
      `Job page ${pageNumber} complete. ${jobsReceived} jobs received so far.`
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

  console.log(
    `Job history loaded for ${history.size} Jobber clients. Updating Supabase...`
  );

  const updateResult =
    await updateCustomers(history);

  return {
    jobsReceived,
    customersWithJobHistory: history.size,
    ...updateResult,
    pagesProcessed: pageNumber,
    warnings,
  };
}

export async function GET() {
  try {
    const syncResult = await syncJobHistory();

    return NextResponse.json({
      success: true,
      message:
        "Jobber customer job history synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error(
      "Jobber job history sync failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown job history sync error occurred.",
      },
      { status: 500 }
    );
  }
}