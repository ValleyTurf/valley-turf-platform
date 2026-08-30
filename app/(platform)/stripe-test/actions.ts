"use server";

// Server action backing the Tier 1, Stage 2 test harness at
// /stripe-test. Creates a real Stripe Checkout session in whatever mode
// STRIPE_SECRET_KEY is (test or live) and redirects the browser
// straight to Stripe's hosted payment page.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { getBaseUrl } from "@/lib/baseUrl";
import { createCheckoutSession } from "@/lib/stripeCheckout";

export async function createTestCheckoutSession(
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    redirect("/login");
  }

  const description = String(formData.get("description") ?? "").trim();
  const amountDollars = Number(formData.get("amount"));

  if (!description || !Number.isFinite(amountDollars) || amountDollars <= 0) {
    redirect("/stripe-test?error=invalid");
  }

  // PaymentForm.tsx computes this client-side (percentage of the amount
  // field, or a custom entry) and passes it as a hidden input -- already
  // in cents, no dollars-to-cents conversion needed here like the main
  // amount. Defaults to 0 if missing/garbage rather than rejecting the
  // whole submission over a tip field.
  const tipCentsRaw = Number(formData.get("tipCents"));
  const tipCents =
    Number.isFinite(tipCentsRaw) && tipCentsRaw > 0
      ? Math.round(tipCentsRaw)
      : 0;

  const amountCents = Math.round(amountDollars * 100);
  const baseUrl = await getBaseUrl();

  const result = await createCheckoutSession({
    description,
    amountCents,
    tipCents,
    successUrl: `${baseUrl}/stripe-test/success`,
    cancelUrl: `${baseUrl}/stripe-test/cancel`,
  });

  if (!result.ok) {
    redirect(`/stripe-test?error=${encodeURIComponent(result.error)}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "stripe_checkout_test",
    entityLabel: description,
    after: { amount_cents: amountCents, tip_cents: tipCents },
  });

  redirect(result.url);
}
