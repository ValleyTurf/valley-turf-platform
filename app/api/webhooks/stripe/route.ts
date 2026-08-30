// Stripe webhook receiver (Tier 1, Stage 1 skeleton). Same shape as
// app/api/jobber/webhook/route.ts: verify the signature, queue the
// event, kick off processing right away instead of waiting on a cron.
//
// No native invoices/payments tables exist yet -- see
// lib/stripeWebhookProcessor.ts for what "processing" currently does
// (log-only placeholders per event type, Tier 1 Stage 2/3 fills in the
// real handling).
import { NextRequest, NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { processPendingStripeWebhookEvents } from "@/lib/stripeWebhookProcessor";

export const dynamic = "force-dynamic";

// Postgres unique_violation -- see stripe_webhook_events.stripe_event_id's
// unique constraint in supabase/migrations/041_add_stripe_webhook_events.sql.
const UNIQUE_VIOLATION = "23505";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!signatureHeader) {
    console.error("Rejected Stripe webhook: missing stripe-signature header.");

    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();

    event = stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      webhookSecret
    );
  } catch (error) {
    console.error(
      "Rejected Stripe webhook: signature verification failed.",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Stripe delivers webhooks at-least-once, so the same event id can
  // arrive more than once (retries, a manual resend from the
  // Dashboard). The unique constraint on stripe_event_id is the real
  // dedup guard -- a unique-violation here means "already queued," not
  // a real failure, so it still acks 200 rather than erroring.
  const { error: insertError } = await supabaseServer
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: event.id,
      type: event.type,
      status: "pending",
      attempts: 0,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertError && insertError.code !== UNIQUE_VIOLATION) {
    console.error("Failed to record Stripe webhook event:", insertError.message);

    return NextResponse.json(
      { error: "Failed to record webhook event." },
      { status: 500 }
    );
  }

  // Process the queue right away instead of waiting for a future cron
  // backstop -- scheduled after the response so Stripe gets a fast ack
  // rather than waiting on our processing. Same reasoning as
  // app/api/jobber/webhook/route.ts's use of after().
  after(() => processPendingStripeWebhookEvents());

  return NextResponse.json({ received: true });
}
