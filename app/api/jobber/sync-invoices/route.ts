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

type JobberClient = {
  id: string;
  name: string | null;
};

type JobberVisitRef = {
  id: string;
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
  // Roadmap fix (2026-09): re-links jobber_visits.jobber_invoice_id for
  // every visit this invoice covers, regardless of the visit's source.
  // Running this sync once retroactively corrects every visit that was
  // already invoiced directly in Jobber before this fix existed -- see
  // lib/jobberWebhookProcessor.ts's syncSingleInvoice header comment for
  // the full story (that function does the same thing, but only for
  // invoices created/updated after this fix shipped).
  visits: { nodes: JobberVisitRef[] } | null;
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
  jobber_web_uri: string | null;
  updated_at: string;
};

type SyncResult = {
  invoicesReceived: number;
  invoicesSaved: number;
  visitsLinked: number;
  visitLinkErrors: string[];
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

        visits(first: 50) {
          nodes {
            id
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

// Jobber's issuedDate/dueDate are real ISO8601DateTime timestamps, not
// bare dates (confirmed live: an invoice issued 2026-08-01T01:26:22Z —
// 6:26pm Phoenix time on July 31st — was synced in showing August 1st
// under the old UTC-slice logic). See lib/phoenixDate.ts for the fix.
const cleanDate = toPhoenixDateString;

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
    jobber_web_uri: cleanText(invoice.jobberWebUri),
    updated_at: new Date().toISOString(),
  };
}

async function getInvoicesPage(
  cursor: string | null,
  pageNumber: number
): Promise<{
  response: JobberGraphQLResponse<InvoicesPage>;
  throttleRetries: number;
}> {
  return fetchPageWithThrottleRetry<InvoicesPage>(
    () =>
      jobberGraphQL<InvoicesPage>(INVOICES_QUERY, {
        limit: INVOICE_BATCH_SIZE,
        cursor,
      }),
    {
      pageNumber,
      maxRetries: MAX_THROTTLE_RETRIES,
      retryDelayMs: THROTTLE_RETRY_DELAY_MS,
      label: "invoice page",
    }
  );
}

async function syncInvoices(): Promise<SyncResult> {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let invoicesReceived = 0;
  let invoicesSaved = 0;
  let visitsLinked = 0;
  const visitLinkErrors: string[] = [];
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

      // Re-link jobber_visits.jobber_invoice_id for every visit each
      // invoice on this page covers -- see the JobberInvoice type's
      // header comment above for why. One update per visit (not a batch
      // .in(...) call) since different visits on the same page can need
      // different invoice ids.
      for (const invoice of invoices) {
        const visitIds = (invoice.visits?.nodes ?? []).map((v) => v.id);

        for (const visitId of visitIds) {
          const { error: linkError } = await supabaseServer
            .from("jobber_visits")
            .update({ jobber_invoice_id: invoice.id })
            .eq("jobber_visit_id", visitId);

          if (linkError) {
            visitLinkErrors.push(
              `${invoice.id} -> ${visitId}: ${linkError.message}`
            );
          } else {
            visitsLinked += 1;
          }
        }
      }
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
    visitsLinked,
    visitLinkErrors,
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
          message: "A Jobber invoice sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncInvoices();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.invoicesReceived,
      recordsSaved: syncResult.invoicesSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings },
    });

    return NextResponse.json({
      success: true,
      message: "Jobber invoices synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber invoice sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown invoice sync error occurred.";

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