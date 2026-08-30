// Creates a Stripe Checkout Session (Tier 1, Stage 2) -- the "Pay Now"
// flow. Hosted by Stripe (redirect, not embedded Elements) so card data
// never touches this app's server and the integration stays at the
// lightest PCI tier (SAQ A, rather than SAQ A-EP -- which got notably
// more rigorous under PCI DSS 4.0.1 -- required for an embedded Elements
// form).
//
// No native `invoices` table exists yet (Tier 1 Stage 3), so this takes
// a description/amount directly rather than an invoice id. This proves
// the payment flow works end to end first; the real invoice-linked
// version plugs in once that table exists.
import "server-only";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";

export type CreateCheckoutSessionParams = {
  description: string;
  amountCents: number;
  // Optional -- rendered as its own line item (not folded into
  // amountCents) so the customer sees "Service: $X, Tip: $Y, Total: $Z"
  // on Stripe's own page. Stripe Checkout has no native tip prompt for
  // online payments (that's Terminal-only, the in-person card-reader
  // product), so this is the standard workaround: compute the tip
  // before creating the session and list it as a second line item.
  tipCents?: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  // Stamped onto the session so the webhook processor (Stage 5) can look
  // up which invoice a checkout.session.completed/payment_intent event
  // belongs to, independent of the stripe_checkout_session_id column
  // already stored on the invoice row -- cheap defense-in-depth, not a
  // replacement for that column.
  metadata?: Record<string, string>;
};

export type CreateCheckoutSessionResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; error: string };

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
  const {
    description,
    amountCents,
    tipCents,
    successUrl,
    cancelUrl,
    customerEmail,
    metadata,
  } = params;

  const trimmedDescription = description.trim();

  if (!trimmedDescription) {
    return { ok: false, error: "Enter a description." };
  }

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter a valid amount." };
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "usd",
        product_data: { name: trimmedDescription },
        unit_amount: Math.round(amountCents),
      },
      quantity: 1,
    },
  ];

  if (typeof tipCents === "number" && Number.isFinite(tipCents) && tipCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Tip" },
        unit_amount: Math.round(tipCents),
      },
      quantity: 1,
    });
  }

  try {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Both offered up front -- Checkout shows a card/bank toggle and
      // handles the ACH mandate-collection UI itself, no extra work
      // needed here. ACH (us_bank_account) is worth defaulting larger
      // invoices toward: 0.8% capped at $5 vs. card's 2.9% + 30 cents,
      // per the Tier 1 scope doc.
      payment_method_types: ["card", "us_bank_account"],
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return { ok: true, url: session.url, sessionId: session.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Stripe error.";

    console.error("Failed to create Stripe Checkout session:", message);

    return { ok: false, error: message };
  }
}
