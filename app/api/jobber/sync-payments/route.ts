import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function GET() {
  try {
    const syncResult = await syncPayments();

    return NextResponse.json({
      success: true,
      message: "Jobber payments synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber payment sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown payment sync error occurred.",
      },
      { status: 500 }
    );
  }
}