// Turns an accepted quote into a real job in Jobber — the first piece of
// this app that ever WRITES to Jobber's API rather than just reading from
// it. Everything here is deliberately defensive about that:
//
// - Never throws. Every code path either succeeds or records a specific
//   error message onto the quote row and returns. Callers (the public
//   accept action and the internal markQuoteStatus action) just call
//   this and move on — a Jobber outage or a bad field never blocks or
//   un-accepts the quote itself, which is already true from the
//   customer's perspective the moment they clicked Accept.
// - Idempotent. If quotes.jobber_job_id is already set, this is a no-op,
//   so accepting twice (double-click, retry after a partial failure)
//   can't create two jobs.
//
// jobCreate itself (JOB_CREATE_MUTATION, fetchExistingPropertyId,
// createJobberJob) lives in lib/jobberJob.ts now — shared with the manual
// "New Job" flow at app/(platform)/jobs/new, which needs the exact same
// property-resolution + jobCreate call. This file keeps only what's
// specific to quotes: turning a lead into a real Jobber client (with an
// initial property) and the retry/error bookkeeping on the quotes row.
//
// jobCreate's real requirements (confirmed via live introspection against
// Jobber's own schema, not docs). JobCreateAttributes needs a propertyId
// (NOT a clientId — jobs attach to a property) and an invoicing object
// with two required enums. So this module always resolves a propertyId
// before calling jobCreate:
//   - Existing customer (quote.customer_id already a real Jobber client
//     id): fetch their first existing property via client.clientProperties.
//   - New client (lead-based quote, no Jobber client yet): create the
//     client and, in the same clientCreate call, an initial property.
//     quotes.recipient_address is only ever a flat string (see
//     013_add_quotes.sql), so it goes into the property's street1 line
//     as-is — there's no reliable way to split it into
//     street1/city/province/postalCode here. Staff can clean up the
//     individual address fields in Jobber afterward, same as pricing and
//     scheduling already get filled in manually post-creation.
//   - If neither resolves a property, job creation is skipped and
//     recorded as a retryable error asking staff to add a property in
//     Jobber first — never guessed at.
// invoicing is set to { invoicingType: FIXED_PRICE, invoicingSchedule:
// NEVER } so Jobber doesn't auto-generate an invoice off incomplete data;
// staff creates the real invoice in Jobber once pricing/scheduling are
// filled in, matching how this app already treats those fields.
//
// NOTE: this app's Jobber connection is currently configured read-only.
// None of this will actually succeed until write access is enabled for
// the Jobber app (Jobber Developer Center) and the connection is
// reconnected here to pick up a token with that scope — see
// /settings/jobber.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { jobberGraphQL } from "@/lib/jobber";
import {
  createJobberJob,
  fetchExistingPropertyId,
  type MutationOutcome,
} from "@/lib/jobberJob";

type QuoteForConversion = {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  service_category: string | null;
  description: string | null;
  price_total: number | string | null;
  jobber_job_id: string | null;
};

const CLIENT_CREATE_MUTATION = `
  mutation CreateClientFromQuote($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client {
        id
        clientProperties(first: 1) {
          nodes {
            id
          }
        }
      }
      userErrors {
        message
      }
    }
  }
`;

function splitName(fullName: string): {
  firstName: string;
  lastName: string | null;
} {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return { firstName: trimmed || "Customer", lastName: null };
  }

  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || null,
  };
}

async function createJobberClientForQuote(
  quote: QuoteForConversion
): Promise<MutationOutcome<{ clientId: string; propertyId: string | null }>> {
  const { firstName, lastName } = splitName(quote.recipient_name || "Customer");

  const input: Record<string, unknown> = {
    firstName,
    ...(lastName ? { lastName } : {}),
  };

  if (quote.recipient_email) {
    input.emails = [
      { description: "MAIN", primary: true, address: quote.recipient_email },
    ];
  }

  if (quote.recipient_phone) {
    input.phones = [
      { description: "MAIN", primary: true, number: quote.recipient_phone },
    ];
  }

  // See the module comment: quotes.recipient_address is a flat string, so
  // it goes into street1 as-is rather than being split into structured
  // fields we don't have. PropertyAttributes.address is required, so we
  // only attempt this when there's actually an address to send —
  // otherwise leave properties unset and let the "no property" retry path
  // below tell staff to add one in Jobber.
  const trimmedAddress = quote.recipient_address?.trim();
  if (trimmedAddress) {
    input.properties = [{ address: { street1: trimmedAddress } }];
  }

  const { data, errors } = await jobberGraphQL<{
    clientCreate: {
      client: {
        id: string;
        clientProperties: { nodes: { id: string }[] } | null;
      } | null;
      userErrors: { message: string }[];
    };
  }>(CLIENT_CREATE_MUTATION, { input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.clientCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  const clientId = data?.clientCreate?.client?.id;
  if (!clientId) {
    return { ok: false, error: "Jobber did not return a client id." };
  }

  const propertyId =
    data?.clientCreate?.client?.clientProperties?.nodes?.[0]?.id ?? null;

  return { ok: true, value: { clientId, propertyId } };
}

async function recordConversionFailure(
  quoteId: string,
  message: string
): Promise<void> {
  await supabaseServer
    .from("quotes")
    .update({
      job_creation_error: message,
      job_creation_attempted_at: new Date().toISOString(),
    })
    .eq("id", quoteId);
}

export async function attemptQuoteJobConversion(
  quoteId: string
): Promise<void> {
  try {
    const { data: quote, error } = await supabaseServer
      .from("quotes")
      .select(
        "id, customer_id, lead_id, recipient_name, recipient_email, recipient_phone, recipient_address, service_category, description, price_total, jobber_job_id"
      )
      .eq("id", quoteId)
      .single();

    if (error || !quote) {
      console.error(
        "attemptQuoteJobConversion: quote not found",
        quoteId,
        error?.message
      );
      return;
    }

    if (quote.jobber_job_id) {
      // Already created — idempotent no-op.
      return;
    }

    const typedQuote = quote as QuoteForConversion;
    let clientId = typedQuote.customer_id;
    let propertyId: string | null = null;

    if (!clientId && typedQuote.lead_id) {
      const clientResult = await createJobberClientForQuote(typedQuote);

      if (!clientResult.ok) {
        await recordConversionFailure(
          quoteId,
          `Couldn't create Jobber client: ${clientResult.error}`
        );
        return;
      }

      clientId = clientResult.value.clientId;
      propertyId = clientResult.value.propertyId;

      await supabaseServer
        .from("quotes")
        .update({ customer_id: clientId })
        .eq("id", quoteId);

      await supabaseServer
        .from("leads")
        .update({ jobber_client_id: clientId, status: "converted" })
        .eq("id", typedQuote.lead_id);
    }

    if (!clientId) {
      await recordConversionFailure(
        quoteId,
        "Quote has no linked customer or lead to create a job for."
      );
      return;
    }

    if (!propertyId) {
      propertyId = await fetchExistingPropertyId(clientId);
    }

    if (!propertyId) {
      await recordConversionFailure(
        quoteId,
        "Couldn't find a Jobber property for this customer. Add a property to their Jobber client record, then retry."
      );
      return;
    }

    // Matches the "{Customer} - {Service}" title convention the whole
    // schedule page's service-coloring logic already expects (see
    // visitServiceLabel in app/(platform)/schedule/page.tsx), so once this
    // job gets a visit scheduled in Jobber, it shows up correctly colored
    // on our own schedule automatically. The quote's own price and
    // description transfer too — the customer already agreed to this
    // price, no reason to leave the job blank and make staff retype it
    // in Jobber. No scheduling/recurrence here: quotes are one-off sales
    // documents, not a recurring-service setup, so this always lands as
    // a one-time job (staff schedule the visit in Jobber, or set up a
    // recurring plan there once the customer's cadence is known).
    const quotePrice =
      typedQuote.price_total !== null ? Number(typedQuote.price_total) : NaN;

    const jobResult = await createJobberJob({
      propertyId,
      title: `${typedQuote.recipient_name} - ${typedQuote.service_category || "Service"}`,
      instructions: typedQuote.description,
      price: Number.isFinite(quotePrice) ? quotePrice : null,
    });

    if (!jobResult.ok) {
      await recordConversionFailure(quoteId, jobResult.error);
      return;
    }

    await supabaseServer
      .from("quotes")
      .update({
        jobber_job_id: jobResult.value.jobId,
        jobber_job_number: jobResult.value.jobNumber,
        job_creation_error: null,
        job_creation_attempted_at: new Date().toISOString(),
      })
      .eq("id", quoteId);
  } catch (error) {
    console.error("attemptQuoteJobConversion threw:", error);

    await recordConversionFailure(
      quoteId,
      error instanceof Error
        ? error.message
        : "Unknown error creating the Jobber job."
    );
  }
}
