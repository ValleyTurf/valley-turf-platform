// Tier 4 (Jobber Independence Roadmap), Stage 1 -- native customer
// creation, writing directly into the `customers` table instead of
// round-tripping through Jobber's clientCreate mutation (see
// lib/leadJobberClient.ts's and lib/quoteJobConversion.ts's header
// comments for the mutation this replaces). See migration
// 065_add_customers_source.sql for the schema this writes to.
//
// Same "source" convention as jobber_jobs/jobber_visits (migration 054):
// 'jobber' for the entire existing customer base (and the default for any
// row this file doesn't touch), 'native' for anyone created here going
// forward. Reuses lib/nativeJobs.ts's native-<uuid> id convention, so
// every table already keyed on jobber_client_id (13+ of them, per the
// Jobber Independence Roadmap audit) needs no schema change at all -- a
// native customer's id just happens to carry that prefix instead of one
// of Jobber's own opaque base64 ids.
//
// A native customer is also opted straight into native invoicing
// (customers.native_invoicing_enabled = true, invoicing_mode_source =
// 'native') -- they were never in Jobber, so there's no Jobber-side
// invoicing history to preserve, and Stage 7's bucketing question
// (lib/invoicingMode.ts: "does this Jobber client have a card on file in
// Jobber?") doesn't apply to someone who was never a Jobber client.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { generateNativeId } from "@/lib/nativeJobs";
import { validateAddress } from "@/lib/addressValidation";
import { splitName } from "@/lib/leadJobberClient";

export type MutationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type NativeCustomerInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  // Some callers (app/request-quote/actions.ts) already ran Google
  // Address Validation for the lead record itself before this ever
  // runs -- passing the result through here avoids paying for a second
  // API call for the same address.
  knownLatitude?: number | null;
  knownLongitude?: number | null;
  // Referral / lead-source tracking (migration
  // 070_add_customer_referral_source.sql) -- see lib/referralSource.ts.
  // All optional/nullable since most callers (e.g. quote-to-job
  // conversion) don't collect this.
  referralSource?: string | null;
  referredByCustomerId?: string | null;
  referralCampaignId?: string | null;
};

export async function createNativeCustomer(
  input: NativeCustomerInput
): Promise<MutationOutcome<{ clientId: string }>> {
  const fullName = input.fullName.trim() || "Customer";
  const { firstName, lastName } = splitName(fullName);
  const clientId = generateNativeId();

  let latitude = input.knownLatitude ?? null;
  let longitude = input.knownLongitude ?? null;

  if ((latitude === null || longitude === null) && input.street?.trim()) {
    const validation = await validateAddress({
      addressLine: input.street,
      city: input.city,
      state: input.state,
      zip: input.zip,
    });

    latitude = validation?.latitude ?? null;
    longitude = validation?.longitude ?? null;
  }

  const geoStatus = latitude !== null && longitude !== null ? "native_validated" : null;

  const { error } = await supabaseServer.from("customers").insert({
    jobber_client_id: clientId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    company_name: null,
    email: input.email,
    phone: input.phone,
    address_line_1: input.street,
    address_line_2: null,
    city: input.city,
    state: input.state,
    postal_code: input.zip,
    country: input.street ? "US" : null,
    current_balance: 0,
    last_synced_at: new Date().toISOString(),
    latitude,
    longitude,
    geo_status: geoStatus,
    source: "native",
    native_invoicing_enabled: true,
    invoicing_mode_source: "native",
    referral_source: input.referralSource ?? null,
    referred_by_customer_id: input.referredByCustomerId ?? null,
    referral_campaign_id: input.referralCampaignId ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, value: { clientId } };
}
