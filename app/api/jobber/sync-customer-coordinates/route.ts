import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type JobberCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

type JobberAddress = {
  coordinates: JobberCoordinates | null;
  geoStatus: string | null;
};

type JobberProperty = {
  address: JobberAddress | null;
};

type JobberClient = {
  id: string;
  clientProperties: {
    nodes: JobberProperty[];
  };
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

async function syncCoordinates() {
  const batchSize = 50;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let clientsReceived = 0;
  let clientsUpdated = 0;
  let clientsSkipped = 0;

  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 150) {
      warnings.push("Sync stopped after 150 pages for safety.");
      break;
    }

    const jobberResponse: {
      data: ClientsPage | null;
      errors: Array<{ message: string }> | null;
    } = await jobberGraphQL<ClientsPage>(
      `
        query GetClientsForCoordinates($limit: Int!, $cursor: String) {
          clients(first: $limit, after: $cursor) {
            nodes {
              id
              clientProperties(first: 1) {
                nodes {
                  address {
                    coordinates {
                      latitude
                      longitude
                    }
                    geoStatus
                  }
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

    const clients = jobberResponse.data?.clients?.nodes ?? [];
    const pageInfo = jobberResponse.data?.clients?.pageInfo;

    clientsReceived += clients.length;

    for (const client of clients) {
      const property = client.clientProperties?.nodes?.[0];
      const address = property?.address;
      const coordinates = address?.coordinates;

      if (
        !coordinates ||
        coordinates.latitude === null ||
        coordinates.longitude === null
      ) {
        clientsSkipped += 1;
        continue;
      }

      const { error: updateError } = await supabaseServer
        .from("customers")
        .update({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          geo_status: address?.geoStatus ?? null,
        })
        .eq("jobber_client_id", client.id);

      if (updateError) {
        warnings.push(
          `Failed to update ${client.id}: ${updateError.message}`
        );
        continue;
      }

      clientsUpdated += 1;
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
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
  }

  return {
    clientsReceived,
    clientsUpdated,
    clientsSkipped,
    pagesProcessed: pageNumber,
    warnings,
  };
}

export async function GET() {
  try {
    const syncResult = await syncCoordinates();

    return NextResponse.json({
      success: true,
      message: "Customer coordinates synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Customer coordinate sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown coordinate sync error occurred.",
      },
      { status: 500 }
    );
  }
}
