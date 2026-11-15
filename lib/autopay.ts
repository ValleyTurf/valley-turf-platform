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
// wherever a native invoice is created and sent for an autopay-enabled
// client (app/(platform)/invoices/actions.ts's createNativeInvoiceForVisit
// and resendInvoice -- the real flow, used by InvoiceCard on both
// /invoices/create and My Day's Ready to Invoice), it tries a direct
// PaymentIntent against the saved card and reports back whether it
// worked, so the caller can fall back to the normal email/SMS Pay Now
// link on any failure (declined card, requires 3D Secure authentication,
// etc.) rather than leaving the invoice stranded. That same fallback
// path also offers autopay enrollment right on the invoice itself (see
// those functions' autopayUrl/getOrCreateEnrollmentToken usage), not
// just via a separately-shared link.
import "server-only";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { getStripeClient } from "@/lib/stripe";
import type { Invoice } from "@/lib/invoices";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import {
  DEFAULT_AUTOPAY_SCHEDULE,
  autopayChargeDate,
  isAutopayTiming,
  type AutopaySchedule,
} from "@/lib/autopayTiming";

export type CustomerPaymentMethod = {
  jobberClientId: string;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  autopayEnabled: boolean;
  enrollmentToken: string | null;
  // When to charge (migration 105). Always present -- a row read before
  // that migration has run reports the original charge-on-invoice
  // behavior.
  schedule: AutopaySchedule;
};

type PaymentMethodRow = {
  jobber_client_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  autopay_enabled: boolean;
  enrollment_token: string | null;
  autopay_timing?: string | null;
  autopay_day_of_month?: number | null;
  autopay_delay_days?: number | null;
};

const LEGACY_SELECT_COLUMNS =
  "jobber_client_id, stripe_customer_id, stripe_payment_method_id, card_brand, card_last4, autopay_enabled, enrollment_token";

const SELECT_COLUMNS = `${LEGACY_SELECT_COLUMNS}, autopay_timing, autopay_day_of_month, autopay_delay_days`;

// Postgres "undefined column" -- what a select of the migration-105
// columns returns if that migration hasn't been run yet. Card lookups
// are on the path of every invoice send, so rather than have autopay
// silently stop finding anyone's card in that window, the two lookups
// below retry with the original columns and treat everyone as
// charge-on-invoice.
const UNDEFINED_COLUMN = "42703";

function toCustomerPaymentMethod(row: PaymentMethodRow): CustomerPaymentMethod {
  return {
    jobberClientId: row.jobber_client_id,
    stripeCustomerId: row.stripe_customer_id,
    stripePaymentMethodId: row.stripe_payment_method_id,
    cardBrand: row.card_brand,
    cardLast4: row.card_last4,
    autopayEnabled: row.autopay_enabled,
    enrollmentToken: row.enrollment_token,
    schedule: isAutopayTiming(row.autopay_timing)
      ? {
          timing: row.autopay_timing,
          dayOfMonth: row.autopay_day_of_month ?? null,
          delayDays: row.autopay_delay_days ?? null,
        }
      : DEFAULT_AUTOPAY_SCHEDULE,
  };
}

async function selectPaymentMethod(
  column: "jobber_client_id" | "enrollment_token",
  value: string
): Promise<CustomerPaymentMethod | null> {
  let { data, error } = await supabaseServer
    .from("customer_payment_methods")
    .select(SELECT_COLUMNS)
    .eq(column, value)
    .maybeSingle<PaymentMethodRow>();

  if (error?.code === UNDEFINED_COLUMN) {
    ({ data, error } = await supabaseServer
      .from("customer_payment_methods")
      .select(LEGACY_SELECT_COLUMNS)
      .eq(column, value)
      .maybeSingle<PaymentMethodRow>());
  }

  if (error) {
    console.error(`Failed to look up customer_payment_methods by ${column}:`, error);
    return null;
  }

  return data ? toCustomerPaymentMethod(data) : null;
}

export async function getPaymentMethodByClientId(
  jobberClientId: string
): Promise<CustomerPaymentMethod | null> {
  return selectPaymentMethod("jobber_client_id", jobberClientId);
}

export async function getPaymentMethodByEnrollmentToken(
  token: string
): Promise<CustomerPaymentMethod | null> {
  return selectPaymentMethod("enrollment_token", token);
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

export async function setAutopaySchedule(
  jobberClientId: string,
  schedule: AutopaySchedule
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer
    .from("customer_payment_methods")
    .update({
      autopay_timing: schedule.timing,
      autopay_day_of_month: schedule.timing === "day_of_month" ? schedule.dayOfMonth : null,
      autopay_delay_days: schedule.timing === "days_after_invoice" ? schedule.delayDays : null,
      updated_at: new Date().toISOString(),
    })
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    return {
      ok: false,
      error:
        error.code === UNDEFINED_COLUMN
          ? "Autopay timing isn't available until migration 105 has been run in Supabase."
          : error.message,
    };
  }

  return { ok: true };
}

// The calendar date (Phoenix) an invoice counts as "sent" for autopay
// scheduling -- when it actually went out if we know, otherwise its
// issue date.
export function autopayReferenceDate(invoice: Invoice): string {
  return toPhoenixDateString(invoice.sentAt) ?? invoice.issueDate;
}

export type AutopayPlan =
  // Not enrolled / no card / autopay off -- send the normal Pay Now.
  | { action: "none" }
  // Charge the card right now.
  | { action: "charge_now" }
  // Enrolled, but this customer's schedule says wait until chargeDate.
  | { action: "hold"; chargeDate: string; cardLast4: string | null };

// What should happen card-wise for an invoice being sent today.
export async function planAutopayForInvoice(
  invoice: Invoice,
  todayPhoenix: string
): Promise<AutopayPlan> {
  if (!invoice.jobberClientId) return { action: "none" };

  const paymentMethod = await getPaymentMethodByClientId(invoice.jobberClientId);

  if (
    !paymentMethod ||
    !paymentMethod.autopayEnabled ||
    !paymentMethod.stripeCustomerId ||
    !paymentMethod.stripePaymentMethodId
  ) {
    return { action: "none" };
  }

  // Sent "today" by definition here, whatever sentAt says so far.
  const chargeDate = autopayChargeDate(todayPhoenix, paymentMethod.schedule);

  return chargeDate <= todayPhoenix
    ? { action: "charge_now" }
    : { action: "hold", chargeDate, cardLast4: paymentMethod.cardLast4 };
}

// What caused a charge attempt -- recorded with each one (migration
// 105's autopay_charge_attempts).
export type AutopayTrigger = "invoice_created" | "scheduled" | "enrollment" | "manual";

// Best-effort: the attempt log is for visibility and for the scheduled
// cron's "already tried" check; failing to write it must never undo or
// block a charge that already happened.
async function recordAutopayAttempt(params: {
  invoice: Invoice;
  trigger: AutopayTrigger;
  succeeded: boolean;
  error: string | null;
}): Promise<void> {
  try {
    const attemptedOn = toPhoenixDateString(new Date().toISOString());

    const { error } = await supabaseServer.from("autopay_charge_attempts").insert({
      invoice_id: params.invoice.id,
      jobber_client_id: params.invoice.jobberClientId,
      attempted_on: attemptedOn,
      triggered_by: params.trigger,
      succeeded: params.succeeded,
      error: params.error ? params.error.slice(0, 500) : null,
    });

    if (error) {
      console.error("Failed to record autopay attempt:", error.message);
    }
  } catch (error) {
    console.error("Failed to record autopay attempt:", error);
  }
}

// How long after a successful charge a manual "Charge Card on File" is
// refused for the same invoice. Covers the gap between Stripe taking
// the money and its webhook marking the invoice paid, without locking
// staff out of deliberately re-charging much later (after a refund).
const MANUAL_RECHARGE_BLOCK_MS = 3 * 24 * 60 * 60 * 1000;

// The most recent successful charge recorded for this invoice, if any.
// An invoice normally flips to "paid" seconds after a charge succeeds,
// but that flip is done by Stripe's webhook -- if it's late or failed,
// the invoice still LOOKS unpaid, and without this check the next
// trigger would charge the card a second time. A lookup error reports
// "none" (the table doesn't exist before migration 105, and that's
// exactly the world where nothing has been recorded yet).
async function getLastSuccessfulAttempt(invoiceId: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("autopay_charge_attempts")
    .select("created_at")
    .eq("invoice_id", invoiceId)
    .eq("succeeded", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return data[0].created_at as string;
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
// Charges unconditionally -- deciding WHETHER today is the day
// (migration 105's per-customer schedule) is the caller's job, via
// planAutopayForInvoice or lib/autopaySchedule.ts.
//
// Doesn't touch the invoice or payments tables directly on success --
// same as the Pay Now flow, the authoritative write happens once
// payment_intent.succeeded arrives via the webhook (lib/stripeWebhookProcessor.ts),
// keeping exactly one code path responsible for marking an invoice paid.
export async function attemptAutopayCharge(
  invoice: Invoice,
  trigger: AutopayTrigger = "invoice_created"
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

  // Never charge twice for one invoice (see getLastSuccessfulAttempt).
  // Automated triggers refuse outright; a person pressing the button is
  // refused only inside the short window where the payment is plausibly
  // still being confirmed. Deliberately not recorded as a failed
  // attempt -- nothing was attempted.
  const lastSuccess = await getLastSuccessfulAttempt(invoice.id);

  if (
    lastSuccess &&
    (trigger !== "manual" ||
      Date.now() - new Date(lastSuccess).getTime() < MANUAL_RECHARGE_BLOCK_MS)
  ) {
    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Phoenix",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(lastSuccess));

    return {
      charged: false,
      reason: `This invoice's card was already charged successfully on ${when}. It should show as paid once Stripe confirms -- check Stripe before charging again.`,
    };
  }

  // Automated triggers get a Stripe idempotency key: two of them firing
  // for the same invoice, card and day (a cron run retried, a webhook
  // delivered twice) can then only ever produce one charge -- Stripe
  // returns the first result for the second request. The card is part
  // of the key so a customer who replaces a declined card the same day
  // isn't handed back that old decline. A manual press of "Charge Card
  // on File" deliberately has no key: it's already behind a confirm
  // step, and a retry after a decline must be a real new attempt.
  const today = toPhoenixDateString(new Date().toISOString());
  const idempotencyKey =
    trigger === "manual"
      ? undefined
      : `autopay-${invoice.id}-${today}-${paymentMethod.stripePaymentMethodId}`;

  try {
    const stripe = getStripeClient();

    await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: paymentMethod.stripeCustomerId,
        payment_method: paymentMethod.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `Invoice ${invoice.invoiceNumber}`,
        // "source: autopay" lets the payment_intent.succeeded webhook
        // handler (lib/stripeWebhookProcessor.ts) tell this charge apart
        // from a manual Pay Now checkout -- it uses that to skip sending
        // the manual-payment receipt, since every caller of this function
        // sends the autopay receipt itself as soon as the charge succeeds.
        metadata: { invoice_id: invoice.id, source: "autopay" },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    await recordAutopayAttempt({ invoice, trigger, succeeded: true, error: null });

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

    await recordAutopayAttempt({ invoice, trigger, succeeded: false, error: message });

    return { charged: false, reason: message };
  }
}
