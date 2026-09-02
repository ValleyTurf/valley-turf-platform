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

type JobberEmail = {
  address: string;
};

type JobberPhone = {
  number: string;
};

type JobberAddress = {
  city: string | null;
  country: string | null;
  postalCode: string | null;
  province: string | null;
  street: string | null;
  street1: string | null;
  street2: string | null;
  coordinates: {
    latitude: number | null;
    longitude: number | null;
  } | null;
  geoStatus: string | null;
};

type JobberProperty = {
  id: string;
  address: JobberAddress | null;
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
  billingAddress: JobberAddress | null;
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

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }> | null;
};

type CustomerUpsert = {
  jobber_client_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  current_balance: number;
  last_synced_at: string;
  latitude: number | null;
  longitude: number | null;
  geo_status: string | null;
};

type SyncResult = {
  customersReceived: number;
  customersSaved: number;
  customersWithAddress: number;
  customersWithCity: number;
  customersWithPostalCode: number;
  pagesProcessed: number;
  throttleRetries: number;
  warnings: string[];
};

const SYNC_TYPE = "customers";

const CLIENT_BATCH_SIZE = 25;
const PAGE_DELAY_MS = 750;
const THROTTLE_RETRY_DELAY_MS = 3000;
const MAX_THROTTLE_RETRIES = 5;

const CLIENTS_QUERY = `
  query GetClientsPage(
    $limit: Int!
    $cursor: String
  ) {
    clients(
      first: $limit
      after: $cursor
    ) {
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

        billingAddress {
          city
          country
          postalCode
          province
          street
          street1
          street2
        }

        clientProperties(first: 10) {
          nodes {
            id
            address {
              city
              country
              postalCode
              province
              street
              street1
              street2
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
`;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function cleanText(
  value: string | null | undefined
): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function cleanPhone(
  value: string | null | undefined
): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function hasUsableAddress(
  address: JobberAddress | null | undefined
): address is JobberAddress {
  if (!address) {
    return false;
  }

  return Boolean(
    cleanText(address.street1) ||
      cleanText(address.street) ||
      cleanText(address.city) ||
      cleanText(address.province) ||
      cleanText(address.postalCode)
  );
}

// preferredPropertyId is the staff-picked "current" property (see
// migration 052) for customers with more than one property in Jobber --
// e.g. they moved and the old property is still on file. Null means no
// override has been set, which falls back to the original behavior of
// just taking the first usable property.
function getCustomerAddress(
  client: JobberClient,
  preferredPropertyId: string | null
): JobberAddress | null {
  const properties =
    client.clientProperties?.nodes ?? [];

  if (preferredPropertyId) {
    const preferred = properties.find(
      (property) => property.id === preferredPropertyId
    );

    if (preferred && hasUsableAddress(preferred.address)) {
      return preferred.address;
    }
  }

  const servicePropertyAddress = properties
    .map((property) => property.address)
    .find(hasUsableAddress);

  if (servicePropertyAddress) {
    return servicePropertyAddress;
  }

  if (hasUsableAddress(client.billingAddress)) {
    return client.billingAddress;
  }

  return null;
}

function formatCustomer(
  client: JobberClient,
  preferredPropertyId: string | null
): CustomerUpsert {
  const firstName = cleanText(client.firstName);
  const lastName = cleanText(client.lastName);

  const calculatedName = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  const fullName =
    cleanText(client.name) ||
    cleanText(calculatedName) ||
    cleanText(client.companyName) ||
    "Unnamed Customer";

  const balance = Number(client.balance ?? 0);

  const address = getCustomerAddress(client, preferredPropertyId);

  const addressLine1 =
    cleanText(address?.street1) ||
    cleanText(address?.street) ||
    null;

  return {
    jobber_client_id: client.id,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    company_name: cleanText(client.companyName),
    email: cleanText(client.emails?.[0]?.address),
    phone: cleanPhone(client.phones?.[0]?.number),
    address_line_1: addressLine1,
    address_line_2: cleanText(address?.street2),
    city: cleanText(address?.city),
    state: cleanText(address?.province),
    postal_code: cleanText(address?.postalCode),
    country: cleanText(address?.country),
    latitude: address?.coordinates?.latitude ?? null,
    longitude: address?.coordinates?.longitude ?? null,
    geo_status: cleanText(address?.geoStatus),
    current_balance: Number.isNaN(balance)
      ? 0
      : balance,
    last_synced_at: new Date().toISOString(),
  };
}

async function getClientsPage(
  cursor: string | null,
  pageNumber: number
): Promise<{
  response: JobberGraphQLResponse<ClientsPage>;
  throttleRetries: number;
}> {
  return fetchPageWithThrottleRetry<ClientsPage>(
    () =>
      jobberGraphQL<ClientsPage>(CLIENTS_QUERY, {
        limit: CLIENT_BATCH_SIZE,
        cursor,
      }),
    {
      pageNumber,
      maxRetries: MAX_THROTTLE_RETRIES,
      retryDelayMs: THROTTLE_RETRY_DELAY_MS,
      label: "page",
    }
  );
}

async function getCurrentPropertyOverrides(): Promise<
  Map<string, string>
> {
  // One query up front rather than a per-customer lookup inside the
  // paginated loop below -- this sync can touch thousands of clients,
  // and only a handful will ever have a manual override set.
  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, current_property_id")
    .not("current_property_id", "is", null);

  if (error) {
    console.error(
      "Unable to load current_property_id overrides:",
      error.message
    );
    return new Map();
  }

  const overrides = new Map<string, string>();

  for (const row of data ?? []) {
    if (row.jobber_client_id && row.current_property_id) {
      overrides.set(row.jobber_client_id, row.current_property_id);
    }
  }

  return overrides;
}

async function syncCustomers(): Promise<SyncResult> {
  const propertyOverrides = await getCurrentPropertyOverrides();

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let customersReceived = 0;
  let customersSaved = 0;
  let customersWithAddress = 0;
  let customersWithCity = 0;
  let customersWithPostalCode = 0;
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
      `Syncing Jobber customer page ${pageNumber}...`
    );

    const pageResult = await getClientsPage(
      cursor,
      pageNumber
    );

    const jobberResponse =
      pageResult.response;

    throttleRetries +=
      pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(
        message ||
          `Jobber failed on page ${pageNumber}.`
      );
    }

    const clients =
      jobberResponse.data?.clients?.nodes ?? [];

    const pageInfo =
      jobberResponse.data?.clients?.pageInfo;

    customersReceived += clients.length;

    if (clients.length > 0) {
      const customerRows = clients.map((client) =>
        formatCustomer(
          client,
          propertyOverrides.get(client.id) ?? null
        )
      );

      for (const customer of customerRows) {
        if (
          customer.address_line_1 ||
          customer.city ||
          customer.postal_code
        ) {
          customersWithAddress += 1;
        }

        if (customer.city) {
          customersWithCity += 1;
        }

        if (customer.postal_code) {
          customersWithPostalCode += 1;
        }
      }

      const { error: upsertError } =
        await supabaseServer
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

    console.log(
      `Page ${pageNumber} complete. Saved ${customersSaved} customers.`
    );

    hasNextPage =
      pageInfo?.hasNextPage ?? false;

    cursor =
      pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another page after page ${pageNumber}, but no cursor was returned.`
      );

      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    customersReceived,
    customersSaved,
    customersWithAddress,
    customersWithCity,
    customersWithPostalCode,
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
          message: "A Jobber customer sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncCustomers();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.customersReceived,
      recordsSaved: syncResult.customersSaved,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: {
        customersWithAddress: syncResult.customersWithAddress,
        customersWithCity: syncResult.customersWithCity,
        customersWithPostalCode: syncResult.customersWithPostalCode,
        warnings: syncResult.warnings,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        "Jobber customers and service addresses synchronized successfully.",
      ...syncResult,
    });
  } catch (error) {
    console.error("Jobber customer sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown customer sync error occurred.";

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
