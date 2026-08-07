export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { formatCurrencyPrecise, formatDateOnly, formatNumber } from "@/lib/format";
import {
  getTransactionDateRange,
  isTransactionTimeframe,
  type TransactionSortField,
  type TransactionTimeframe,
} from "@/lib/transactionFormatting";
import { getTransactions } from "@/lib/transactions";

type TransactionsPageProps = {
  searchParams: Promise<{
    timeframe?: string;
    start?: string;
    end?: string;
    type?: string;
    method?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
};

const TIMEFRAME_OPTIONS: Array<{ value: TransactionTimeframe; label: string }> = [
  { value: "last-7-days", label: "Last 7 Days" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-month", label: "Last Month" },
  { value: "this-month", label: "This Month" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
];

function isSortField(value: string | undefined): value is TransactionSortField {
  return ["date", "client", "amount", "tip", "fee"].includes(value ?? "");
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const params = await searchParams;

  const timeframe: TransactionTimeframe = isTransactionTimeframe(params.timeframe)
    ? params.timeframe
    : "last-30-days";

  const { startDate, endDate } = getTransactionDateRange(
    timeframe,
    getPhoenixToday(),
    params.start,
    params.end
  );

  const type = params.type || "all";
  const method = params.method || "all";
  const search = params.q || "";
  const sortField: TransactionSortField = isSortField(params.sort) ? params.sort : "date";
  const sortDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  const { rows, typeOptions, methodOptions } = await getTransactions({
    startDate,
    endDate,
    type,
    method,
    search,
    sortField,
    sortDir,
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.amount += row.amount;
      acc.tip += row.tip;
      acc.fee += row.fee;
      return acc;
    },
    { amount: 0, tip: 0, fee: 0 }
  );

  const exportParams = new URLSearchParams({
    start: startDate,
    end: endDate,
    type,
    method,
    q: search,
    sort: sortField,
    dir: sortDir,
  });

  function sortHref(field: TransactionSortField): string {
    const nextDir: "asc" | "desc" =
      field === sortField && sortDir === "desc" ? "asc" : "desc";

    const p = new URLSearchParams({
      timeframe,
      type,
      method,
    });
    if (search) p.set("q", search);
    if (timeframe === "custom") {
      p.set("start", startDate);
      p.set("end", endDate);
    }
    p.set("sort", field);
    p.set("dir", nextDir);

    return `/transactions?${p.toString()}`;
  }

  function sortIndicator(field: TransactionSortField): string {
    if (field !== sortField) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Transactions</h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Every payment, deposit, and refund processed through Jobber
              Payments, in one sortable, searchable list.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/transactions/export?${exportParams.toString()}`}
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              Export CSV
            </a>
            <Link
              href="/revenue"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Back to Revenue
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="sort" value={sortField} />
            <input type="hidden" name="dir" value={sortDir} />

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Entries Within
              </label>
              <select
                name="timeframe"
                defaultValue={timeframe}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                {TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {timeframe === "custom" && (
              <>
                <div>
                  <label className="text-xs font-bold text-[#9c7a20]">Start</label>
                  <input
                    type="date"
                    name="start"
                    defaultValue={startDate}
                    className="mt-1 block rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#9c7a20]">End</label>
                  <input
                    type="date"
                    name="end"
                    defaultValue={endDate}
                    className="mt-1 block rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">Type</label>
              <select
                name="type"
                defaultValue={type}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                <option value="all">All</option>
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">Paid With</label>
              <select
                name="method"
                defaultValue={method}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                <option value="all">All</option>
                {methodOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-bold text-[#9c7a20]">
                Search Client
              </label>
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Client name…"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Filter
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Transactions
            </p>
            <p className="mt-2 text-2xl font-bold">{formatNumber(rows.length)}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Total Collected
            </p>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrencyPrecise(totals.amount)}
            </p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Tips
            </p>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {formatCurrencyPrecise(totals.tip)}
            </p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Processing Fees
            </p>
            <p className="mt-2 text-2xl font-bold text-red-700">
              {formatCurrencyPrecise(totals.fee)}
            </p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Net
            </p>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrencyPrecise(totals.amount - totals.fee)}
            </p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-[#6b705c]">
              No transactions match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-[#eee9dc] bg-[#f7f6f1] text-xs font-bold uppercase tracking-[0.08em] text-[#6b705c]">
                  <tr>
                    <th className="px-5 py-3">
                      <Link href={sortHref("client")} className="hover:text-[#174734]">
                        Client{sortIndicator("client")}
                      </Link>
                    </th>
                    <th className="px-5 py-3">
                      <Link href={sortHref("date")} className="hover:text-[#174734]">
                        Date{sortIndicator("date")}
                      </Link>
                    </th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Paid With</th>
                    <th className="px-5 py-3">Invoice #</th>
                    <th className="px-5 py-3 text-right">
                      <Link href={sortHref("amount")} className="hover:text-[#174734]">
                        Total{sortIndicator("amount")}
                      </Link>
                    </th>
                    <th className="px-5 py-3 text-right">
                      <Link href={sortHref("tip")} className="hover:text-[#174734]">
                        Tip{sortIndicator("tip")}
                      </Link>
                    </th>
                    <th className="px-5 py-3 text-right">
                      <Link href={sortHref("fee")} className="hover:text-[#174734]">
                        Fee{sortIndicator("fee")}
                      </Link>
                    </th>
                    <th className="px-5 py-3 text-center">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`border-b border-[#f0eee6] last:border-0 ${
                        index % 2 === 1 ? "bg-[#fbfaf6]" : ""
                      }`}
                    >
                      <td className="px-5 py-3 font-semibold">
                        {row.clientId ? (
                          <Link
                            href={`/customers/${encodeURIComponent(row.clientId)}`}
                            className="text-[#174734] hover:underline"
                          >
                            {row.clientName}
                          </Link>
                        ) : (
                          row.clientName
                        )}
                      </td>
                      <td className="px-5 py-3 text-[#6b705c]">
                        {formatDateOnly(row.date)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            row.type === "Payment"
                              ? "bg-green-50 text-green-800"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#6b705c]">{row.method}</td>
                      <td className="px-5 py-3 text-[#6b705c]">
                        {row.invoiceNumber || "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-bold">
                        {formatCurrencyPrecise(row.amount)}
                      </td>
                      <td className="px-5 py-3 text-right text-green-700">
                        {row.tip > 0 ? formatCurrencyPrecise(row.tip) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-red-700">
                        {row.fee > 0 ? formatCurrencyPrecise(row.fee) : "—"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {row.jobberWebUri ? (
                          <a
                            href={row.jobberWebUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Jobber"
                            className="text-[#9c7a20] hover:underline"
                          >
                            ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
