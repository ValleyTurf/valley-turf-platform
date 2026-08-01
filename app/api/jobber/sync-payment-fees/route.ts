// Syncs the real per-transaction credit-card/ACH processing fee data —
// see supabase/migrations/022_add_jobber_payment_fees.sql for the full
// story of why this is a separate sync/table from both sync-payments.ts
// (Invoice.paymentRecords, a plain fee-less PaymentRecord type) and
// sync-payouts.ts (PayoutRecord.feeAmount, confirmed always 0 on this
// account). This one goes through the top-level Query.paymentRecords
// field, which resolves to the polymorphic PaymentRecordInterface, and
// pulls feeAmount/surchargeAmount via inline fragments on the concrete
// JobberPaymentsCreditCardPaymentRecord/JobberPaymentsACHPaymentRecord
// types. Same shape as every other sync-*.ts route in this app.
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  fetchPageWithThrottleRetry,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYNC_TYPE = "payment-fees";

type JobberInvoiceRef = {
  id: string;
};

type JobberPaymentFeeRecord = {
  __typename: string;
  id: string;
  amount: number | string | null;
  entryDate: string | null;
  adjustmentType: string | null;
  paymentType: string | null;
  invoice: JobberInvoiceRef | null;
  feeAmount: number | string | null;
  surchargeAmount: number | string | null;
};

type PaymentFeesPage = {
  paymentRecords: {
    nodes: JobberPaymentFeeRecord[];
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

type PaymentFeeUpsert = {
  jobber_payment_record_id: string;
  jobber_invoice_id: string | null;
  record_typename: string | null;
  payment_type: string | null;
  adjustment_type: string | null;
  amount: number;
  fee_amount: number;
  surcharge_amount: number;
  entry_date: string | null;
  updated_at: string;
};

const PAYMENT_FEE_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 500;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

// entryDate is a real ISO8601DateTime timestamp — see lib/phoenixDate.ts
// for why converting to UTC before slicing off the date shifts anything
// that happened in the evening Phoenix time onto the wrong calendar day.
const cleanDate = toPhoenixDateString;

// Unlike PayoutRecord (Int, cents), Round 9's real query confirmed this
// path's amount/feeAmount/surchargeAmount are Floats already in dollars
// (e.g. feeAmount 3.93 on a $125 amount) — no /100 conversion here.
function cleanAmount(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatPaymentFee(record: JobberPaymentFeeRecord): PaymentFeeUpsert {
  return {
    jobber_payment_record_id: record.id,
    jobber_invoice_id: record.invoice?.id ?? null,
    record_typename: cleanText(record.__typename),
    payment_type: cleanText(record.paymentType),
    adjustment_type: cleanText(record.adjustmentType),
    amount: cleanAmount(record.amount),
    fee_amount: cleanAmount(record.feeAmount),
    surcharge_amount: cleanAmount(record.surchargeAmount),
    entry_date: cleanDate(record.entryDate),
    updated_at: new Date().toISOString(),
  };
}

const PAYMENT_FEES_QUERY = `
  query GetPaymentRecordsPage($limit: Int!, $cursor: String) {
    paymentRecords(first: $limit, after: $cursor) {
      nodes {
        __typename
        id
        amount
        entryDate
        adjustmentType
        paymentType
        invoice {
          id
        }
        ... on JobberPaymentsCreditCardPaymentRecord {
          feeAmount
          surchargeAmount
        }
        ... on JobberPaymentsACHPaymentRecord {
          feeAmount
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

async function fetchPaymentFeesPage(
  cursor: string | null,
  pageNumber: number
): Promise<{ response: GraphQLResult<PaymentFeesPage>; throttleRetries: number }> {
  return fetchPageWithThrottleRetry<PaymentFeesPage>(
    () =>
      jobberGraphQL<PaymentFeesPage>(PAYMENT_FEES_QUERY, {
        limit: PAYMENT_FEE_BATCH_SIZE,
        cursor,
      }),
    { pageNumber, label: "payment fee page" }
  );
}

async function syncPaymentFees() {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let recordsReceived = 0;
  let recordsSaved = 0;
  let throttleRetries = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 250) {
      warnings.push("Sync stopped after 250 payment fee pages for safety.");
      break;
    }

    const pageResult = await fetchPaymentFeesPage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(
        message || `Jobber failed on payment fee page ${pageNumber}.`
      );
    }

    const records = jobberResponse.data?.paymentRecords?.nodes ?? [];
    const pageInfo = jobberResponse.data?.paymentRecords?.pageInfo;

    recordsReceived += records.length;

    if (records.length > 0) {
      const rows = records.map(formatPaymentFee);

      const { error: upsertError } = await supabaseServer
        .from("jobber_payment_fees")
        .upsert(rows, {
          onConflict: "jobber_payment_record_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on payment fee page ${pageNumber}: ${upsertError.message}`
        );
      }

      recordsSaved += rows.length;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another payment fee page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    recordsReceived,
    recordsSaved,
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
          message: "A Jobber payment fee sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncPaymentFees();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.recordsReceived,
      recordsSaved: syncResult.recordsSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings },
    });

    return NextResponse.json({
      success: true,
      message: "Jobber payment fees synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber payment fee sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown payment fee sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
