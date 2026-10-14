export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";

// One-time backfill (Ryan, 2026-10-14): "Succeeded with fee 20, recent
// 0" -- confirmed the gap right after the processing-fee auto-logging
// shipped (migration 097). handlePaymentIntentSucceeded only logs a fee
// going forward from a real webhook event, so the 20 native Stripe
// payments that already succeeded before that code went live never got
// an expense row. Jobber's side didn't need this -- its sync
// re-walks every payment record on every run, so it already caught its
// own history the first time it ran today.
//
// Same plain-form, no-client-JS, raw-JSON-response pattern as
// app/(platform)/expenses/import/page.tsx -- Preview first, then Apply
// once the count looks right. Safe to click Apply more than once; see
// app/api/expenses/backfill-processing-fees/route.ts.
export default async function BackfillProcessingFeesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/expenses");
  }

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/expenses"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Back to Expenses
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-[#174734]">
          Backfill Stripe Processing Fees
        </h1>

        <p className="mt-2 text-sm text-[#6b705c]">
          One-time catch-up for native Stripe payments that succeeded{" "}
          <em>before</em> processing fees started auto-logging to{" "}
          <Link href="/expenses" className="underline">
            Expenses
          </Link>{" "}
          (10/13/2026). Every payment since then already gets its fee
          logged automatically -- this just fills in the history. Jobber
          fees don&apos;t need this; that sync already backfilled itself.
        </p>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Step 1 — Preview</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Nothing is saved yet -- shows how many succeeded payments
            have a fee waiting to be logged, as raw JSON.
          </p>

          <form
            action="/api/expenses/backfill-processing-fees"
            method="post"
            className="mt-4"
          >
            <button
              type="submit"
              className="rounded-xl bg-[#6b705c] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#565a4a]"
            >
              Preview (dry run)
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-[#d4af37]/40 bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Step 2 — Apply</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Once the preview count looks right, click this to actually
            write the rows. Safe to click more than once -- a fee
            already logged won&apos;t be duplicated.
          </p>

          <form
            action="/api/expenses/backfill-processing-fees?apply=true"
            method="post"
            className="mt-4"
          >
            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Apply
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
