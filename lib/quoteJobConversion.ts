// Turns an accepted quote into a real job. Everything here is
// deliberately defensive about that:
//
// - Never throws. Every code path either succeeds or records a specific
//   error message onto the quote row and returns. Callers (the public
//   accept action and the internal markQuoteStatus action) just call
//   this and move on — a failure never blocks or un-accepts the quote
//   itself, which is already true from the customer's perspective the
//   moment they clicked Accept.
// - Idempotent. If quotes.jobber_job_id is already set, this is a no-op,
//   so accepting twice (double-click, retry after a partial failure)
//   can't create two jobs.
//
// As of Tier 2 (Jobber Independence Roadmap), the job itself is created
// natively via lib/nativeJobs.ts's createNativeJob — straight into this
// app's own jobber_jobs/jobber_visits tables, no Jobber round-trip, no
// property required. As of Tier 4, the client record for a lead-based
// quote is now also created natively (createNativeCustomer below, from
// lib/nativeCustomers.ts) rather than via Jobber's clientCreate mutation
// — nothing downstream (jobs, invoicing, payments) needs the customer to
// actually exist in Jobber anymore.
//
// createNativeCustomer only runs for a lead-based quote with no customer
// record yet. quotes.recipient_address is only ever a flat string (see
// 013_add_quotes.sql), so it's passed through as the new customer's
// street line as-is — there's no reliable way to split it into
// street/city/state/zip here. Staff can clean up the individual address
// fields on the Customer page afterward, same as this app has always
// done for lead-sourced addresses elsewhere.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { createNativeJob } from "@/lib/nativeJobs";
import { createNativeCustomer } from "@/lib/nativeCustomers";

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

    // As of Tier 4, a lead accepting a quote gets a native customer
    // record created directly (see the module comment) instead of a real
    // Jobber client — nothing downstream needs Jobber to know this
    // customer exists.
    if (!clientId && typedQuote.lead_id) {
      const clientResult = await createNativeCustomer({
        fullName: typedQuote.recipient_name || "Customer",
        email: typedQuote.recipient_email,
        phone: typedQuote.recipient_phone,
        street: typedQuote.recipient_address,
        city: null,
        state: null,
        zip: null,
      });

      if (!clientResult.ok) {
        await recordConversionFailure(
          quoteId,
          `Couldn't create the customer: ${clientResult.error}`
        );
        return;
      }

      clientId = clientResult.value.clientId;

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

    // Matches the "{Customer} - {Service}" title convention the whole
    // schedule page's service-coloring logic already expects (see
    // visitServiceLabel in app/(platform)/schedule/page.tsx), so once
    // this job's visit lands on the schedule it shows up correctly
    // colored automatically. The quote's own price and description
    // transfer too — the customer already agreed to this price, no
    // reason to leave the job blank and make staff retype it. No
    // scheduling/recurrence here: quotes are one-off sales documents, not
    // a recurring-service setup, so this always lands as a one-time job
    // (staff set a recurring schedule from Manage Job once the
    // customer's cadence is known). Created natively (Tier 2) rather
    // than via Jobber's jobCreate -- no property needed at all, and the
    // job/visit exist immediately instead of waiting on a sync.
    const quotePrice =
      typedQuote.price_total !== null ? Number(typedQuote.price_total) : NaN;

    const jobResult = await createNativeJob({
      jobberClientId: clientId,
      customerName: typedQuote.recipient_name,
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
