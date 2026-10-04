export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";

// One-time QuickBooks historical import (Ryan, 2026-10-04) -- "I think we
// can do an import and then use the bank feed starting 10/1 maybe?"
// Everything before 10/1/2026 comes from this QuickBooks export; the bank
// feed (phase 2, still pending a provider decision) picks up from there.
//
// Plain upload form posting straight to the API route -- no client JS.
// The route returns raw JSON, same as every other dry-run/apply debug
// route built this session, so the two-step flow here is: submit the
// Preview form, read the JSON that comes back, and only submit Import
// once that preview looks right. Re-submitting Import on the same file
// is safe -- the route skips anything it already imported.
//
// Admin-only, checked directly here (not just via the route-prefix gate)
// since this writes a potentially large batch of financial rows at once.
export default async function ImportQuickBooksExpensesPage() {
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
          Import QuickBooks History
        </h1>

        <p className="mt-2 text-sm text-[#6b705c]">
          One-time import of your QuickBooks &quot;Transaction Detail by
          Account&quot; export. Revenue isn&apos;t touched here -- that
          already comes from Jobber -- this only brings in the expense/COGS
          side. Rows QuickBooks had under an ambiguous category are marked{" "}
          <span className="font-semibold">Needs Review</span> so they&apos;re
          easy to find and fix afterward on the{" "}
          <Link href="/expenses" className="underline">
            Expenses
          </Link>{" "}
          page.
        </p>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Step 1 — Preview</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Upload the CSV. Nothing is saved yet -- this just shows what
            would be imported (counts, totals by category, anything
            skipped or flagged) as raw JSON.
          </p>

          <form
            action="/api/expenses/import-quickbooks"
            method="post"
            encType="multipart/form-data"
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="file"
              name="file"
              accept=".csv"
              required
              className="flex-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#6b705c] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#565a4a]"
            >
              Preview (dry run)
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-[#d4af37]/40 bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Step 2 — Import</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Once the preview looks right, upload the{" "}
            <span className="font-semibold">same file again</span> here to
            actually write the rows. Safe to click more than once -- rows
            already imported won&apos;t be duplicated.
          </p>

          <form
            action="/api/expenses/import-quickbooks?apply=true"
            method="post"
            encType="multipart/form-data"
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="file"
              name="file"
              accept=".csv"
              required
              className="flex-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Import
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
