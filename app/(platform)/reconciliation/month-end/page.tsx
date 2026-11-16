export const dynamic = "force-dynamic";
export const revalidate = 0;

// Month-end close (ROADMAP third top-10 list #5): one place to see what is
// still open for a month before the books are called done, and a record
// of when each month was closed. Closing saves a snapshot of the month's
// numbers; if an invoice or expense is later added or edited, the month
// shows "changed since close".
import Link from "next/link";
import { formatCurrencyPrecise } from "@/lib/format";
import {
  loadChecklist,
  loadCloseRecords,
  loadMonthSnapshot,
} from "@/lib/monthClose";
import {
  closableMonths,
  diffSnapshot,
  isMoneyLabel,
  isMonthOver,
  isValidMonth,
  monthLabel,
  openItemCount,
  type ChecklistItem,
} from "@/lib/monthCloseLogic";
import { closeMonth, reopenMonth } from "./actions";

type PageProps = { searchParams: Promise<{ month?: string }> };

function phoenixToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
    new Date()
  );
}

function formatClosedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
  });
  return `${name} ${String(year).slice(2)}`;
}

const STATUS_STYLE: Record<ChecklistItem["status"], { mark: string; cls: string }> = {
  ok: { mark: "✓", cls: "bg-[#e3f1e8] text-[#1d6b3f]" },
  todo: { mark: "!", cls: "bg-[#fdecd4] text-[#a15c07]" },
  info: { mark: "i", cls: "bg-[#e8ecf3] text-[#475569]" },
};

export default async function MonthEndPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = phoenixToday();
  const months = closableMonths(today, 12);
  const month = isValidMonth(params.month) ? params.month : months[0];

  const closes = await loadCloseRecords();

  // Which closed months have changed since they were closed.
  const changedMonths = new Set<string>();
  await Promise.all(
    months
      .filter((m) => closes.has(m))
      .map(async (m) => {
        const record = closes.get(m)!;
        const current = await loadMonthSnapshot(m);
        if (diffSnapshot(record.snapshot, current).length > 0) changedMonths.add(m);
      })
  );

  const [items, snapshot] = await Promise.all([
    loadChecklist(month),
    loadMonthSnapshot(month),
  ]);

  const record = closes.get(month) ?? null;
  const open = openItemCount(items);
  const changes = record ? diffSnapshot(record.snapshot, snapshot) : [];
  const over = isMonthOver(month, today);

  const money = formatCurrencyPrecise;

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/reconciliation"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Reconciliation
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-[#174734]">Month-end close</h1>
        <p className="mt-2 max-w-2xl text-[#6b705c]">
          Work through the checklist, then close the month. Closing saves the
          month&apos;s numbers; if anything changes afterward you will see a
          warning here.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {months.map((option) => {
            const closed = closes.has(option);
            const changed = changedMonths.has(option);
            return (
              <Link
                key={option}
                href={`/reconciliation/month-end?month=${option}`}
                className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                  option === month
                    ? "border-[#174734] bg-[#174734] text-white"
                    : "border-[#d8d3c6] text-[#174734] hover:border-[#9c7a20]"
                }`}
              >
                {shortMonthLabel(option)}
                {changed ? " ⚠" : closed ? " ✓" : ""}
              </Link>
            );
          })}
        </div>

        <h2 className="mt-8 text-xl font-bold text-[#174734]">{monthLabel(month)}</h2>

        {record ? (
          <div
            className={`mt-3 rounded-xl border p-4 text-sm ${
              changes.length > 0
                ? "border-[#e5b26a] bg-[#fdf3e1] text-[#7a4a05]"
                : "border-[#b7d9c3] bg-[#eaf5ee] text-[#1d6b3f]"
            }`}
          >
            <p className="font-bold">
              {changes.length > 0 ? "Closed, but changed since" : "Closed"}{" "}
              {formatClosedAt(record.closedAt)}
              {record.closedByName ? ` by ${record.closedByName}` : ""}
            </p>
            {record.openItemsAtClose > 0 ? (
              <p className="mt-1">
                Closed with {record.openItemsAtClose} open{" "}
                {record.openItemsAtClose === 1 ? "item" : "items"}.
              </p>
            ) : null}
            {record.notes ? <p className="mt-1">Note: {record.notes}</p> : null}
            {changes.length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {changes.map((change) => (
                  <li key={change.label}>
                    {change.label}: was{" "}
                    {!isMoneyLabel(change.label)
                      ? change.was
                      : money(change.was)}
                    , now{" "}
                    {!isMoneyLabel(change.label)
                      ? change.now
                      : money(change.now)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const style = STATUS_STYLE[item.status];
            return (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-xl border border-[#e4dfd0] bg-white p-4"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.cls}`}
                >
                  {style.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[#174734]">{item.title}</p>
                  <p className="text-sm text-[#6b705c]">{item.detail}</p>
                </div>
                {item.href && item.status !== "ok" ? (
                  <Link
                    href={item.href}
                    className="shrink-0 text-sm font-semibold text-[#9c7a20] hover:underline"
                  >
                    Open →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>

        <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-4">
          <h3 className="font-bold text-[#174734]">
            {monthLabel(month)} at a glance
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[#6b705c]">Revenue ({snapshot.invoiceCount} invoices)</dt>
              <dd className="font-bold text-[#174734]">{money(snapshot.revenue)}</dd>
            </div>
            <div>
              <dt className="text-[#6b705c]">Cost of service</dt>
              <dd className="font-bold text-[#174734]">{money(snapshot.costOfService)}</dd>
            </div>
            <div>
              <dt className="text-[#6b705c]">Payroll</dt>
              <dd className="font-bold text-[#174734]">{money(snapshot.payroll)}</dd>
            </div>
            <div>
              <dt className="text-[#6b705c]">Operating expenses</dt>
              <dd className="font-bold text-[#174734]">{money(snapshot.operatingExpenses)}</dd>
            </div>
            <div>
              <dt className="text-[#6b705c]">Fixed overhead (est.)</dt>
              <dd className="font-bold text-[#174734]">{money(snapshot.overhead)}</dd>
            </div>
            <div>
              <dt className="text-[#6b705c]">Net profit</dt>
              <dd className="font-bold text-[#174734]">{money(snapshot.netProfit)}</dd>
            </div>
          </dl>
          <Link
            href="/revenue/profit-loss"
            className="mt-3 inline-block text-sm font-semibold text-[#9c7a20] hover:underline"
          >
            Open Profit &amp; Loss →
          </Link>
        </section>

        {!over ? (
          <p className="mt-6 text-sm text-[#6b705c]">
            {monthLabel(month)} isn&apos;t over yet, so it can&apos;t be closed.
          </p>
        ) : record ? (
          <form action={reopenMonth} className="mt-6 flex flex-wrap items-center gap-3">
            <input type="hidden" name="month" value={month} />
            <button
              type="submit"
              className="rounded-xl border border-[#d8d3c6] px-4 py-2.5 text-sm font-bold text-[#174734] hover:border-[#9c7a20]"
            >
              Reopen {monthLabel(month)}
            </button>
            <span className="text-sm text-[#6b705c]">
              Reopen, fix what changed, then close again to save a fresh snapshot.
            </span>
          </form>
        ) : (
          <form action={closeMonth} className="mt-6 space-y-3">
            <input type="hidden" name="month" value={month} />
            <textarea
              name="notes"
              rows={2}
              placeholder="Optional note (for example: waiting on one refund)"
              className="w-full rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-sm"
            />
            {open > 0 ? (
              <label className="flex items-start gap-2 text-sm text-[#7a4a05]">
                <input type="checkbox" name="acknowledge_open" className="mt-1" />
                <span>
                  {open} checklist {open === 1 ? "item is" : "items are"} still open.
                  Close the month anyway.
                </span>
              </label>
            ) : null}
            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#226246]"
            >
              Close {monthLabel(month)}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
