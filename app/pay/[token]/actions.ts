"use server";

// Public actions for the unauthenticated /pay/[token] invoice page --
// same trust model as app/q/[token]/actions.ts: no auth check beyond
// knowledge of the unguessable public_token (migration 046). Deliberately
// does NOT import getCurrentUser/requireAdmin.
//
// The whole point of this page is to mint a Stripe Checkout Session only
// when the customer actually clicks Pay Now, rather than embedding a
// Checkout Session URL directly in an email/text that could sit unopened
// past its ~24h expiry. See lib/invoicePdf.ts / lib/notifications.ts /
// the invoice-test action for where the link into this page gets built.
import { redirect } from "next/navigation";
import { getBaseUrl } from "@/lib/baseUrl";
import { createCheckoutSession } from "@/lib/stripeCheckout";
import { supabaseServer } from "@/lib/supabase-server";

const PAYABLE_STATUSES = new Set(["sent", "overdue"]);

export async function payInvoice(token: string): Promise<void> {
  const { data: invoice, error: fetchError } = await supabaseServer
    .from("invoices")
    .select("id, invoice_number, status, total")
    .eq("public_token", token)
    .single();

  if (fetchError || !invoice) {
    redirect(`/pay/${token}?error=not_found`);
  }

  if (!PAYABLE_STATUSES.has(invoice.status)) {
    // Already paid, void, or still a draft -- none of those should ever
    // reach a Pay Now button (the page itself hides it), so landing here
    // means a stale page or a resubmit. Redirect back rather than
    // creating a Checkout session for something that isn't payable.
    redirect(`/pay/${token}?error=not_payable`);
  }

  const amountCents = Math.round(Number(invoice.total) * 100);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    redirect(`/pay/${token}?error=invalid_amount`);
  }

  const baseUrl = await getBaseUrl();

  const checkoutResult = await createCheckoutSession({
    description: `Invoice ${invoice.invoice_number}`,
    amountCents,
    successUrl: `${baseUrl}/pay/${token}?paid=1`,
    cancelUrl: `${baseUrl}/pay/${token}`,
    metadata: { invoice_id: invoice.id },
  });

  if (!checkoutResult.ok) {
    redirect(`/pay/${token}?error=${encodeURIComponent(checkoutResult.error)}`);
  }

  // Link the fresh session back to the invoice -- lets the webhook
  // processor's fallback lookup (findInvoiceIdByCheckoutSessionId) find
  // this invoice even if the metadata.invoice_id path somehow misses.
  // Re-run every time the customer clicks Pay Now again (e.g. after a
  // cancelled attempt), so this always reflects the most recent session.
  const { error: linkError } = await supabaseServer
    .from("invoices")
    .update({ stripe_checkout_session_id: checkoutResult.sessionId })
    .eq("id", invoice.id);

  if (linkError) {
    console.error("Failed to link Checkout session to invoice:", linkError);
  }

  redirect(checkoutResult.url);
}
