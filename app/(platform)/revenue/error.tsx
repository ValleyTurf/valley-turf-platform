"use client";

// Next.js App Router error boundary for this route segment. Replaces
// the try/catch that used to wrap this whole page's JSX in page.tsx —
// removed because react-hooks/error-boundaries correctly pointed out
// that a try/catch around JSX construction can't actually catch
// rendering errors (React doesn't render JSX synchronously when it's
// constructed), only a real error boundary can. Next.js automatically
// wraps page.tsx (and everything under this route segment) in this
// component, so any error thrown during that Server Component's data
// fetching — including the explicit `throw new Error(...)` on a
// Supabase query failure — lands here instead of crashing the app
// shell.
//
// Bonus over the old try/catch: reset() re-runs the segment without a
// full page reload, so a transient Supabase hiccup can be retried
// in place.
import Link from "next/link";

export default function RevenueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message || "Financial metrics could not be loaded.";

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-white p-5 shadow sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Financial dashboard could not be loaded
          </h1>

          <p className="mt-4 text-[#6b705c]">{message}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-[#174734] bg-white px-5 py-3 text-sm font-bold text-[#174734] transition hover:bg-[#f7f6f1]"
            >
              Try Again
            </button>

            <Link
              href="/api/jobber/sync-invoices"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-sm font-bold text-[#174734]"
            >
              Sync Invoices
            </Link>

            <Link
              href="/api/jobber/sync-payments"
              className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
            >
              Sync Payments
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
