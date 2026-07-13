import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

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
  updated_at: string;
};

function cleanText(value: string | number | null | undefined): string | null {
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
    updated_at: new Date().toISOString(),
  };
}

async function syncJobs() {
  const batchSize = 50;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let jobsReceived = 0;
  let jobsSaved = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 100) {
      warnings.push("Sync stopped after 100 pages for safety.");
      break;
    }

    const jobberResponse: JobberGraphQLResponse<JobsPage> =
      await jobberGraphQL<JobsPage>(
        `
          query GetJobsPage($limit: Int!, $cursor: String) {
            jobs(first: $limit, after: $cursor) {
              nodes {
                id
                jobNumber
                title
                jobStatus
                jobType
                jobberWebUri
                endAt

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
        `,
        {
          limit: batchSize,
          cursor,
        }
      );

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(message || `Jobber failed on page ${pageNumber}.`);
    }

    const jobs = jobberResponse.data?.jobs?.nodes ?? [];
    const pageInfo = jobberResponse.data?.jobs?.pageInfo;

    jobsReceived += jobs.length;

    if (jobs.length > 0) {
      const jobRows = jobs.map(formatJob);

      const { error: upsertError } = await supabaseServer
        .from("jobber_jobs")
        .upsert(jobRows, {
          onConflict: "jobber_job_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on page ${pageNumber}: ${upsertError.message}`
        );
      }

      jobsSaved += jobRows.length;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }
  }

  return {
    jobsReceived,
    jobsSaved,
    pagesProcessed: pageNumber,
    warnings,
  };
}

export async function GET() {
  try {
    const syncResult = await syncJobs();

    return NextResponse.json({
      success: true,
      message: "Jobber jobs synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber job sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown job sync error occurred.",
      },
      { status: 500 }
    );
  }
}
