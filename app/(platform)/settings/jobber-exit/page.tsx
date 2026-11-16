export const dynamic = "force-dynamic";
export const revalidate = 0;

// "Leaving Jobber" -- what still runs through Jobber, who is still
// invoiced there, and whether it is safe to cancel (ROADMAP Top 10, second
// list, #7). Everything is live; nothing here changes data. Customers move
// off Jobber invoicing from /invoices/routing.
import Link from "next/link";
import { loadJobberExit } from "@/lib/jobberExit";
import { formatCurrencyPrecise } from "@/lib/format";

function formatWhen(value: string | null): string {
  if (!value) return "never";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// What each Jobber sync still does, in plain words. Customer, job and visit
// syncs were turned into no-ops at the cutover, so only the money ones
// matter for leaving.
const SYNC_NOTES: Record<string, string> = {
  invoices: "Pulls invoices created in Jobber",
  payments: "Pulls payments taken in Jobber",
  payouts: "Pulls Jobber Payments bank payouts",
  "payment-fees": "Pulls Jobber's card processing fees",
};

export default async function JobberExitPage() {
  const report = await loadJobberExit();
  // Customer, job and visit syncs are switched off, so only the money
  // ones are worth listing.
  const moneySyncs = report.syncs.filter((sync) => sync.sync_type in SYNC_NOTES);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/settings" className="text-sm font-semibold text-[#9c7a20] hover:underline">
          ← Settings
        </Link>

        <h1 className="mt-2 text-3xl font-bold">Leaving Jobber</h1>
        <p className="mt-2 max-w-2xl text-[#6b705c]">
          What still depends on Jobber, live. Customers, jobs and visits
          already live only in this app, so what is left is invoicing and
          payments.
        </p>

        <section
          className={`mt-6 rounded-3xl p-5 shadow sm:p-8 ${
            report.readyToCancel ? "bg-[#e7f3e9]" : "bg-white"
          }`}
        >
          <h2 className="text-lg font-bold">
            {report.readyToCancel
              ? "Nothing is tied to Jobber. It is safe to cancel."
              : "Not ready to cancel yet"}
          </h2>

          {report.blockers.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#6b705c]">
              {report.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Invoiced here
              </p>
              <p className="mt-1 text-2xl font-bold">{report.totalNativeCustomers}</p>
              <p className="text-xs text-[#6b705c]">customers</p>
            </div>
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Unpaid in Jobber
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatCurrencyPrecise(report.openInvoiceTotal)}
              </p>
              <p className="text-xs text-[#6b705c]">
                {report.openInvoiceCount} invoice{report.openInvoiceCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f6f1] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Paid through Jobber
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatCurrencyPrecise(report.jobberPaymentsRecent.total)}
              </p>
              <p className="text-xs text-[#6b705c]">
                {report.jobberPaymentsRecent.count} payment
                {report.jobberPaymentsRecent.count === 1 ? "" : "s"}, last 30 days
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Still invoiced through Jobber</h2>
            <Link
              href="/invoices/routing"
              className="text-sm font-semibold text-[#9c7a20] hover:underline"
            >
              Move customers over →
            </Link>
          </div>
          <p className="mt-1 text-sm text-[#6b705c]">
            Owes money in Jobber, or was billed there in the last 120 days.
            &quot;Card in Jobber&quot; means Jobber had their card but this app
            does not, so they need to save a card again (Autopay link on their
            page) before moving them.
          </p>

          {report.stillOnJobber.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
              Nobody. Every customer who has been billed recently is invoiced here.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {report.stillOnJobber.map((customer) => (
                <Link
                  key={customer.clientId}
                  href={`/customers/${encodeURIComponent(customer.clientId)}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e7e2d5] px-4 py-3 transition hover:border-[#d4af37]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{customer.name}</p>
                    <p className="text-xs text-[#6b705c]">
                      Last billed {customer.lastInvoiceDate ?? "never"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {customer.openCount > 0 && (
                      <span className="rounded-full bg-[#faf4e3] px-3 py-1 text-xs font-bold text-[#9c7a20]">
                        Owes {formatCurrencyPrecise(customer.openTotal)}
                      </span>
                    )}
                    {customer.needsCardMoved && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                        Card in Jobber
                      </span>
                    )}
                    {customer.hasNativeCard && (
                      <span className="rounded-full bg-[#e7f3e9] px-3 py-1 text-xs font-bold text-green-700">
                        Card saved here
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">Jobber syncs still running</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            These read from Jobber every day. Once the sections above are
            clear they have nothing left to bring in.
          </p>

          <div className="mt-4 space-y-2">
            {moneySyncs.length === 0 ? (
              <p className="rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
                No sync history found.
              </p>
            ) : (
              moneySyncs.map((sync) => (
                <div
                  key={sync.sync_type}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e7e2d5] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-bold">{sync.sync_type}</p>
                    {SYNC_NOTES[sync.sync_type] && (
                      <p className="text-xs text-[#6b705c]">{SYNC_NOTES[sync.sync_type]}</p>
                    )}
                    {sync.last_error && (
                      <p className="text-xs text-red-600">{sync.last_error.slice(0, 160)}</p>
                    )}
                  </div>
                  <p className="text-xs text-[#6b705c]">
                    Last success {formatWhen(sync.last_success_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">When it says safe to cancel</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#174734]">
            <li>
              Download a final backup from Settings (Data Backup) so Jobber&apos;s
              history, notes and photos are saved outside Jobber.
            </li>
            <li>
              Confirm in Jobber that no Jobber Payments payouts are still
              pending to your bank.
            </li>
            <li>
              Cancel the Jobber subscription, then ask me to switch off the
              Jobber syncs and connection.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
