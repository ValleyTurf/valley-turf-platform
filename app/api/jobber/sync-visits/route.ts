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

const SYNC_TYPE = "visits";

// Visits are a much more expensive query than jobs/invoices/customers
// (nested client/job/invoice sub-objects on every node), so this uses a
// smaller batch size, a longer pace between pages, and a longer initial
// throttle-retry delay than the other sync routes' defaults.
const VISIT_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 1800;
const THROTTLE_RETRY_DELAY_MS = 4000;
const MAX_THROTTLE_RETRIES = 5;

const VISITS_QUERY = `
  query GetVisitsPage($limit: Int!, $cursor: String) {
    visits(first: $limit, after: $cursor) {
      nodes {
        id
        title
        visitStatus
        startAt
        endAt
        completedAt
        duration
        isLastScheduledVisit

        client {
          id
          name
        }

        job {
          id
          jobNumber
        }

        invoice {
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

type JobberClient = {
  id: string;
  name: string | null;
};

type JobberJob = {
  id: string;
  jobNumber: number | string | null;
};

type JobberInvoice = {
  id: string;
};

type JobberVisit = {
  id: string;
  title: string | null;
  visitStatus: string | null;
  startAt: string | null;
  endAt: string | null;
  completedAt: string | null;
  duration: number | string | null;
  isLastScheduledVisit: boolean | null;
  client: JobberClient | null;
  job: JobberJob | null;
  invoice: JobberInvoice | null;
};

type VisitsPage = {
  visits: {
    nodes: JobberVisit[];
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

type VisitUpsert = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  jobber_invoice_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  is_last_scheduled_visit: boolean | null;
  updated_at: string;
};

function cleanText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned ? cleaned : null;
}

function cleanNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatVisit(visit: JobberVisit): VisitUpsert {
  return {
    jobber_visit_id: visit.id,
    jobber_job_id: visit.job?.id ?? null,
    jobber_client_id: visit.client?.id ?? null,
    jobber_invoice_id: visit.invoice?.id ?? null,
    customer_name: cleanText(visit.client?.name),
    job_number: cleanText(visit.job?.jobNumber),
    title: cleanText(visit.title),
    visit_status: cleanText(visit.visitStatus),
    start_at: visit.startAt ?? null,
    end_at: visit.endAt ?? null,
    completed_at: visit.completedAt ?? null,
    duration_minutes: cleanNumber(visit.duration),
    is_last_scheduled_visit: visit.isLastScheduledVisit ?? null,
    updated_at: new Date().toISOString(),
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getVisitsPage(
  cursor: string | null,
  pageNumber: number
): Promise<{
  response: JobberGraphQLResponse<VisitsPage>;
  throttleRetries: number;
}> {
  return fetchPageWithThrottleRetry<VisitsPage>(
    () =>
      jobberGraphQL<VisitsPage>(VISITS_QUERY, {
        limit: VISIT_BATCH_SIZE,
        cursor,
      }),
    {
      pageNumber,
      maxRetries: MAX_THROTTLE_RETRIES,
      retryDelayMs: THROTTLE_RETRY_DELAY_MS,
      label: "visit page",
    }
  );
}

async function syncVisits() {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let visitsReceived = 0;
  let visitsSaved = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 150) {
      warnings.push("Sync stopped after 150 pages for safety.");
      break;
    }

    const pageResult = await getVisitsPage(cursor, pageNumber);
    const jobberResponse = pageResult.response;

    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(message || `Jobber failed on page ${pageNumber}.`);
    }

    const visits = jobberResponse.data?.visits?.nodes ?? [];
    const pageInfo = jobberResponse.data?.visits?.pageInfo;

    visitsReceived += visits.length;

    if (visits.length > 0) {
      const visitRows = visits.map(formatVisit);

      const { error: upsertError } = await supabaseServer
        .from("jobber_visits")
        .upsert(visitRows, {
          onConflict: "jobber_visit_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on page ${pageNumber}: ${upsertError.message}`
        );
      }

      visitsSaved += visitRows.length;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    visitsReceived,
    visitsSaved,
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
          message: "A Jobber visit sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncVisits();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.visitsReceived,
      recordsSaved: syncResult.visitsSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings },
    });

    return NextResponse.json({
      success: true,
      message: "Jobber visits synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber visit sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown visit sync error occurred.";

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
