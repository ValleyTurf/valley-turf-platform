// Processes queued Jobber webhook events (rows in jobber_webhook_events).
//
// This used to live entirely inside app/api/jobber/process-webhooks'
// GET handler and only ran off a twice-daily cron. Moved into lib/ so it
// can also be called in-process the moment a webhook is received (see
// app/api/jobber/webhook/route.ts), instead of every event waiting up
// to ~12 hours for the next cron tick. The cron-triggered GET route
// still exists as a backstop/catch-up mechanism and a manual "process
// now" button.
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

type WebhookEvent = {
  id: string;
  topic: string;
  jobber_item_id: string | null;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
};

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
  address: JobberAddress | null;
};

type JobberClient = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  balance: number | string | null;
  emails: JobberEmail[];
  phones: JobberPhone[];
  billingAddress: JobberAddress | null;
  clientProperties: {
    nodes: JobberProperty[];
  };
};

type ClientQueryResponse = {
  client: JobberClient | null;
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

const EVENT_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

const CLIENT_QUERY = `
  query GetClient($id: EncodedId!) {
    client(id: $id) {
      id
      name
      firstName
      lastName
      companyName
      balance

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

      clientProperties(first: 1) {
        nodes {
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
  }
`;

const JOB_QUERY = `
  query GetJob($id: EncodedId!) {
    job(id: $id) {
      id
      jobNumber
      title
      jobStatus
      jobType
      jobberWebUri
      endAt
      completedAt
      client {
        id
        name
      }
    }
  }
`;

const INVOICE_QUERY = `
  query GetInvoice($id: EncodedId!) {
    invoice(id: $id) {
      id
      invoiceNumber
      subject
      invoiceStatus
      issuedDate
      dueDate
      total
      client {
        id
        name
      }
    }
  }
`;

const VISIT_QUERY = `
  query GetVisit($id: EncodedId!) {
    visit(id: $id) {
      id
      title
      visitStatus
      startAt
      endAt
      completedAt
      duration
      isLastScheduledVisit
      client {
        id
        name
      }
      job {
        id
        jobNumber
      }
      invoice {
        id
      }
    }
  }
`;

function normalizeTopic(value: string): string {
  return value.trim().toUpperCase();
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function cleanPhone(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function cleanNumericText(
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
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

function getCustomerAddress(client: JobberClient): JobberAddress | null {
  const properties = client.clientProperties?.nodes ?? [];

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

  const address = getCustomerAddress(client);

  const addressLine1 =
    cleanText(address?.street1) || cleanText(address?.street) || null;

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
    current_balance: Number.isNaN(balance) ? 0 : balance,
    last_synced_at: new Date().toISOString(),
  };
}

async function syncSingleCustomer(jobberClientId: string): Promise<void> {
  const response = await jobberGraphQL<ClientQueryResponse>(CLIENT_QUERY, {
    id: jobberClientId,
  });

  if (response.errors?.length) {
    const message = response.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join(", ");

    throw new Error(
      message || `Unable to load Jobber customer ${jobberClientId}.`
    );
  }

  const client = response.data?.client;

  if (!client) {
    throw new Error(`Jobber customer ${jobberClientId} was not found.`);
  }

  const customerRow = formatCustomer(client);

  const { error: upsertError } = await supabaseServer
    .from("customers")
    .upsert(customerRow, {
      onConflict: "jobber_client_id",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Unable to save Jobber customer ${jobberClientId}: ${upsertError.message}`
    );
  }
}

async function syncSingleJob(jobberJobId: string): Promise<void> {
  const response = await jobberGraphQL<{
    job: {
      id: string;
      jobNumber: number | string | null;
      title: string | null;
      jobStatus: string | null;
      jobType: string | null;
      jobberWebUri: string | null;
      endAt: string | null;
      completedAt: string | null;
      client: { id: string; name: string | null } | null;
    } | null;
  }>(JOB_QUERY, { id: jobberJobId });

  if (response.errors?.length) {
    const message = response.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join(", ");
    throw new Error(message || `Unable to load Jobber job ${jobberJobId}.`);
  }

  const job = response.data?.job;

  if (!job) {
    throw new Error(`Jobber job ${jobberJobId} was not found.`);
  }

  const jobRow = {
    jobber_job_id: job.id,
    jobber_client_id: job.client?.id ?? null,
    customer_name: cleanText(job.client?.name),
    title: cleanText(job.title),
    job_number: cleanNumericText(job.jobNumber),
    job_status: cleanText(job.jobStatus),
    job_type: cleanText(job.jobType),
    jobber_web_uri: cleanText(job.jobberWebUri),
    end_at: job.endAt ?? null,
    completed_at: job.completedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabaseServer
    .from("jobber_jobs")
    .upsert(jobRow, {
      onConflict: "jobber_job_id",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Unable to save Jobber job ${jobberJobId}: ${upsertError.message}`
    );
  }
}

async function syncSingleInvoice(jobberInvoiceId: string): Promise<void> {
  const response = await jobberGraphQL<{
    invoice: {
      id: string;
      invoiceNumber: string | number | null;
      subject: string | null;
      invoiceStatus: string | null;
      issuedDate: string | null;
      dueDate: string | null;
      total: number | string | null;
      client: { id: string; name: string | null } | null;
    } | null;
  }>(INVOICE_QUERY, { id: jobberInvoiceId });

  if (response.errors?.length) {
    const message = response.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      message || `Unable to load Jobber invoice ${jobberInvoiceId}.`
    );
  }

  const invoice = response.data?.invoice;

  if (!invoice) {
    throw new Error(`Jobber invoice ${jobberInvoiceId} was not found.`);
  }

  const total = Number(invoice.total ?? 0);

  const invoiceRow = {
    jobber_invoice_id: invoice.id,
    jobber_client_id: invoice.client?.id ?? null,
    invoice_number: cleanNumericText(invoice.invoiceNumber),
    customer_name: cleanText(invoice.client?.name),
    subject: cleanText(invoice.subject),
    status: cleanText(invoice.invoiceStatus),
    issue_date: invoice.issuedDate ?? null,
    due_date: invoice.dueDate ?? null,
    total: Number.isNaN(total) ? 0 : total,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabaseServer
    .from("jobber_invoices")
    .upsert(invoiceRow, {
      onConflict: "jobber_invoice_id",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Unable to save Jobber invoice ${jobberInvoiceId}: ${upsertError.message}`
    );
  }
}

async function syncSingleVisit(jobberVisitId: string): Promise<void> {
  const response = await jobberGraphQL<{
    visit: {
      id: string;
      title: string | null;
      visitStatus: string | null;
      startAt: string | null;
      endAt: string | null;
      completedAt: string | null;
      duration: number | string | null;
      isLastScheduledVisit: boolean | null;
      client: { id: string; name: string | null } | null;
      job: { id: string; jobNumber: number | string | null } | null;
      invoice: { id: string } | null;
    } | null;
  }>(VISIT_QUERY, { id: jobberVisitId });

  if (response.errors?.length) {
    const message = response.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      message || `Unable to load Jobber visit ${jobberVisitId}.`
    );
  }

  const visit = response.data?.visit;

  if (!visit) {
    throw new Error(`Jobber visit ${jobberVisitId} was not found.`);
  }

  const duration = Number(visit.duration ?? 0);

  const visitRow = {
    jobber_visit_id: visit.id,
    jobber_job_id: visit.job?.id ?? null,
    jobber_client_id: visit.client?.id ?? null,
    jobber_invoice_id: visit.invoice?.id ?? null,
    customer_name: cleanText(visit.client?.name),
    job_number: cleanNumericText(visit.job?.jobNumber),
    title: cleanText(visit.title),
    visit_status: cleanText(visit.visitStatus),
    start_at: visit.startAt ?? null,
    end_at: visit.endAt ?? null,
    completed_at: visit.completedAt ?? null,
    duration_minutes: Number.isNaN(duration) ? null : duration,
    is_last_scheduled_visit: visit.isLastScheduledVisit ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabaseServer
    .from("jobber_visits")
    .upsert(visitRow, {
      onConflict: "jobber_visit_id",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Unable to save Jobber visit ${jobberVisitId}: ${upsertError.message}`
    );
  }
}

async function handleDestroyedCustomer(jobberClientId: string): Promise<void> {
  console.log(
    `Jobber reported deleted customer ${jobberClientId}. Historical customer data was retained.`
  );

  // We intentionally do not delete the customer row here — the OS may
  // hold historical jobs/invoices/revenue/reactivation history tied to
  // it, and deleting the row would damage historical reporting.
}

async function handleDestroyedJob(jobberJobId: string): Promise<void> {
  console.log(
    `Jobber reported deleted job ${jobberJobId}. Historical job data was retained.`
  );
}

async function handleDestroyedInvoice(jobberInvoiceId: string): Promise<void> {
  console.log(
    `Jobber reported deleted invoice ${jobberInvoiceId}. Historical invoice data was retained.`
  );
}

async function handleDestroyedVisit(jobberVisitId: string): Promise<void> {
  console.log(
    `Jobber reported deleted visit ${jobberVisitId}. Historical visit data was retained.`
  );
}

async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  const topic = normalizeTopic(event.topic);

  switch (topic) {
    case "CLIENT_CREATE":
    case "CLIENT_UPDATE": {
      if (!event.jobber_item_id) {
        throw new Error(
          `${topic} webhook did not contain a Jobber client ID.`
        );
      }

      await syncSingleCustomer(event.jobber_item_id);

      return;
    }

    case "CLIENT_DESTROY": {
      if (!event.jobber_item_id) {
        throw new Error(
          "CLIENT_DESTROY webhook did not contain a Jobber client ID."
        );
      }

      await handleDestroyedCustomer(event.jobber_item_id);

      return;
    }

    case "JOB_CREATE":
    case "JOB_UPDATE": {
      if (!event.jobber_item_id) {
        throw new Error(`${topic} webhook did not contain a Jobber job ID.`);
      }
      await syncSingleJob(event.jobber_item_id);
      return;
    }
    case "JOB_DESTROY": {
      if (!event.jobber_item_id) {
        throw new Error(
          "JOB_DESTROY webhook did not contain a Jobber job ID."
        );
      }
      await handleDestroyedJob(event.jobber_item_id);
      return;
    }

    case "INVOICE_CREATE":
    case "INVOICE_UPDATE": {
      if (!event.jobber_item_id) {
        throw new Error(
          `${topic} webhook did not contain a Jobber invoice ID.`
        );
      }
      await syncSingleInvoice(event.jobber_item_id);
      return;
    }
    case "INVOICE_DESTROY": {
      if (!event.jobber_item_id) {
        throw new Error(
          "INVOICE_DESTROY webhook did not contain a Jobber invoice ID."
        );
      }
      await handleDestroyedInvoice(event.jobber_item_id);
      return;
    }

    case "VISIT_CREATE":
    case "VISIT_UPDATE": {
      if (!event.jobber_item_id) {
        throw new Error(
          `${topic} webhook did not contain a Jobber visit ID.`
        );
      }
      await syncSingleVisit(event.jobber_item_id);
      return;
    }
    case "VISIT_DESTROY": {
      if (!event.jobber_item_id) {
        throw new Error(
          "VISIT_DESTROY webhook did not contain a Jobber visit ID."
        );
      }
      await handleDestroyedVisit(event.jobber_item_id);
      return;
    }
    default:
      throw new Error(`Unsupported Jobber webhook topic: ${topic}`);
  }
}

export type ProcessPendingWebhookEventsResult = {
  eventsFound: number;
  processed: number;
  failed: number;
};

// Claims and processes up to EVENT_BATCH_SIZE pending webhook events.
// Safe to call concurrently from multiple triggers (the on-demand call
// after each webhook POST, the cron backstop, and the manual "Process
// Now" button) — each event is claimed by flipping it to "processing"
// individually, and reprocessing an already-processed event is harmless
// since every handler here is an idempotent upsert keyed on the Jobber
// ID. Worst case under overlapping calls is a little redundant work,
// not incorrect data.
export async function processPendingWebhookEvents(): Promise<ProcessPendingWebhookEventsResult> {
  const { data: pendingEvents, error: pendingEventsError } =
    await supabaseServer
      .from("jobber_webhook_events")
      .select("id, topic, jobber_item_id, status, attempts, payload")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(EVENT_BATCH_SIZE);

  if (pendingEventsError) {
    throw new Error(
      `Unable to load pending webhook events: ${pendingEventsError.message}`
    );
  }

  const events = (pendingEvents as WebhookEvent[] | null) ?? [];

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    const nextAttempt = Number(event.attempts ?? 0) + 1;

    const { error: processingUpdateError } = await supabaseServer
      .from("jobber_webhook_events")
      .update({
        status: "processing",
        attempts: nextAttempt,
        error_message: null,
      })
      .eq("id", event.id);

    if (processingUpdateError) {
      console.error(
        `Unable to mark webhook ${event.id} as processing:`,
        processingUpdateError
      );

      failed += 1;

      continue;
    }

    try {
      await processWebhookEvent(event);

      const processedAt = new Date().toISOString();

      const { error: processedUpdateError } = await supabaseServer
        .from("jobber_webhook_events")
        .update({
          status: "processed",
          processed_at: processedAt,
          error_message: null,
        })
        .eq("id", event.id);

      if (processedUpdateError) {
        throw new Error(
          `Unable to mark webhook as processed: ${processedUpdateError.message}`
        );
      }

      processed += 1;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unknown webhook processing error occurred.";

      const finalStatus = nextAttempt >= MAX_ATTEMPTS ? "failed" : "pending";

      const { error: failureUpdateError } = await supabaseServer
        .from("jobber_webhook_events")
        .update({
          status: finalStatus,
          error_message: errorMessage,
        })
        .eq("id", event.id);

      if (failureUpdateError) {
        console.error(
          `Unable to record failure for webhook ${event.id}:`,
          failureUpdateError
        );
      }

      console.error(`Jobber webhook ${event.id} failed:`, error);

      failed += 1;
    }
  }

  return {
    eventsFound: events.length,
    processed,
    failed,
  };
}
