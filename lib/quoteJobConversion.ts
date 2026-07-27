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
// - Minimal Jobber payloads. jobCreate technically supports far more
//   (property, line items, scheduling) but this app has no reliable way
//   to verify those exact input field names without live access to
//   Jobber's GraphiQL schema explorer, and a single wrong field name
//   fails the whole mutation. v1 only sends what Jobber's own docs
//   confirm: clientId + title for the job, firstName/lastName/emails/
//   phones for a new client. Property/pricing still get filled in
//   manually in Jobber after creation.
//
// NOTE: this app's Jobber connection is currently configured read-only.
// None of this will actually succeed until write access is enabled for
// the Jobber app (Jobber Developer Center) and the connection is
// reconnected here to pick up a token with that scope — see
// /settings/jobber.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { jobberGraphQL } from "@/lib/jobber";

type QuoteForConversion = {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  service_category: string | null;
  jobber_job_id: string | null;
};

type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const CLIENT_CREATE_MUTATION = `
  mutation CreateClientFromQuote($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

const JOB_CREATE_MUTATION = `
  mutation CreateJobFromQuote($input: JobCreateInput!) {
    jobCreate(input: $input) {
      job {
        id
        jobNumber
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
): Promise<MutationOutcome<string>> {
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

  const { data, errors } = await jobberGraphQL<{
    clientCreate: {
      client: { id: string } | null;
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

  return { ok: true, value: clientId };
}

async function createJobberJobForQuote(
  quote: QuoteForConversion,
  clientId: string
): Promise<MutationOutcome<{ jobId: string; jobNumber: string | null }>> {
  // Matches the "{Customer} - {Service}" title convention the whole
  // schedule page's service-coloring logic already expects (see
  // visitServiceLabel in app/(platform)/schedule/page.tsx), so once this
  // job gets a visit scheduled in Jobber, it shows up correctly colored
  // on our own schedule automatically.
  const title = `${quote.recipient_name} - ${quote.service_category || "Service"}`;

  const input: Record<string, unknown> = {
    clientId,
    title,
  };

  const { data, errors } = await jobberGraphQL<{
    jobCreate: {
      job: { id: string; jobNumber: string | number | null } | null;
      userErrors: { message: string }[];
    };
  }>(JOB_CREATE_MUTATION, { input });

  if (errors?.length) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.jobCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  const job = data?.jobCreate?.job;
  if (!job?.id) {
    return { ok: false, error: "Jobber did not return a job id." };
  }

  return {
    ok: true,
    value: {
      jobId: job.id,
      jobNumber: job.jobNumber != null ? String(job.jobNumber) : null,
    },
  };
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
        "id, customer_id, lead_id, recipient_name, recipient_email, recipient_phone, service_category, jobber_job_id"
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

    if (!clientId && typedQuote.lead_id) {
      const clientResult = await createJobberClientForQuote(typedQuote);

      if (!clientResult.ok) {
        await recordConversionFailure(
          quoteId,
          `Couldn't create Jobber client: ${clientResult.error}`
        );
        return;
      }

      clientId = clientResult.value;

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

    const jobResult = await createJobberJobForQuote(typedQuote, clientId);

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
