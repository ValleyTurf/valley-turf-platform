import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_TYPE = "payments";

type SyncResult = {
  invoicesReceived: number;
  paymentsReceived: number;
  paymentsSaved: number;
  pagesProcessed: number;
  warnings: string[];
};

type JobberClient = {
  id: string;
  name: string | null;
};

type JobberPaymentRecord = {
  id: string;
  amount: number | string | null;
  entryDate: string | null;
  adjustmentType: string | null;
  jobberPaymentPaymentMethod: string | null;
  jobberPaymentTransactionStatus: string | null;
  tipAmount: number | string | null;
};

type JobberInvoice = {
  id: string;
  invoiceNumber: string | number | null;
  client: JobberClient | null;
  paymentRecords: {
    nodes: JobberPaymentRecord[];
  } | null;
};

type InvoicesPage = {
  invoices: {
    nodes: JobberInvoice[];
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
    };
  };
};

type GraphQLResult<T> = {
  data: T | null;
  errors: Array<{
    message: string;
  }> | null;
};

type PaymentUpsert = {
  jobber_payment_id: string;
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  amount: number;
  payment_date: string | null;
  payment_method: string | null;
  adjustment_type: string | null;
  transaction_status: string | null;
  tip_amount: number;
  updated_at: string;
};

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function cleanAmount(
  value: number | string | null | undefined
): number {
  const amount = Number(value ?? 0);

  return Number.isNaN(amount) ? 0 : amount;
}

function cleanDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function formatPayment(
  invoice: JobberInvoice,
  payment: JobberPaymentRecord
): PaymentUpsert {
  return {
    jobber_payment_id: payment.id,
    jobber_invoice_id: invoice.id,
    jobber_client_id: invoice.client?.id ?? null,
    amount: cleanAmount(payment.amount),
    payment_date: cleanDate(payment.entryDate),
    payment_method: cleanText(payment.jobberPaymentPaymentMethod),
    adjustment_type: cleanText(payment.adjustmentType),
    transaction_status: cleanText(
      payment.jobberPaymentTransactionStatus
    ),
    tip_amount: cleanAmount(payment.tipAmount),
    updated_at: new Date().toISOString(),
  };
}

async function fetchInvoicePage(
  limit: number,
  cursor: string | null
): Promise<GraphQLResult<InvoicesPage>> {
  return jobberGraphQL<InvoicesPage>(
    `
      query GetInvoicePayments(
        $limit: Int!
        $cursor: String
      ) {
        invoices(first: $limit, after: $cursor) {
          nodes {
            id
            invoiceNumber

            client {
              id
              name
            }

            paymentRecords {
              nodes {
                id
                amount
                entryDate
                adjustmentType
                jobberPaymentPaymentMethod
                jobberPaymentTransactionStatus
                tipAmount
              }
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
      limit,
      cursor,
    }
  );
}

async function fetchInvoicePageWithRetry(
  limit: number,
  cursor: string | null
): Promise<GraphQLResult<InvoicesPage>> {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await fetchInvoicePage(limit, cursor);

    const errorMessage =
      result.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(", ") ?? "";

    const wasThrottled = errorMessage
      .toLowerCase()
      .includes("throttled");

    if (!wasThrottled) {
      return result;
    }

    if (attempt === maxAttempts) {
      return result;
    }

    const delay = attempt * 3000;

    console.log(
      `Jobber throttled payment sync. Waiting ${delay}ms before retry ${attempt + 1}.`
    );

    await sleep(delay);
  }

  return {
    data: null,
    errors: [{ message: "Jobber payment sync retry failed." }],
  };
}

async function syncPayments() {
  // Payment records make this query expensive.
  // Keep the page size intentionally small.
  const invoiceBatchSize = 10;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let invoicesReceived = 0;
  let paymentsReceived = 0;
  let paymentsSaved = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 250) {
      warnings.push("Sync stopped after 250 invoice pages for safety.");
      break;
    }

    const jobberResponse = await fetchInvoicePageWithRetry(
      invoiceBatchSize,
      cursor
    );

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(
        message || `Jobber failed on invoice page ${pageNumber}.`
      );
    }

    const invoices = jobberResponse.data?.invoices?.nodes ?? [];
    const pageInfo = jobberResponse.data?.invoices?.pageInfo;

    invoicesReceived += invoices.length;

    const paymentRows = invoices.flatMap((invoice) => {
      const paymentRecords = invoice.paymentRecords?.nodes ?? [];

      return paymentRecords.map((payment) =>
        formatPayment(invoice, payment)
      );
    });

    paymentsReceived += paymentRows.length;

    if (paymentRows.length > 0) {
      const { error: upsertError } = await supabaseServer
        .from("jobber_payments")
        .upsert(paymentRows, {
          onConflict: "jobber_payment_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on invoice page ${pageNumber}: ${upsertError.message}`
        );
      }

      paymentsSaved += paymentRows.length;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another invoice page after page ${pageNumber}, but no cursor was returned.`
      );

      break;
    }

    // Brief pause between successful pages to avoid immediately
    // exhausting Jobber's GraphQL query-cost allowance.
    if (hasNextPage) {
      await sleep(500);
    }
  }

  return {
    invoicesReceived,
    paymentsReceived,
    paymentsSaved,
    pagesProcessed: pageNumber,
    warnings,
  };
}

async function startSyncRun(): Promise<string> {
  const startedAt = new Date().toISOString();

  const { data: syncRun, error: syncRunError } = await supabaseServer
    .from("jobber_sync_runs")
    .insert({
      sync_type: SYNC_TYPE,
      sync_mode: "manual",
      status: "running",
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    throw new Error(
      `Unable to start sync tracking: ${
        syncRunError?.message ?? "No sync run was created."
      }`
    );
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_sync_status")
    .upsert(
      {
        sync_type: SYNC_TYPE,
        status: "running",
        last_started_at: startedAt,
        last_error: null,
        updated_at: startedAt,
      },
      {
        onConflict: "sync_type",
        ignoreDuplicates: false,
      }
    );

  if (statusError) {
    console.error(
      "Unable to update payment sync status to running:",
      statusError
    );
  }

  return syncRun.id as string;
}

async function completeSyncRun(
  syncRunId: string,
  result: SyncResult
): Promise<void> {
  const completedAt = new Date().toISOString();

  const { error: syncRunError } = await supabaseServer
    .from("jobber_sync_runs")
    .update({
      status: "success",
      completed_at: completedAt,
      records_received: result.paymentsReceived,
      records_saved: result.paymentsSaved,
      pages_processed: result.pagesProcessed,
      metadata: { warnings: result.warnings },
    })
    .eq("id", syncRunId);

  if (syncRunError) {
    console.error(
      "Unable to mark payment sync run successful:",
      syncRunError
    );
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_sync_status")
    .upsert(
      {
        sync_type: SYNC_TYPE,
        status: "healthy",
        last_completed_at: completedAt,
        last_success_at: completedAt,
        records_received: result.paymentsReceived,
        records_saved: result.paymentsSaved,
        pages_processed: result.pagesProcessed,
        last_error: null,
        updated_at: completedAt,
      },
      {
        onConflict: "sync_type",
        ignoreDuplicates: false,
      }
    );

  if (statusError) {
    console.error(
      "Unable to update payment sync status to healthy:",
      statusError
    );
  }
}

async function failSyncRun(
  syncRunId: string,
  errorMessage: string
): Promise<void> {
  const failedAt = new Date().toISOString();

  const { error: syncRunError } = await supabaseServer
    .from("jobber_sync_runs")
    .update({
      status: "failed",
      completed_at: failedAt,
      error_message: errorMessage,
    })
    .eq("id", syncRunId);

  if (syncRunError) {
    console.error("Unable to mark payment sync run failed:", syncRunError);
  }

  const { error: statusError } = await supabaseServer
    .from("jobber_sync_status")
    .upsert(
      {
        sync_type: SYNC_TYPE,
        status: "failed",
        last_failed_at: failedAt,
        last_error: errorMessage,
        updated_at: failedAt,
      },
      {
        onConflict: "sync_type",
        ignoreDuplicates: false,
      }
    );

  if (statusError) {
    console.error(
      "Unable to update payment sync status to failed:",
      statusError
    );
  }
}

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const { data: currentStatus, error: currentStatusError } =
      await supabaseServer
        .from("jobber_sync_status")
        .select("status, last_started_at")
        .eq("sync_type", SYNC_TYPE)
        .maybeSingle();

    if (currentStatusError) {
      throw new Error(
        `Unable to check current payment sync status: ${currentStatusError.message}`
      );
    }

    if (currentStatus?.status === "running") {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "A Jobber payment sync is already running.",
          lastStartedAt: currentStatus.last_started_at,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun();

    const syncResult = await syncPayments();

    await completeSyncRun(syncRunId, syncResult);

    return NextResponse.json({
      success: true,
      message: "Jobber payments synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber payment sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown payment sync error occurred.";

    if (syncRunId) {
      await failSyncRun(syncRunId, errorMessage);
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