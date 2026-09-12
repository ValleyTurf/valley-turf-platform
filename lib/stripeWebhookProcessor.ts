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
import { getInvoiceById, getInvoiceLineItems } from "@/lib/invoices";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { getNotificationRecipients } from "@/lib/customerContacts";
import {
  sendManualPaymentReceiptEmail,
  sendManualPaymentReceiptSms,
  sendPaymentReceivedAlertEmail,
} from "@/lib/notifications";

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
    // checkout.session.completed's own markInvoicePaid call here is best-
    // effort/early visibility (see the handler's own comment above) --
    // payment_intent.succeeded below is what actually drives the tip-
    // aware receipt/alert sends, so the returned tipAmount is unused here.
    await markInvoicePaid({
      invoiceId,
      paidAt,
      amount,
      stripePaymentIntentId: paymentIntentId,
    });
  }
}

// Best-effort: sends the manual-payment receipt (Ryan's request -- there
// was previously no confirmation at all for a customer paying via the
// /pay/[token] Pay Now link, only for autopay). Wrapped so a failure here
// never fails the webhook processing itself -- the payment is already
// recorded and the invoice already marked paid by the time this runs;
// losing a receipt send shouldn't put either of those into a retry loop.
async function sendManualPaymentReceipt(
  invoiceId: string,
  amountReceived: number,
  tipAmount: number
): Promise<void> {
  try {
    const invoice = await getInvoiceById(invoiceId);

    if (!invoice || !invoice.jobberClientId) return;

    const lineItems = await getInvoiceLineItems(invoiceId);

    if (lineItems.length === 0) return;

    const { data: customerRow } = await supabaseServer
      .from("customers")
      .select("email, phone")
      .eq("jobber_client_id", invoice.jobberClientId)
      .maybeSingle();

    const customerEmail = (customerRow?.email as string | null) ?? null;
    const customerPhone = (customerRow?.phone as string | null) ?? null;

    const recipients = await getNotificationRecipients(
      invoice.jobberClientId,
      customerEmail,
      customerPhone
    );

    if (recipients.emails.length === 0 && recipients.phones.length === 0) return;

    const pdfBuffer =
      recipients.emails.length > 0
        ? await generateInvoicePdf(invoice, lineItems)
        : null;

    // Previously passed invoice.total here, which excludes a tip added at
    // checkout (app/pay/[token]/TipSelector.tsx) -- amountReceived is the
    // full amount payment_intent.succeeded actually reports as captured,
    // so the receipt always matches what the customer's card/bank was
    // actually charged.
    if (pdfBuffer) {
      for (const toEmail of recipients.emails) {
        await sendManualPaymentReceiptEmail({
          toEmail,
          customerName: invoice.customerName,
          invoiceNumber: invoice.invoiceNumber,
          total: amountReceived,
          tipAmount,
          pdfBuffer,
          jobberClientId: invoice.jobberClientId,
        });
      }
    }

    for (const toPhone of recipients.phones) {
      await sendManualPaymentReceiptSms(
        toPhone,
        invoice.customerName,
        invoice.invoiceNumber,
        amountReceived,
        invoice.jobberClientId,
        tipAmount
      );
    }
  } catch (error) {
    console.error(
      `Failed to send manual payment receipt for invoice ${invoiceId}:`,
      error
    );
  }
}

// Best-effort, staff-facing (Ryan's request) -- fires for every
// successful payment regardless of source (manual Pay Now checkout or
// autopay charge), unlike sendManualPaymentReceipt which is customer-
// facing and skipped for autopay (that flow already sent its own receipt
// synchronously). Wrapped the same way: a failure here should never
// affect the already-recorded payment/invoice state.
async function notifyStaffOfPayment(
  invoiceId: string,
  amount: number,
  method: string | null,
  viaAutopay: boolean,
  tipAmount: number
): Promise<void> {
  try {
    const invoice = await getInvoiceById(invoiceId);

    if (!invoice) return;

    await sendPaymentReceivedAlertEmail({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      amount,
      method,
      viaAutopay,
      tipAmount,
    });
  } catch (error) {
    console.error(
      `Failed to send payment-received staff alert for invoice ${invoiceId}:`,
      error
    );
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
    const { tipAmount } = await markInvoicePaid({
      invoiceId,
      paidAt,
      amount,
      stripePaymentIntentId: paymentIntent.id,
    });

    const viaAutopay = paymentIntent.metadata?.source === "autopay";

    // Staff-facing "money came in" alert -- fires either way, unlike the
    // customer-facing receipt below.
    await notifyStaffOfPayment(invoiceId, amount, method, viaAutopay, tipAmount);

    // Autopay's off-session charge (lib/autopay.ts's attemptAutopayCharge)
    // tags its PaymentIntent with source=autopay and already sent its own
    // receipt synchronously the moment the charge succeeded -- this is
    // only for a manual Pay Now checkout, which has no other confirmation
    // step.
    if (!viaAutopay) {
      await sendManualPaymentReceipt(invoiceId, amount, tipAmount);
    }
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

// Safe to call concurrently (the on-demand call right after each webhook
// POST, plus any future cron backstop) -- but ONLY because the claim
// step below is a conditional update (WHERE status = 'pending'), and a
// worker backs off the moment it doesn't get the row back. That guard
// matters: unlike the idempotent upserts elsewhere in this file,
// sendManualPaymentReceipt/notifyStaffOfPayment (below, via
// processStripeWebhookEvent) send a real email/SMS every time they run,
// with no dedupe of their own. Stripe's at-least-once delivery means the
// same event can arrive twice within moments of each other (not an
// error -- expected, routine behavior on Stripe's side), each POST
// kicks off its own processPendingStripeWebhookEvents() call regardless
// of whether that delivery was a fresh row or a duplicate, and an
// unconditional "flip to processing" update let both overlapping calls
// claim and process the same event -- which is exactly what sent a
// customer two payment-receipt emails/texts (each phone number on file)
// for one payment. Fixed by making the claim a compare-and-swap: only a
// call that actually flips status from pending -> processing (verified
// via .select() on the update) may proceed to run the handler.
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

    // Compare-and-swap claim: the WHERE status = 'pending' guard plus
    // .select() to see what actually got updated is what makes this
    // safe under concurrent calls. If another overlapping call already
    // claimed this event (or it's no longer pending for any other
    // reason) between our SELECT above and this UPDATE, claimedRows
    // comes back empty and we skip it -- we must NOT run the handler in
    // that case, since it's not idempotent (see comment above this
    // function).
    const { data: claimedRows, error: processingUpdateError } =
      await supabaseServer
        .from("stripe_webhook_events")
        .update({
          status: "processing",
          attempts: nextAttempt,
          error_message: null,
        })
        .eq("id", event.id)
        .eq("status", "pending")
        .select("id");

    if (processingUpdateError) {
      console.error(
        `Unable to mark Stripe webhook ${event.id} as processing:`,
        processingUpdateError
      );

      failed += 1;

      continue;
    }

    if (!claimedRows || claimedRows.length === 0) {
      // Lost the race to another concurrent call (or a prior run already
      // moved this event past "pending") -- not our event to process.
      console.log(
        `Stripe webhook ${event.id} was already claimed by another run -- skipping.`
      );

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
