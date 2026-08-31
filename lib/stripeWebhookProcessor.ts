// Processes queued Stripe webhook events (rows in stripe_webhook_events).
//
// Tier 1 Stage 5: checkout.session.completed / payment_intent.succeeded /
// payment_intent.payment_failed / charge.refunded have real handlers
// against the native invoices/payments tables (migrations 043/044).
// Tier 1 Stage 6: payout.paid/payout.failed now write to the native
// stripe_payouts table (migration 045), and payment_intent.succeeded
// also fetches the actual processing fee from the charge's
// balance_transaction. Built on the same queue/claim/retry shape as
// lib/jobberWebhookProcessor.ts's processPendingWebhookEvents().
import "server-only";
import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { getStripeClient } from "@/lib/stripe";
import {
  upsertPaymentByIntentId,
  upsertStripePayout,
  markInvoicePaid,
  findInvoiceIdByCheckoutSessionId,
  findInvoiceIdByPaymentIntentId,
} from "@/lib/payments";
import { attachPaymentMethodFromSetupIntent } from "@/lib/autopay";

type StripeWebhookEventRow = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
};

// The payload column stores the full Stripe Event object as JSON
// (see app/api/webhooks/stripe/route.ts) -- this is just enough of its
// shape to reach `data.object` before casting to the specific Stripe
// type each handler expects.
type StripeEventEnvelope = {
  data: { object: Record<string, unknown> };
};

const EVENT_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

// Event types this app acts on. Anything else Stripe sends still gets
// queued and marked processed with no action -- which events actually
// arrive here is controlled by what's enabled on the webhook endpoint in
// the Stripe Dashboard, not by this set.
const RECOGNIZED_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "payout.paid",
  "payout.failed",
  // Autopay (native, pre-Stage-7): fires once a customer finishes the
  // `setup` mode Checkout Session from lib/autopay.ts's
  // createAutopaySetupSession(). This needs to be added as a listened-for
  // event type on the webhook endpoint in the Stripe Dashboard, same as
  // every other type in this set.
  "setup_intent.succeeded",
]);

// Typed as a plain Record rather than Stripe.Metadata -- structurally
// identical (Metadata is just a string-keyed index type), and this
// avoids depending on an exact type name from the stripe package that
// can't be verified against node_modules in this sandbox (no network
// access to install it).
function extractInvoiceId(
  metadata: Record<string, string> | null | undefined
): string | null {
  const value = metadata?.invoice_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Fires when the customer finishes Checkout. For card payments this
// means money is (almost always) already captured; for ACH
// (us_bank_account) the session "completes" immediately but the debit
// itself takes days to clear, so payment_status is "unpaid" here and the
// real confirmation comes later via payment_intent.succeeded. This
// handler records what it can either way -- it's the only one of the
// four that reliably carries the Checkout Session id for the
// stripe_checkout_session_id column.
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (!paymentIntentId) {
    console.log(
      `checkout.session.completed ${session.id} has no payment_intent -- nothing to record.`
    );
    return;
  }

  const invoiceId =
    extractInvoiceId(session.metadata) ??
    (await findInvoiceIdByCheckoutSessionId(session.id));

  const amount = (session.amount_total ?? 0) / 100;
  const paid = session.payment_status === "paid";
  const paidAt = new Date().toISOString();

  const result = await upsertPaymentByIntentId({
    invoiceId,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: session.id,
    amount,
    status: paid ? "succeeded" : "processing",
    paidAt: paid ? paidAt : null,
  });

  if (!result.ok) {
    throw new Error(`Failed to record payment from Checkout session: ${result.error}`);
  }

  if (paid && invoiceId) {
    await markInvoicePaid(invoiceId, paidAt);
  }
}

// The authoritative "money actually captured" event -- fires for card
// immediately and for ACH once the debit clears (days later). This is
// what actually flips an invoice to paid; checkout.session.completed
// above is best-effort/early visibility, not the source of truth.
async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const invoiceId =
    extractInvoiceId(paymentIntent.metadata) ??
    (await findInvoiceIdByPaymentIntentId(paymentIntent.id));

  const amount = (paymentIntent.amount_received || paymentIntent.amount || 0) / 100;
  const method = paymentIntent.payment_method_types?.[0] ?? null;
  const chargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent.latest_charge?.id ?? null);
  const paidAt = new Date().toISOString();

  // Tier 1 Stage 6: the real processing fee lives on the Charge's
  // balance_transaction, not anywhere on the PaymentIntent -- needs its
  // own fetch with an explicit expand. Best-effort: if this fails, the
  // payment still gets recorded and the invoice still gets marked paid
  // below, just without a fee figure (the Revenue dashboard undercounts
  // native processing fees for that one payment until it's fixed up
  // manually -- not worth failing/retrying the whole webhook over).
  let feeAmount: number | undefined;
  let netAmount: number | undefined;

  if (chargeId) {
    try {
      const stripe = getStripeClient();
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ["balance_transaction"],
      });
      const balanceTransaction =
        typeof charge.balance_transaction === "string"
          ? null
          : charge.balance_transaction;

      if (balanceTransaction) {
        feeAmount = balanceTransaction.fee / 100;
        netAmount = balanceTransaction.net / 100;
      }
    } catch (error) {
      console.error(
        `Failed to fetch balance_transaction for charge ${chargeId}:`,
        error
      );
    }
  }

  const result = await upsertPaymentByIntentId({
    invoiceId,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: chargeId,
    amount,
    method,
    status: "succeeded",
    paidAt,
    feeAmount,
    netAmount,
  });

  if (!result.ok) {
    throw new Error(`Failed to record succeeded payment: ${result.error}`);
  }

  if (invoiceId) {
    await markInvoicePaid(invoiceId, paidAt);
  } else {
    console.error(
      `payment_intent.succeeded ${paymentIntent.id} has no resolvable invoice -- payment recorded but no invoice was marked paid.`
    );
  }
}

// Card declines, insufficient funds, ACH returns/NSF -- recorded so the
// invoice's payment history shows the attempt, but the invoice itself
// stays whatever it was (still "sent") so the customer can retry the
// Pay Now link.
async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const invoiceId =
    extractInvoiceId(paymentIntent.metadata) ??
    (await findInvoiceIdByPaymentIntentId(paymentIntent.id));

  const amount = (paymentIntent.amount ?? 0) / 100;

  const result = await upsertPaymentByIntentId({
    invoiceId,
    stripePaymentIntentId: paymentIntent.id,
    amount,
    status: "failed",
    paidAt: null,
  });

  if (!result.ok) {
    throw new Error(`Failed to record failed payment: ${result.error}`);
  }
}

// Marks the matching payments row refunded. Doesn't touch the invoice's
// status (no "refunded" state in the invoices.status check constraint --
// the invoice stays "paid," the refund lives on the payment record) --
// revisit if/when refund handling needs to be more than a status flag.
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  if (!paymentIntentId) {
    console.log(`charge.refunded ${charge.id} has no payment_intent -- nothing to update.`);
    return;
  }

  const { error } = await supabaseServer
    .from("payments")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntentId);

  if (error) {
    throw new Error(`Failed to mark payment refunded: ${error.message}`);
  }
}

// The batched bank deposit -- fires once per payout, whether it lands
// successfully or fails. Upserted by stripe_payout_id since a payout can
// legitimately generate more than one event over its lifetime (e.g.
// pending -> paid, or pending -> failed).
async function handlePayoutEvent(payout: Stripe.Payout): Promise<void> {
  const amount = (payout.amount ?? 0) / 100;

  // Unix seconds -> plain date. Stripe's arrival_date represents a
  // calendar date (when funds land), not a precise instant.
  const arrivalDate = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
    : null;

  const result = await upsertStripePayout({
    stripePayoutId: payout.id,
    status: payout.status,
    amount,
    currency: payout.currency ?? null,
    arrivalDate,
    automatic: payout.automatic ?? true,
  });

  if (!result.ok) {
    throw new Error(`Failed to record payout: ${result.error}`);
  }
}

// Autopay card save completing. A `setup` mode Checkout Session has no
// payment_intent at all (checkout.session.completed's existing handler
// already no-ops for it, since it bails out when payment_intent is
// missing) -- this event is the actual authoritative signal, mirroring
// how payment_intent.succeeded (not checkout.session.completed) is what
// really marks an invoice paid above.
async function handleSetupIntentSucceeded(
  setupIntent: Stripe.SetupIntent
): Promise<void> {
  await attachPaymentMethodFromSetupIntent(setupIntent);
}

async function processStripeWebhookEvent(
  event: StripeWebhookEventRow
): Promise<void> {
  if (!RECOGNIZED_TYPES.has(event.type)) {
    console.log(
      `Stripe webhook "${event.type}" received -- not a type this app tracks, no action taken.`
    );

    return;
  }

  const envelope = event.payload as unknown as StripeEventEnvelope;
  const object = envelope?.data?.object;

  if (!object) {
    throw new Error(`Stripe webhook ${event.id} (${event.type}) has no data.object payload.`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(object as unknown as Stripe.Checkout.Session);
      return;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(object as unknown as Stripe.PaymentIntent);
      return;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(object as unknown as Stripe.PaymentIntent);
      return;
    case "charge.refunded":
      await handleChargeRefunded(object as unknown as Stripe.Charge);
      return;
    case "payout.paid":
    case "payout.failed":
      await handlePayoutEvent(object as unknown as Stripe.Payout);
      return;
    case "setup_intent.succeeded":
      await handleSetupIntentSucceeded(object as unknown as Stripe.SetupIntent);
      return;
    default:
      return;
  }
}

export type ProcessPendingStripeWebhookEventsResult = {
  eventsFound: number;
  processed: number;
  failed: number;
};

// Safe to call concurrently (the on-demand call right after each
// webhook POST, plus any future cron backstop) -- each event is claimed
// by flipping it to "processing" individually, and reprocessing an
// already-processed event is harmless while every handler here is a
// no-op or an idempotent upsert.
export async function processPendingStripeWebhookEvents(): Promise<ProcessPendingStripeWebhookEventsResult> {
  const { data: pendingEvents, error: pendingEventsError } =
    await supabaseServer
      .from("stripe_webhook_events")
      .select("id, type, status, attempts, payload")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(EVENT_BATCH_SIZE);

  if (pendingEventsError) {
    throw new Error(
      `Unable to load pending Stripe webhook events: ${pendingEventsError.message}`
    );
  }

  const events = (pendingEvents as StripeWebhookEventRow[] | null) ?? [];

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    const nextAttempt = Number(event.attempts ?? 0) + 1;

    const { error: processingUpdateError } = await supabaseServer
      .from("stripe_webhook_events")
      .update({
        status: "processing",
        attempts: nextAttempt,
        error_message: null,
      })
      .eq("id", event.id);

    if (processingUpdateError) {
      console.error(
        `Unable to mark Stripe webhook ${event.id} as processing:`,
        processingUpdateError
      );

      failed += 1;

      continue;
    }

    try {
      await processStripeWebhookEvent(event);

      const { error: processedUpdateError } = await supabaseServer
        .from("stripe_webhook_events")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", event.id);

      if (processedUpdateError) {
        throw new Error(
          `Unable to mark Stripe webhook as processed: ${processedUpdateError.message}`
        );
      }

      processed += 1;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unknown Stripe webhook processing error occurred.";

      const finalStatus = nextAttempt >= MAX_ATTEMPTS ? "failed" : "pending";

      const { error: failureUpdateError } = await supabaseServer
        .from("stripe_webhook_events")
        .update({
          status: finalStatus,
          error_message: errorMessage,
        })
        .eq("id", event.id);

      if (failureUpdateError) {
        console.error(
          `Unable to record failure for Stripe webhook ${event.id}:`,
          failureUpdateError
        );
      }

      console.error(`Stripe webhook ${event.id} failed:`, error);

      failed += 1;
    }
  }

  return {
    eventsFound: events.length,
    processed,
    failed,
  };
}
