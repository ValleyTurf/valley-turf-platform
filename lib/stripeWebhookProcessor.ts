// Processes queued Stripe webhook events (rows in stripe_webhook_events).
//
// Skeleton only -- Tier 1 Stage 1. No native invoices/payments tables
// exist yet (Stage 2/3 of the roadmap), so every recognized event type
// below is a logged placeholder rather than a real handler. Deliberately
// built with the same queue/claim/retry shape as
// lib/jobberWebhookProcessor.ts's processPendingWebhookEvents(), so the
// eventual real handlers slot into processStripeWebhookEvent() below
// without restructuring the surrounding queue logic.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type StripeWebhookEventRow = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
};

const EVENT_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

// Event types this app will act on once native payments/invoicing land
// (Tier 1 Stage 2/3). Anything else Stripe sends still gets queued and
// marked processed with no action -- which events actually arrive here
// is controlled by what's enabled on the webhook endpoint in the Stripe
// Dashboard, not by this set.
const RECOGNIZED_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "payout.paid",
  "payout.failed",
]);

async function processStripeWebhookEvent(
  event: StripeWebhookEventRow
): Promise<void> {
  if (!RECOGNIZED_TYPES.has(event.type)) {
    console.log(
      `Stripe webhook "${event.type}" received -- not a type this app tracks, no action taken.`
    );

    return;
  }

  // TODO(Tier 1 Stage 2/3): wire real handling once the native
  // `invoices` and `payments` tables exist --
  //   checkout.session.completed / payment_intent.succeeded -> mark the
  //     linked invoice paid, insert a payments row
  //   payment_intent.payment_failed -> surface the failure on the invoice
  //   charge.refunded -> record the refund, adjust invoice status
  //   payout.paid / payout.failed -> native payouts table (eventually
  //     replaces jobber_payouts for anything invoiced natively)
  console.log(
    `Stripe webhook "${event.type}" recognized but not yet handled (Tier 1 Stage 2/3 isn't built) -- event id ${event.id}.`
  );
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
