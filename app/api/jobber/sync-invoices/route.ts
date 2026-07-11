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

function cleanText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned ? cleaned : null;
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

function cleanAmount(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);

  return Number.isNaN(amount) ? 0 : amount;
}

function formatInvoice(invoice: JobberInvoice): InvoiceUpsert {
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

async function syncInvoices() {
  const batchSize = 50;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let invoicesReceived = 0;
  let invoicesSaved = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 100) {
      warnings.push("Sync stopped after 100 pages for safety.");
      break;
    }

    const jobberResponse: JobberGraphQLResponse<InvoicesPage> =
      await jobberGraphQL<InvoicesPage>(
        `
          query GetInvoicesPage($limit: Int!, $cursor: String) {
            invoices(first: $limit, after: $cursor) {
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

    const invoices = jobberResponse.data?.invoices?.nodes ?? [];
    const pageInfo = jobberResponse.data?.invoices?.pageInfo;

    invoicesReceived += invoices.length;

    if (invoices.length > 0) {
      const invoiceRows = invoices.map(formatInvoice);

      const { error: upsertError } = await supabaseServer
        .from("jobber_invoices")
        .upsert(invoiceRows, {
          onConflict: "jobber_invoice_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on page ${pageNumber}: ${upsertError.message}`
        );
      }

      invoicesSaved += invoiceRows.length;
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
    invoicesReceived,
    invoicesSaved,
    pagesProcessed: pageNumber,
    warnings,
  };
}

export async function GET() {
  try {
    const syncResult = await syncInvoices();

    return NextResponse.json({
      success: true,
      message: "Jobber invoices synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber invoice sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown invoice sync error occurred.",
      },
      { status: 500 }
    );
  }
}