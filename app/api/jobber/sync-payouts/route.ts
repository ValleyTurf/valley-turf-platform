// Syncs Jobber Payments payout records — where processing fees actually
// live (see supabase/migrations/021_add_jobber_payouts.sql for why this
// is a separate table/sync from sync-payments.ts's individual payment
// records). Same shape as every other sync-*.ts route in this app:
// paginate with jobberGraphQL + fetchPageWithThrottleRetry, upsert into
// Supabase, track the run via lib/jobberSyncTracking.ts.
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
export const maxDuration = 120;

const SYNC_TYPE = "payouts";

type JobberPayoutRecord = {
  id: string;
  identifier: string | null;
  status: string | null;
  payoutMethod: string | null;
  type: string | null;
  currency: string | null;
  grossAmount: number | null;
  feeAmount: number | null;
  netAmount: number | null;
  arrivalDate: string | null;
  createdAt: string | null;
};

type PayoutsPage = {
  payoutRecords: {
    nodes: JobberPayoutRecord[];
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
    };
  };
};

type GraphQLResult<T> = {
  data: T | null;
  errors: Array<{ message: string }> | null;
};

type PayoutUpsert = {
  jobber_payout_id: string;
  identifier: string | null;
  payout_status: string | null;
  payout_method: string | null;
  payout_type: string | null;
  currency: string | null;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  arrival_date: string | null;
  payout_created_at: string | null;
  updated_at: string;
};

const PAYOUT_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 500;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

function cleanDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// PayoutRecord's feeAmount/grossAmount/netAmount are typed as Int in
// Jobber's schema (unlike PaymentRecord.amount, a Float) — treated here
// as cents and converted to dollars. See this file's header + the
// migration's header for the full reasoning; verify against Jobber's
// own Payouts screen the first time this runs for real.
function centsToDollars(value: number | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function formatPayout(payout: JobberPayoutRecord): PayoutUpsert {
  return {
    jobber_payout_id: payout.id,
    identifier: cleanText(payout.identifier),
    payout_status: cleanText(payout.status),
    payout_method: cleanText(payout.payoutMethod),
    payout_type: cleanText(payout.type),
    currency: cleanText(payout.currency),
    gross_amount: centsToDollars(payout.grossAmount),
    fee_amount: centsToDollars(payout.feeAmount),
    net_amount: centsToDollars(payout.netAmount),
    arrival_date: cleanDate(payout.arrivalDate),
    payout_created_at: payout.createdAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

const PAYOUTS_QUERY = `
  query GetPayoutRecordsPage($limit: Int!, $cursor: String) {
    payoutRecords(first: $limit, after: $cursor) {
      nodes {
        id
        identifier
        status
        payoutMethod
        type
        currency
        grossAmount
        feeAmount
        netAmount
        arrivalDate
        createdAt
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

async function fetchPayoutsPage(
  cursor: string | null,
  pageNumber: number
): Promise<{ response: GraphQLResult<PayoutsPage>; throttleRetries: number }> {
  return fetchPageWithThrottleRetry<PayoutsPage>(
    () =>
      jobberGraphQL<PayoutsPage>(PAYOUTS_QUERY, {
        limit: PAYOUT_BATCH_SIZE,
        cursor,
      }),
    { pageNumber, label: "payout page" }
  );
}

async function syncPayouts() {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let payoutsReceived = 0;
  let payoutsSaved = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 250) {
      warnings.push("Sync stopped after 250 payout pages for safety.");
      break;
    }

    const pageResult = await fetchPayoutsPage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(message || `Jobber failed on payout page ${pageNumber}.`);
    }

    const payouts = jobberResponse.data?.payoutRecords?.nodes ?? [];
    const pageInfo = jobberResponse.data?.payoutRecords?.pageInfo;

    payoutsReceived += payouts.length;

    if (payouts.length > 0) {
      const payoutRows = payouts.map(formatPayout);

      const { error: upsertError } = await supabaseServer
        .from("jobber_payouts")
        .upsert(payoutRows, {
          onConflict: "jobber_payout_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on payout page ${pageNumber}: ${upsertError.message}`
        );
      }

      payoutsSaved += payoutRows.length;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another payout page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    payoutsReceived,
    payoutsSaved,
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
          message: "A Jobber payout sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncPayouts();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.payoutsReceived,
      recordsSaved: syncResult.payoutsSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings },
    });

    return NextResponse.json({
      success: true,
      message: "Jobber payouts synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber payout sync failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "An unknown payout sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
