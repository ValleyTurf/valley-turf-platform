export const dynamic = "force-dynamic";
export const revalidate = 0;

// Test harness -- creates a native invoice (Stage 3) and a stable
// /pay/[token] link (migration 046), then either charges it
// automatically via autopay (lib/autopay.ts, if a Jobber Client ID with
// autopay enabled is entered) or delivers it by email (PDF attached, via
// Resend, Stage 4), SMS (via Twilio), or both. Nothing here is wired
// into the real /invoices flow yet -- that's Stage 7.
import { createTestInvoiceAndSend } from "./actions";
import InvoiceForm from "./InvoiceForm";

type InvoiceTestPageProps = {
  searchParams: Promise<{ error?: string; sent?: string; charged?: string }>;
};

export default async function InvoiceTestPage({
  searchParams,
}: InvoiceTestPageProps) {
  const params = await searchParams;
  const error = params.error;
  const sent = params.sent;
  const charged = params.charged;

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
            Creates a real invoice row and a stable Pay Now link, then
            delivers it by email, text, or both -- whichever fields
            below are filled in. A build-order test harness, not the
            real invoice flow yet.
          </p>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-600 shadow">
            {error === "invalid"
              ? "Fill in every field with a valid amount."
              : error}
          </div>
        )}

        {sent && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-white p-4 text-sm text-green-700 shadow">
            Invoice {sent} created and sent.
          </div>
        )}

        {charged && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-white p-4 text-sm text-green-700 shadow">
            Invoice {charged} created and charged automatically via
            autopay.
          </div>
        )}

        <InvoiceForm action={createTestInvoiceAndSend} />

        <p className="mt-4 text-xs text-[#9c9990]">
          The Pay Now link doesn&apos;t create a Stripe Checkout session
          until the customer actually opens it and taps Pay Now -- if
          STRIPE_SECRET_KEY is a test-mode key, that session is a
          test-mode Checkout page (use card 4242 4242 4242 4242). Email
          goes out via Resend -- if RESEND_FROM_EMAIL is unset it sends
          from onboarding@resend.dev, which can only deliver to the
          address you signed up to Resend with. Text goes out via
          Twilio, if TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER
          are set.
        </p>
      </div>
    </main>
  );
}
