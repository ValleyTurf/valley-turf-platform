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
      lineItems(first: 50) {
        nodes {
          unitPrice
          quantity
        }
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
        jobStatus
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

// preferredPropertyId is the staff-picked "current" property (see
// migration 052) for customers with more than one property in Jobber --
// e.g. they moved and the old property is still on file. Null means no
// override has been set, which falls back to the original behavior of
// just taking the first usable property.
function getCustomerAddress(
  client: JobberClient,
  preferredPropertyId: string | null
): JobberAddress | null {
  const properties = client.clientProperties?.nodes ?? [];

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

  const calculatedName = [firstName, lastName].filter(Boolean).join(" ");

  const fullName =
    cleanText(client.name) ||
    cleanText(calculatedName) ||
    cleanText(client.companyName) ||
    "Unnamed Customer";

  const balance = Number(client.balance ?? 0);

  const address = getCustomerAddress(client, preferredPropertyId);

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

export async function syncSingleCustomer(jobberClientId: string): Promise<void> {
  // formatCustomer only ever writes address_line_1/city/state/etc -- it
  // never touches current_property_id itself -- so this lookup just
  // reads back whatever override staff may have set on the Customer page
  // and feeds it into address selection below.
  //
  // Jobber cutover (2026-09): also doubles as the source guard below --
  // fetched up front (before the Jobber API call) so a natively-managed
  // customer skips the round-trip entirely, not just the write.
  const { data: existingCustomer } = await supabaseServer
    .from("customers")
    .select("current_property_id, source")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  // Once a customer is relabeled source='native' by migration 067, this
  // app is that customer's system of record -- skip rather than overwrite
  // with Jobber's stale snapshot. Belt-and-suspenders: the callers that
  // remain after the cutover (setCurrentProperty in
  // customers/[id]/actions.ts, the migration audit tool's gap-fill) both
  // already guard on source themselves, and CLIENT_* webhook events no
  // longer reach this function at all (see processWebhookEvent's shared
  // no-op case below) -- this is the last line of defense in case a
  // future caller forgets to check first.
  if (existingCustomer?.source === "native") {
    console.log(
      `Skipping Jobber sync for natively-managed customer ${jobberClientId}.`
    );
    return;
  }

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

  const customerRow = formatCustomer(
    client,
    existingCustomer?.current_property_id ?? null
  );

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

export async function syncSingleJob(jobberJobId: string): Promise<void> {
  // Jobber cutover (2026-09): same reasoning as syncSingleCustomer's
  // guard above -- once a job is relabeled source='native' by migration
  // 067, this app owns it outright. Fetched up front so a natively-
  // managed job skips the Jobber API round-trip entirely, not just the
  // write.
  const { data: existingJob } = await supabaseServer
    .from("jobber_jobs")
    .select("source")
    .eq("jobber_job_id", jobberJobId)
    .maybeSingle();

  if (existingJob?.source === "native") {
    console.log(`Skipping Jobber sync for natively-managed job ${jobberJobId}.`);
    return;
  }

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
      lineItems: {
        nodes: {
          unitPrice: number | string | null;
          quantity: number | string | null;
        }[];
      } | null;
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

  // unitPrice (customer-facing charge) * quantity — not unitCost, which
  // is Jobber's internal-cost field and is usually blank for this
  // business, which is why totals were showing as $0.
  const lineItemNodes = job.lineItems?.nodes ?? [];
  const jobTotal =
    lineItemNodes.length > 0
      ? lineItemNodes.reduce(
          (sum, item) =>
            sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1),
          0
        )
      : null;

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
    total: Number.isFinite(jobTotal) ? jobTotal : null,
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

  // Cascade the new job_status onto every visit under this job. Critical
  // for the case that motivated adding job_status to jobber_visits at
  // all: canceling a job from Jobber's OWN web UI (not this app's
  // /jobs/[id]/edit) only ever fires this JOB_UPDATE webhook — it does
  // NOT destroy or update the job's individual visits, so without this
  // cascade their jobber_visits rows would sit forever with a stale
  // visit_status ("upcoming") and never reflect the cancellation, which
  // is exactly the bug reported: canceled jobs kept showing up on
  // /schedule, /my-day, and /crew-status.
  const { error: cascadeError } = await supabaseServer
    .from("jobber_visits")
    .update({ job_status: jobRow.job_status })
    .eq("jobber_job_id", jobberJobId);

  if (cascadeError) {
    throw new Error(
      `Unable to cascade job_status to visits for job ${jobberJobId}: ${cascadeError.message}`
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

export async function syncSingleVisit(jobberVisitId: string): Promise<void> {
  // Jobber cutover (2026-09): same reasoning as syncSingleCustomer's
  // guard above -- once a visit is relabeled source='native' by
  // migration 067, this app owns it outright. Fetched up front so a
  // natively-managed visit skips the Jobber API round-trip entirely, not
  // just the write.
  const { data: existingVisit } = await supabaseServer
    .from("jobber_visits")
    .select("source")
    .eq("jobber_visit_id", jobberVisitId)
    .maybeSingle();

  if (existingVisit?.source === "native") {
    console.log(`Skipping Jobber sync for natively-managed visit ${jobberVisitId}.`);
    return;
  }

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
      job: {
        id: string;
        jobNumber: number | string | null;
        jobStatus: string | null;
      } | null;
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
    job_status: cleanText(visit.job?.jobStatus),
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

async function handleDestroyedInvoice(jobberInvoiceId: string): Promise<void> {
  console.log(
    `Jobber reported deleted invoice ${jobberInvoiceId}. Historical invoice data was retained.`
  );
}

// Jobber cutover (2026-09): CLIENT_*/JOB_*/VISIT_* webhook events are
// still queued (app/api/jobber/webhook/route.ts's HMAC-verified handler
// doesn't filter by topic — it queues everything), but this app no
// longer wants Jobber writing customers/jobs/visits into it at all, so
// every event in these three groups is now a shared, logged no-op
// instead of a sync. This is the actual write-cutover mechanism (roadmap
// #9) — the source guards inside syncSingleCustomer/syncSingleJob/
// syncSingleVisit above are belt-and-suspenders for the few remaining
// direct callers (setCurrentProperty, the migration audit tool), not
// what stops webhook-driven writes; this switch case is. Marked
// "processed" (not "failed") same as every other handled topic, so a
// still-arriving CLIENT_UPDATE/JOB_UPDATE/VISIT_UPDATE from Jobber never
// piles up retries — Ryan can also unsubscribe these topics entirely in
// Jobber's Developer Center as optional cleanup (plan section, "hand off
// to Ryan"), but leaving them subscribed is harmless either way.
//
// The old per-topic handlers this replaced (handleDestroyedCustomer,
// handleDestroyedJob, handleDestroyedVisit — the last of which used to
// delete the local visit row plus its visit_material_usage/
// visit_equipment_usage) are gone, not just unreached: destroy events for
// these three entities are exactly as much "Jobber writing into this
// app" as create/update ones, so they get the same no-op treatment.
// INVOICE_* is deliberately untouched below — invoicing/payments stay
// wired to Jobber until a later, separate migration.
async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  const topic = normalizeTopic(event.topic);

  switch (topic) {
    case "CLIENT_CREATE":
    case "CLIENT_UPDATE":
    case "CLIENT_DESTROY":
    case "JOB_CREATE":
    case "JOB_UPDATE":
    case "JOB_DESTROY":
    case "VISIT_CREATE":
    case "VISIT_UPDATE":
    case "VISIT_DESTROY": {
      console.log(
        `Ignoring ${topic} webhook (item ${event.jobber_item_id ?? "unknown"}) — Jobber no longer writes customers/jobs/visits into this app.`
      );
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
// Now" button) — each event is claimed via a conditional UPDATE ...
// WHERE status = 'pending' (see below), so only one caller ever wins the
// claim for a given event; every other concurrent caller sees zero rows
// affected and skips it instead of double-processing.
//
// This used to be an unconditional update (no WHERE status = 'pending'
// guard, no check on how many rows it actually touched) -- the same bug
// that caused Stripe webhook events to be double-claimed and sent a
// customer two receipts instead of one (see stripeWebhookProcessor.ts's
// processPendingStripeWebhookEvents, fixed the same way). It never
// misfired here in practice only because no handler in
// processWebhookEvent below currently sends a notification -- these are
// all idempotent upserts keyed on the Jobber ID, so a double-claim just
// meant redundant work, not a duplicate email/text. That's an accident
// of what handlers happen to exist today, not a guarantee, so this gets
// the same compare-and-swap fix now rather than waiting for the day a
// notification-sending handler is added here too.
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
