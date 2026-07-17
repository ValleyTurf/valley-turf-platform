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

async function syncVisits() {
  const batchSize = 50;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let visitsReceived = 0;
  let visitsSaved = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 150) {
      warnings.push("Sync stopped after 150 pages for safety.");
      break;
    }

    const jobberResponse: JobberGraphQLResponse<VisitsPage> =
      await jobberGraphQL<VisitsPage>(
        `
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

    // Visits are a much more expensive query than jobs/invoices/customers
    // (nested client/job/invoice sub-objects on every node), so pace
    // requests to avoid burning through the throttle budget mid-sync.
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
  }

  return {
    visitsReceived,
    visitsSaved,
    pagesProcessed: pageNumber,
    warnings,
  };
}

export async function GET() {
  try {
    const syncResult = await syncVisits();

    return NextResponse.json({
      success: true,
      message: "Jobber visits synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber visit sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown visit sync error occurred.",
      },
      { status: 500 }
    );
  }
}
