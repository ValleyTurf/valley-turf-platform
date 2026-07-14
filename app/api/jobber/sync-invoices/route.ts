import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type JobberClient = {
  id: string;
  name: string | null;
};

type JobberInvoice = {
  id: string;
  invoiceNumber: string | number | null;
  subject: string | null;
  invoiceStatus: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  receivedDate: string | null;
  total: number | string | null;
  jobberWebUri: string | null;
  client: JobberClient | null;
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

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }> | null;
};

type InvoiceUpsert = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  subject: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  balance: number;
  updated_at: string;
};

type SyncResult = {
  invoicesReceived: number;
  invoicesSaved: number;
  pagesProcessed: number;
  throttleRetries: number;
  warnings: string[];
};

const SYNC_TYPE = "invoices";

const INVOICE_BATCH_SIZE = 25;
const PAGE_DELAY_MS = 1000;
const THROTTLE_RETRY_DELAY_MS = 3000;
const MAX_THROTTLE_RETRIES = 5;

const INVOICES_QUERY = `
  query GetInvoicesPage(
    $limit: Int!
    $cursor: String
  ) {
    invoices(
      first: $limit
      after: $cursor
    ) {
      nodes {
        id
        invoiceNumber
        subject
        invoiceStatus
        issuedDate
        dueDate
        receivedDate
        total
        jobberWebUri

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

function cleanDate(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function cleanAmount(
  value: number | string | null | undefined
): number {
  const amount = Number(value ?? 0);

  return Number.isNaN(amount) ? 0 : amount;
}

function formatInvoice(
  invoice: JobberInvoice
): InvoiceUpsert {
  const total = cleanAmount(invoice.total);

  return {
    jobber_invoice_id: invoice.id,
    jobber_client_id: invoice.client?.id ?? null,
    invoice_number: cleanText(invoice.invoiceNumber),
    customer_name: cleanText(invoice.client?.name),
    subject: cleanText(invoice.subject),
    status: cleanText(invoice.invoiceStatus),
    issue_date: cleanDate(invoice.issuedDate),
    due_date: cleanDate(invoice.dueDate),
    total,
    balance: 0,
    updated_at: new Date().toISOString(),
  };
}

function isThrottled<T>(
  response: JobberGraphQLResponse<T>
): boolean {
  return Boolean(
    response.errors?.some((error) => {
      const message =
        error.message.toLowerCase();

      return (
        message.includes("throttled") ||
        error.extensions?.code === "THROTTLED"
      );
    })
  );
}

async function getInvoicesPage(
  cursor: string | null,
  pageNumber: number
): Promise<{
  response: JobberGraphQLResponse<InvoicesPage>;
  throttleRetries: number;
}> {
  let retryNumber = 0;

  while (retryNumber <= MAX_THROTTLE_RETRIES) {
    const response =
      await jobberGraphQL<InvoicesPage>(
        INVOICES_QUERY,
        {
          limit: INVOICE_BATCH_SIZE,
          cursor,
        }
      );

    if (!isThrottled(response)) {
      return {
        response,
        throttleRetries: retryNumber,
      };
    }

    retryNumber += 1;

    if (retryNumber > MAX_THROTTLE_RETRIES) {
      throw new Error(
        `Jobber remained throttled after ${MAX_THROTTLE_RETRIES} retries on invoice page ${pageNumber}.`
      );
    }

    const waitTime =
      THROTTLE_RETRY_DELAY_MS * retryNumber;

    console.warn(
      `Jobber throttled invoice page ${pageNumber}. Retry ${retryNumber}/${MAX_THROTTLE_RETRIES} in ${waitTime}ms.`
    );

    await sleep(waitTime);
  }

  throw new Error(
    `Unable to load Jobber invoice page ${pageNumber}.`
  );
}

async function startSyncRun(): Promise<string> {
  const startedAt =
    new Date().toISOString();

  const {
    data: syncRun,
    error: syncRunError,
  } = await supabaseServer
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
      `Unable to start invoice sync tracking: ${
        syncRunError?.message ??
        "No sync run was created."
      }`
    );
  }

  const { error: statusError } =
    await supabaseServer
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
      "Unable to update invoice sync status to running:",
      statusError
    );
  }

  return syncRun.id as string;
}

async function completeSyncRun(
  syncRunId: string,
  result: SyncResult
): Promise<void> {
  const completedAt =
    new Date().toISOString();

  const metadata = {
    warnings: result.warnings,
  };

  const { error: syncRunError } =
    await supabaseServer
      .from("jobber_sync_runs")
      .update({
        status: "success",
        completed_at: completedAt,
        records_received:
          result.invoicesReceived,
        records_saved:
          result.invoicesSaved,
        pages_processed:
          result.pagesProcessed,
        throttle_retries:
          result.throttleRetries,
        metadata,
      })
      .eq("id", syncRunId);

  if (syncRunError) {
    console.error(
      "Unable to mark invoice sync run successful:",
      syncRunError
    );
  }

  const { error: statusError } =
    await supabaseServer
      .from("jobber_sync_status")
      .upsert(
        {
          sync_type: SYNC_TYPE,
          status: "healthy",
          last_completed_at: completedAt,
          last_success_at: completedAt,
          records_received:
            result.invoicesReceived,
          records_saved:
            result.invoicesSaved,
          pages_processed:
            result.pagesProcessed,
          throttle_retries:
            result.throttleRetries,
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
      "Unable to update invoice sync status to healthy:",
      statusError
    );
  }
}

async function failSyncRun(
  syncRunId: string,
  errorMessage: string
): Promise<void> {
  const failedAt =
    new Date().toISOString();

  const { error: syncRunError } =
    await supabaseServer
      .from("jobber_sync_runs")
      .update({
        status: "failed",
        completed_at: failedAt,
        error_message: errorMessage,
      })
      .eq("id", syncRunId);

  if (syncRunError) {
    console.error(
      "Unable to mark invoice sync run failed:",
      syncRunError
    );
  }

  const { error: statusError } =
    await supabaseServer
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
      "Unable to update invoice sync status to failed:",
      statusError
    );
  }
}

async function syncInvoices(): Promise<SyncResult> {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let invoicesReceived = 0;
  let invoicesSaved = 0;
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
      `Syncing Jobber invoice page ${pageNumber}...`
    );

    const pageResult =
      await getInvoicesPage(
        cursor,
        pageNumber
      );

    const jobberResponse =
      pageResult.response;

    throttleRetries +=
      pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message =
        jobberResponse.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join(", ");

      throw new Error(
        message ||
          `Jobber failed on invoice page ${pageNumber}.`
      );
    }

    const invoices =
      jobberResponse.data?.invoices?.nodes ?? [];

    const pageInfo =
      jobberResponse.data?.invoices?.pageInfo;

    invoicesReceived += invoices.length;

    if (invoices.length > 0) {
      const invoiceRows =
        invoices.map(formatInvoice);

      const { error: upsertError } =
        await supabaseServer
          .from("jobber_invoices")
          .upsert(invoiceRows, {
            onConflict:
              "jobber_invoice_id",
            ignoreDuplicates: false,
          });

      if (upsertError) {
        throw new Error(
          `Supabase failed on invoice page ${pageNumber}: ${upsertError.message}`
        );
      }

      invoicesSaved +=
        invoiceRows.length;
    }

    console.log(
      `Invoice page ${pageNumber} complete. Received ${invoicesReceived}, saved ${invoicesSaved}.`
    );

    hasNextPage =
      pageInfo?.hasNextPage ?? false;

    cursor =
      pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another invoice page after page ${pageNumber}, but no cursor was returned.`
      );

      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    invoicesReceived,
    invoicesSaved,
    pagesProcessed: pageNumber,
    throttleRetries,
    warnings,
  };
}

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const {
      data: currentStatus,
      error: currentStatusError,
    } = await supabaseServer
      .from("jobber_sync_status")
      .select(
        "status, last_started_at"
      )
      .eq("sync_type", SYNC_TYPE)
      .maybeSingle();

    if (currentStatusError) {
      throw new Error(
        `Unable to check current invoice sync status: ${currentStatusError.message}`
      );
    }

    if (
      currentStatus?.status === "running"
    ) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message:
            "A Jobber invoice sync is already running.",
          lastStartedAt:
            currentStatus.last_started_at,
        },
        {
          status: 409,
        }
      );
    }

    syncRunId =
      await startSyncRun();

    const syncResult =
      await syncInvoices();

    await completeSyncRun(
      syncRunId,
      syncResult
    );

    return NextResponse.json({
      success: true,
      message:
        "Jobber invoices synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error(
      "Jobber invoice sync failed:",
      error
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown invoice sync error occurred.";

    if (syncRunId) {
      await failSyncRun(
        syncRunId,
        errorMessage
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      {
        status: 500,
      }
    );
  }
}