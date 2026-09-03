"use server";

// Server Action backing the public /request-quote form — the site's own
// quote-request intake, built to replace the Jobber-embedded form as the
// thing customers actually submit (see 050_add_lead_form_fields.sql for
// the full "why" on this). No auth check: this route is public (see
// proxy.ts PUBLIC_PATHS), same trust model as /q/[token] and /pay/[token].
import { supabaseServer } from "@/lib/supabase-server";
import { validateAddress } from "@/lib/addressValidation";
import { createJobberClientForLead, splitName } from "@/lib/leadJobberClient";

export type SubmitQuoteRequestInput = {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  turfSizeRange: string;
  notes: string;
  photoPaths: string[];
  smsConsent: boolean;
};

export type SubmitQuoteRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitQuoteRequest(
  input: SubmitQuoteRequestInput
): Promise<SubmitQuoteRequestResult> {
  const fullName = input.fullName?.trim();
  const phone = input.phone?.trim();
  const street = input.street?.trim();
  const city = input.city?.trim();
  const zip = input.zip?.trim();
  const state = input.state?.trim() || "AZ";

  const turfSizeRange = input.turfSizeRange?.trim() || null;

  if (!fullName || !phone || !street || !city || !zip || !turfSizeRange) {
    return {
      ok: false,
      error:
        "Name, phone, service address, and approximate square footage are required.",
    };
  }

  // Twilio's A2P 10DLC review requires clear, affirmative opt-in for
  // texting — the client-side checkbox is `required`, but that's just
  // UX; browsers can be worked around, so this is the real gate. Never
  // trust smsConsent === true without this check.
  if (!input.smsConsent) {
    return {
      ok: false,
      error: "Please check the box to agree to receive text messages.",
    };
  }

  const email = input.email?.trim() || null;
  const notes = input.notes?.trim() || null;
  const photoPaths = Array.isArray(input.photoPaths) ? input.photoPaths : [];

  const { firstName, lastName } = splitName(fullName);

  // Fails soft (null) if GOOGLE_ADDRESS_VALIDATION_API_KEY isn't
  // configured — same as app/api/leads/route.ts.
  const validation = await validateAddress({
    addressLine: street,
    city,
    state,
    zip,
  });

  const { data: insertedLead, error: insertError } = await supabaseServer
    .from("leads")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address: street,
      city,
      state,
      zip,
      source: "Website Form",
      notes,
      status: "New",
      turf_size_range: turfSizeRange,
      photo_paths: photoPaths,
      sms_consent: true,
      sms_consent_at: new Date().toISOString(),
      address_validation_status: validation?.status ?? null,
      address_validated_at: validation ? new Date().toISOString() : null,
      address_formatted: validation?.formattedAddress ?? null,
      address_lat: validation?.latitude ?? null,
      address_lng: validation?.longitude ?? null,
    })
    .select("id")
    .single();

  if (insertError || !insertedLead) {
    console.error("submitQuoteRequest: lead insert failed", insertError?.message);
    return {
      ok: false,
      error: "Something went wrong saving your request. Please call or text us instead.",
    };
  }

  // Best-effort: turn this lead into a real Jobber client + property right
  // away. Never blocks the submission the customer sees — a Jobber outage
  // or write-access issue just leaves the lead exactly as before (visible
  // on the Leads page, convertible manually), same fallback that's always
  // existed.
  try {
    const clientResult = await createJobberClientForLead({
      fullName,
      email,
      phone,
      street,
      city,
      state,
      zip,
    });

    if (clientResult.ok) {
      await supabaseServer
        .from("leads")
        .update({ jobber_client_id: clientResult.value.clientId })
        .eq("id", insertedLead.id);
    } else {
      console.error(
        "submitQuoteRequest: Jobber client creation failed:",
        clientResult.error
      );
    }
  } catch (error) {
    console.error("submitQuoteRequest: Jobber client creation threw:", error);
  }

  return { ok: true };
}
