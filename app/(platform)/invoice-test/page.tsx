export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tier 1, Stage 4 test harness -- creates a native invoice (Stage 3),
// a Stripe Checkout session for it (Stage 2), a PDF, and emails both
// the PDF and the Pay Now link via Resend (Stage 4). Nothing here is
// wired into the real /invoices flow yet -- that's Stage 7.
import { createTestInvoiceAndSend } from "./actions";
import InvoiceForm from "./InvoiceForm";

type InvoiceTestPageProps = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export default async function InvoiceTestPage({
  searchParams,
}: InvoiceTestPageProps) {
  const params = await searchParams;
  const error = params.error;
  const sent = params.sent;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Test a Native Invoice
          </h1>

          <p className="mt-2 text-sm text-[#6b705c]">
            Creates a real invoice row, a Stripe Checkout session, a PDF,
            and emails both to the address below via Resend. A Tier 1
            build-order test harness, not the real invoice flow yet.
          </p>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-600 shadow">
            {error === "invalid"
              ? "Fill in every field with a valid amount."
              : error === "payment_cancelled"
                ? "Checkout was cancelled -- the invoice and email were not created."
                : error}
          </div>
        )}

        {sent && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-white p-4 text-sm text-green-700 shadow">
            Invoice {sent} created and emailed.
          </div>
        )}

        <InvoiceForm action={createTestInvoiceAndSend} />

        <p className="mt-4 text-xs text-[#9c9990]">
          If STRIPE_SECRET_KEY is a test-mode key, the Pay Now link is a
          test-mode Checkout page -- use card 4242 4242 4242 4242. The
          email goes out via Resend; if RESEND_FROM_EMAIL is unset it
          sends from onboarding@resend.dev, which can only deliver to the
          address you signed up to Resend with.
        </p>
      </div>
    </main>
  );
}
