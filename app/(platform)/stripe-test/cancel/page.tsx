import Link from "next/link";

export default function StripeTestCancelPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center shadow">
        <h1 className="text-2xl font-bold">Payment canceled</h1>

        <p className="mt-2 text-sm text-[#6b705c]">
          No charge went through -- you backed out of Stripe&apos;s payment
          page before completing it.
        </p>

        <Link
          href="/stripe-test"
          className="mt-4 inline-block rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
