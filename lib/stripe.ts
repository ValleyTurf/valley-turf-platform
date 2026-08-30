// Server-only Stripe client (Tier 1 -- native payment processing).
//
// Same "quietly do nothing until configured" posture as
// lib/notifications.ts's Resend/Twilio guards: STRIPE_SECRET_KEY isn't
// set yet (no Stripe account exists for this business yet), so
// getStripeClient()/getStripeWebhookSecret() only throw when something
// actually tries to use them, not at import or build time. That keeps
// the rest of the app buildable/deployable before Stripe is connected.
import "server-only";
import Stripe from "stripe";

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) {
    return cachedClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Set it in the environment before using Stripe."
    );
  }

  // No explicit apiVersion -- lets the SDK use the version pinned to
  // this package release, matching Stripe's own Node quickstart. Worth
  // pinning explicitly once real charge-creation code lands in Stage 2,
  // so a future stripe-node upgrade can't silently change request
  // behavior on invoicing/payments code that's actually live.
  cachedClient = new Stripe(secretKey);

  return cachedClient;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured. Set it in the environment before verifying webhooks."
    );
  }

  return webhookSecret;
}
