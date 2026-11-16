export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tax-time package (ROADMAP Top 10, second list, #8): one download for the
// accountant, plus a quick look at the year before sending it.
import Link from "next/link";
import { loadTaxPackageSummary } from "@/lib/taxPackage";
import { formatCurrencyPrecise } from "@/lib/format";

type PageProps = { searchParams: Promise<{ year?: string }> };

export default async function TaxPackagePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const thisYear = new Date().getFullYear();
  const requested = Number(params.year);
  const year =
    Number.isInteger(requested) && requested >= 2015 && requested <= thisYear
      ? requested
      : thisYear;

  const summary = await loadTaxPackageSummary(year);
  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/revenue/profit-loss"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Profit &amp; Loss
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-[#174734]">Tax package</h1>
        <p className="mt-2 max-w-2xl text-[#6b705c]">
          One download for your accountant: profit and loss by month, every
          expense, owner draws and loan payments kept separate, and every
          customer payment by how they paid.
        </p>

        <div className="mt-5 flex gap-2">
          {years.map((option) => (
            <Link
              key={option}
              href={`/revenue/tax-package?year=${option}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                option === year
                  ? "border-[#174734] bg-[#174734] text-white"
                  : "border-[#d8d3c6] text-[#174734] hover:border-[#9c7a20]"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">{year} at a glance</h2>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Invoiced
              </dt>
              <dd className="mt-1 text-xl font-bold">{formatCurrencyPrecise(summary.revenue)}</dd>
            </div>
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Collected ({summary.paymentCount} payments)
              </dt>
              <dd className="mt-1 text-xl font-bold">
                {formatCurrencyPrecise(summary.paymentsCollected)}
              </dd>
            </div>
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Expenses
              </dt>
              <dd className="mt-1 text-xl font-bold">{formatCurrencyPrecise(summary.expenses)}</dd>
            </div>
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Profit before fixed overhead
              </dt>
              <dd className="mt-1 text-xl font-bold">
                {formatCurrencyPrecise(summary.netBeforeOverhead)}
              </dd>
            </div>
          </dl>

          {summary.unreviewedBankRows > 0 && (
            <p className="mt-4 rounded-2xl bg-[#faf4e3] p-4 text-sm text-[#9c7a20]">
              <span className="font-bold">
                {summary.unreviewedBankRows} bank transaction
                {summary.unreviewedBankRows === 1 ? "" : "s"} from {year} still
                need review.
              </span>{" "}
              Their categories may change, so it is best to finish{" "}
              <Link href="/settings/bank-feed" className="underline">
                the bank feed
              </Link>{" "}
              before sending this.
            </p>
          )}

          <a
            href={`/api/revenue/tax-package?year=${year}`}
            className="mt-5 inline-block rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Download {year} tax package (ZIP)
          </a>
          <p className="mt-2 text-xs text-[#6b705c]">
            A README inside explains each file and how the numbers are worked out.
          </p>
        </section>
      </div>
    </main>
  );
}
