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
import { getStripeClient } from "@/lib/stripe";

export type CreateCheckoutSessionParams = {
  description: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
};

export type CreateCheckoutSessionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
  const { description, amountCents, successUrl, cancelUrl, customerEmail } =
    params;

  const trimmedDescription = description.trim();

  if (!trimmedDescription) {
    return { ok: false, error: "Enter a description." };
  }

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter a valid amount." };
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
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: trimmedDescription },
            unit_amount: Math.round(amountCents),
          },
          quantity: 1,
        },
      ],
      customer_email: customerEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return { ok: true, url: session.url };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Stripe error.";

    console.error("Failed to create Stripe Checkout session:", message);

    return { ok: false, error: message };
  }
}
