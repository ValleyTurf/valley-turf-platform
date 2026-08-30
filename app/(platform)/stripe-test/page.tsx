export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tier 1, Stage 2 test harness -- a minimal form that creates a real
// Stripe Checkout session and redirects to it. Not wired to real
// invoices yet (no native `invoices` table exists -- that's Stage 3);
// this exists purely to prove the payment flow (card + ACH, webhook
// receipt) works end to end before anything real depends on it.
import { createTestCheckoutSession } from "./actions";
import PaymentForm from "./PaymentForm";

type StripeTestPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function StripeTestPage({
  searchParams,
}: StripeTestPageProps) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Test a Stripe Payment
          </h1>

          <p className="mt-2 text-sm text-[#6b705c]">
            Creates a real Stripe Checkout session and redirects to it.
            This is a Tier 1 build-order test harness, not a real invoice
            flow yet.
          </p>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-600 shadow">
            {error === "invalid"
              ? "Enter a description and a valid amount."
              : error}
          </div>
        )}

        <PaymentForm action={createTestCheckoutSession} />

        <p className="mt-4 text-xs text-[#9c9990]">
          If STRIPE_SECRET_KEY is a test-mode key (starts with sk_test_),
          nothing here charges a real card. Use Stripe&apos;s test card
          4242 4242 4242 4242, any future expiry, any CVC -- or the
          built-in test flow for ACH.
        </p>
      </div>
    </main>
  );
}
