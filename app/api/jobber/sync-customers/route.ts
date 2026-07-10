import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type JobberEmail = {
  address: string;
};

type JobberPhone = {
  number: string;
};

type JobberClient = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  balance: number | string | null;
  createdAt: string | null;
  emails: JobberEmail[];
  phones: JobberPhone[];
};

type ClientsPage = {
  clients: {
    nodes: JobberClient[];
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
    };
  };
};

type CustomerUpsert = {
  jobber_client_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  current_balance: number;
  last_synced_at: string;
};

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function cleanPhone(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function formatCustomer(client: JobberClient): CustomerUpsert {
  const firstName = cleanText(client.firstName);
  const lastName = cleanText(client.lastName);

  const calculatedName = [firstName, lastName].filter(Boolean).join(" ");

  const fullName =
    cleanText(client.name) ||
    cleanText(calculatedName) ||
    cleanText(client.companyName) ||
    "Unnamed Customer";

  const balance = Number(client.balance ?? 0);

  return {
    jobber_client_id: client.id,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    company_name: cleanText(client.companyName),
    email: cleanText(client.emails?.[0]?.address),
    phone: cleanPhone(client.phones?.[0]?.number),
    current_balance: Number.isNaN(balance) ? 0 : balance,
    last_synced_at: new Date().toISOString(),
  };
}

async function syncCustomers() {
  const batchSize = 50;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let customersReceived = 0;
  let customersSaved = 0;

  const errors: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    // Safety guard in case Jobber ever returns a repeating cursor.
    if (pageNumber > 100) {
      errors.push("Sync stopped after 100 pages for safety.");
      break;
    }

    const result = await jobberGraphQL<ClientsPage>(
      `
        query GetClientsPage($limit: Int!, $cursor: String) {
          clients(first: $limit, after: $cursor) {
            nodes {
              id
              name
              firstName
              lastName
              companyName
              balance
              createdAt

              emails {
                address
              }

              phones {
                number
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

    if (result.errors?.length) {
      const message = result.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(message || `Jobber failed on page ${pageNumber}.`);
    }

    const clients = result.data?.clients?.nodes ?? [];
    const pageInfo = result.data?.clients?.pageInfo;

    customersReceived += clients.length;

    if (clients.length > 0) {
      const customerRows = clients.map(formatCustomer);

      const { error: upsertError } = await supabaseServer
        .from("customers")
        .upsert(customerRows, {
          onConflict: "jobber_client_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(
          `Supabase failed on page ${pageNumber}: ${upsertError.message}`
        );
      }

      customersSaved += customerRows.length;
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      errors.push(
        `Jobber reported another page after page ${pageNumber}, but no cursor was returned.`
      );

      break;
    }
  }

  return {
    customersReceived,
    customersSaved,
    pagesProcessed: pageNumber,
    warnings: errors,
  };
}

export async function GET() {
  try {
    const result = await syncCustomers();

    return NextResponse.json({
      success: true,
      message: "Jobber customers synchronized successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Jobber customer sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown customer sync error occurred.",
      },
      { status: 500 }
    );
  }
}