// Native autopay (Tier 1 prerequisite before Stage 7's real /invoices
// cutover -- see the "Build native autopay + SMS delivery first"
// decision, driven by the fact that Jobber-side autopay customers have
// no equivalent yet in this app).
//
// Cards are saved via a Stripe Checkout Session in `setup` mode --
// same hosted-redirect approach as lib/stripeCheckout.ts's payment-mode
// sessions, so card data still never touches this app's server and the
// integration stays at PCI SAQ A rather than needing embedded Elements
// (SAQ A-EP). A `setup` session produces a SetupIntent instead of a
// PaymentIntent; lib/stripeWebhookProcessor.ts's setup_intent.succeeded
// handler is what actually attaches the resulting payment method to
// customer_payment_methods (migration 047) once the customer finishes
// the Stripe-hosted form.
//
// Off-session charging (attemptAutopayCharge) is the other half: called
// wherever a native invoice is created for an autopay-enabled client
// (today, only the /invoice-test harness -- Stage 7 wires this into the
// real flow), it tries a direct PaymentIntent against the saved card
// and reports back whether it worked, so the caller can fall back to
// the normal email/SMS Pay Now link on any failure (declined card,
// requires 3D Secure authentication, etc.) rather than leaving the
// invoice stranded.
import "server-only";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { getStripeClient } from "@/lib/stripe";
import type { Invoice } from "@/lib/invoices";

export type CustomerPaymentMethod = {
  jobberClientId: string;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  autopayEnabled: boolean;
  enrollmentToken: string | null;
};

type PaymentMethodRow = {
  jobber_client_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  autopay_enabled: boolean;
  enrollment_token: string | null;
};

const SELECT_COLUMNS =
  "jobber_client_id, stripe_customer_id, stripe_payment_method_id, card_brand, card_last4, autopay_enabled, enrollment_token";

function toCustomerPaymentMethod(row: PaymentMethodRow): CustomerPaymentMethod {
  return {
    jobberClientId: row.jobber_client_id,
    stripeCustomerId: row.stripe_customer_id,
    stripePaymentMethodId: row.stripe_payment_method_id,
    cardBrand: row.card_brand,
    cardLast4: row.card_last4,
    autopayEnabled: row.autopay_enabled,
    enrollmentToken: row.enrollment_token,
  };
}

export async function getPaymentMethodByClientId(
  jobberClientId: string
): Promise<CustomerPaymentMethod | null> {
  const { data, error } = await supabaseServer
    .from("customer_payment_methods")
    .select(SELECT_COLUMNS)
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (error) {
    console.error("Failed to look up customer_payment_methods:", error);
    return null;
  }

  return data ? toCustomerPaymentMethod(data as PaymentMethodRow) : null;
}

export async function getPaymentMethodByEnrollmentToken(
  token: string
): Promise<CustomerPaymentMethod | null> {
  const { data, error } = await supabaseServer
    .from("customer_payment_methods")
    .select(SELECT_COLUMNS)
    .eq("enrollment_token", token)
    .maybeSingle();

  if (error) {
    console.error("Failed to look up customer_payment_methods by token:", error);
    return null;
  }

  return data ? toCustomerPaymentMethod(data as PaymentMethodRow) : null;
}

function generateEnrollmentToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Used by the staff-facing "Get autopay link" action on the Customer
// page -- creates the row (with a fresh token) if this client has never
// started an enrollment, or returns the existing token if they have.
// Never touches stripe_customer_id/payment method columns.
export async function getOrCreateEnrollmentToken(
  jobberClientId: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const existing = await getPaymentMethodByClientId(jobberClientId);

  if (existing?.enrollmentToken) {
    return { ok: true, token: existing.enrollmentToken };
  }

  const token = generateEnrollmentToken();

  const { error } = await supabaseServer.from("customer_payment_methods").upsert(
    {
      jobber_client_id: jobberClientId,
      enrollment_token: token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "jobber_client_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, token };
}

export type CreateAutopaySetupSessionParams = {
  jobberClientId: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CreateAutopaySetupSessionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Creates (or reuses) a Stripe Customer for this Jobber client, then a
// Checkout Session in `setup` mode against it. Reusing the same Stripe
// Customer across enrollment attempts means "update my card" later is
// just another setup session against the same customer -- the new
// payment method replaces the old one once setup_intent.succeeded fires
// (see lib/stripeWebhookProcessor.ts).
export async function createAutopaySetupSession(
  params: CreateAutopaySetupSessionParams
): Promise<CreateAutopaySetupSessionResult> {
  const { jobberClientId, customerEmail, successUrl, cancelUrl } = params;

  try {
    const stripe = getStripeClient();
    const existing = await getPaymentMethodByClientId(jobberClientId);

    let stripeCustomerId = existing?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customerEmail || undefined,
        metadata: { jobber_client_id: jobberClientId },
      });

      stripeCustomerId = customer.id;

      const { error } = await supabaseServer.from("customer_payment_methods").upsert(
        {
          jobber_client_id: jobberClientId,
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "jobber_client_id" }
      );

      if (error) {
        return { ok: false, error: error.message };
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Card only, unlike the payment-mode session in
      // lib/stripeCheckout.ts (which also offers us_bank_account/ACH).
      // Two reasons: (1) bank-debit payment methods are currency-scoped
      // in Stripe's API, so a `setup` mode session that allows them
      // requires an explicit top-level `currency` param -- with none
      // specified, Checkout falls back to every payment method enabled
      // in the Dashboard and errors with "Missing required param:
      // currency" the moment ACH is one of them. (2) ACH debits need a
      // micro-deposit/instant verification step and aren't a good fit
      // for "save now, charge automatically and immediately later"
      // anyway -- off-session autopay charging is a card-only feature
      // here.
      payment_method_types: ["card"],
      // Not copied to the resulting SetupIntent automatically -- same
      // gotcha as payment_intent_data on the payment-mode session in
      // lib/stripeCheckout.ts. Without this, setup_intent.succeeded
      // would have no way to know which client the saved card belongs
      // to (the SetupIntent's `customer` field is the Stripe id, not
      // the Jobber client id).
      setup_intent_data: { metadata: { jobber_client_id: jobberClientId } },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return { ok: true, url: session.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error.";
    console.error("Failed to create autopay setup session:", message);
    return { ok: false, error: message };
  }
}

// Called from lib/stripeWebhookProcessor.ts once a SetupIntent
// succeeds -- fetches the card's brand/last4 for display, sets it as
// the customer's default payment method, and turns autopay on. Saving a
// card is treated as opting in; the customer (or staff) can turn it
// back off without removing the card via setAutopayEnabled below.
export async function attachPaymentMethodFromSetupIntent(
  setupIntent: Stripe.SetupIntent
): Promise<void> {
  const jobberClientId = setupIntent.metadata?.jobber_client_id;
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : (setupIntent.payment_method?.id ?? null);
  const stripeCustomerId =
    typeof setupIntent.customer === "string"
      ? setupIntent.customer
      : (setupIntent.customer?.id ?? null);

  if (!jobberClientId || !paymentMethodId || !stripeCustomerId) {
    console.error(
      `setup_intent.succeeded ${setupIntent.id} is missing jobber_client_id metadata, payment_method, or customer -- cannot attach.`
    );
    return;
  }

  const stripe = getStripeClient();

  let cardBrand: string | null = null;
  let cardLast4: string | null = null;

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    cardBrand = paymentMethod.card?.brand ?? null;
    cardLast4 = paymentMethod.card?.last4 ?? null;

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  } catch (error) {
    // Best-effort -- the payment method is still usable for off-session
    // charging even without brand/last4 on file or a default set on the
    // Customer object; worth logging, not worth failing the whole event.
    console.error(
      `Failed to fetch/attach payment method details for ${paymentMethodId}:`,
      error
    );
  }

  const { error } = await supabaseServer.from("customer_payment_methods").upsert(
    {
      jobber_client_id: jobberClientId,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: paymentMethodId,
      card_brand: cardBrand,
      card_last4: cardLast4,
      autopay_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "jobber_client_id" }
  );

  if (error) {
    throw new Error(`Failed to save autopay payment method: ${error.message}`);
  }
}

export async function setAutopayEnabled(
  jobberClientId: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer
    .from("customer_payment_methods")
    .update({ autopay_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export type AttemptAutopayChargeResult =
  | { charged: true }
  | { charged: false; reason: string };

// Tries to charge an autopay-enabled client's saved card off-session
// for the full invoice total. Returns {charged:false} rather than
// throwing for anything that should fall back to the normal Pay Now
// link -- not enrolled, no card on file, or the charge itself failing
// (declined, requires authentication, etc.) are all just "autopay
// didn't work this time," not application errors.
//
// Doesn't touch the invoice or payments tables directly on success --
// same as the Pay Now flow, the authoritative write happens once
// payment_intent.succeeded arrives via the webhook (lib/stripeWebhookProcessor.ts),
// keeping exactly one code path responsible for marking an invoice paid.
export async function attemptAutopayCharge(
  invoice: Invoice
): Promise<AttemptAutopayChargeResult> {
  if (!invoice.jobberClientId) {
    return { charged: false, reason: "Invoice has no linked customer." };
  }

  const paymentMethod = await getPaymentMethodByClientId(invoice.jobberClientId);

  if (
    !paymentMethod ||
    !paymentMethod.autopayEnabled ||
    !paymentMethod.stripeCustomerId ||
    !paymentMethod.stripePaymentMethodId
  ) {
    return { charged: false, reason: "Customer is not enrolled in autopay." };
  }

  const amountCents = Math.round(invoice.total * 100);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { charged: false, reason: "Invoice has no valid amount to charge." };
  }

  try {
    const stripe = getStripeClient();

    await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: paymentMethod.stripeCustomerId,
      payment_method: paymentMethod.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `Invoice ${invoice.invoiceNumber}`,
      metadata: { invoice_id: invoice.id },
    });

    return { charged: true };
  } catch (error) {
    // The common failure here is a Stripe.errors.StripeCardError with
    // code "authentication_required" (the bank wants 3D Secure, which
    // can't happen off-session) -- caught generically rather than
    // type-narrowed to StripeCardError specifically, since the `stripe`
    // package's error classes aren't available to check against in this
    // sandbox (no network access to inspect node_modules).
    const message = error instanceof Error ? error.message : "Autopay charge failed.";
    console.error(
      `Autopay charge failed for invoice ${invoice.invoiceNumber}:`,
      message
    );
    return { charged: false, reason: message };
  }
}
