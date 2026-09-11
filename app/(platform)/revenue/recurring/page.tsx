export const dynamic = "force-dynamic";
export const revalidate = 0;

// Recurring-revenue (MRR) dashboard -- ROADMAP.md Fresh Ideas #4. All the
// actual math lives in lib/recurringRevenue.ts; this page is display only.
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { getRecurringRevenueSummary } from "@/lib/recurringRevenue";

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

export default async function RecurringRevenuePage() {
  const summary = await getRecurringRevenueSummary(12);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Recurring Revenue
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6b705c]">
              Every active recurring job&apos;s price, normalized to a
              monthly-equivalent value so weekly, biweekly, and less-often
              cadences are directly comparable.
            </p>
          </div>

          <Link
            href="/revenue"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Financial Dashboard
          </Link>
        </header>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
            Current MRR
          </p>
          <p className="mt-2 text-4xl font-bold">
            {formatCurrency(summary.currentMrr)}
          </p>
          <p className="mt-1 text-sm text-[#6b705c]">
            Across {summary.activeRecurringJobs} active recurring job
            {summary.activeRecurringJobs === 1 ? "" : "s"}.
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">New &amp; Lost MRR by Month</h2>
          <p className="mt-1 text-xs text-[#6b705c]">
            New is derived from when each recurring job actually started
            (accurate for all history). Lost churn tracking started{" "}
            {formatMonthLabel("2026-09")} — earlier months show Lost as not
            tracked rather than a false zero.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-[#eee9dc] text-left text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                  <th className="py-2">Month</th>
                  <th className="py-2 text-right">New</th>
                  <th className="py-2 text-right">Lost</th>
                  <th className="py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee9dc]">
                {summary.months.map((row) => (
                  <tr key={row.month}>
                    <td className="py-2 font-semibold">
                      {formatMonthLabel(row.month)}
                    </td>
                    <td className="py-2 text-right text-[#226246]">
                      {row.newMrr > 0 ? `+${formatCurrency(row.newMrr)}` : formatCurrency(0)}
                    </td>
                    <td className="py-2 text-right">
                      {row.lostTracked ? (
                        row.lostMrr > 0 ? (
                          <span className="text-red-700">
                            -{formatCurrency(row.lostMrr)}
                          </span>
                        ) : (
                          formatCurrency(0)
                        )
                      ) : (
                        <span className="text-[#b3ab98]">Not tracked</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {row.lostTracked
                        ? formatCurrency(row.netMrr)
                        : `+${formatCurrency(row.newMrr)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
