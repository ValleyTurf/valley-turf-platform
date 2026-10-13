export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { LEDGER_TYPES, ledgerTypeLabel, type LedgerType } from "../constants";
import ExpenseRowItem, { inputClasses, type ExpenseRow } from "../ExpenseRowItem";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
  formatDateOnly as formatDate,
} from "@/lib/format";

// Ryan (2026-10-13): "should we keep the money movements and have a
// pill that says paid to loan and another that says owner draw, or
// something similar so we can keep those records for tax purposes?
// Maybe move them to a journal entry or something?" -- a credit card
// payment, a mortgage/loan payment, a transfer between his own
// accounts, or an owner draw/contribution isn't a real business
// expense, but for S-corp basis/tax purposes he wants a record kept
// rather than just deleting the bank-feed row. Reclassify one from the
// Expenses page (its Entry Type dropdown, in CategoryAndJobCostingFields)
// and it disappears from /expenses and /expenses/totals (both filter
// `ledger_type is null`) and shows up here instead -- same
// date-range-picker + expandable-group pattern as that Totals page, so
// this is "Totals," just grouped by entry type instead of vendor/category
// and scoped to the rows everything else deliberately excludes.
type JournalPageProps = {
  searchParams: Promise<{ start?: string; end?: string }>;
};

type GroupTotal = {
  key: LedgerType;
  label: string;
  total: number;
  count: number;
  rows: ExpenseRow[];
};

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildGroupTotals(expenses: ExpenseRow[]): GroupTotal[] {
  const totals = new Map<LedgerType, GroupTotal>();

  for (const expense of expenses) {
    if (!expense.ledger_type) continue;

    const amount = toNumber(expense.amount);
    const existing = totals.get(expense.ledger_type);

    if (existing) {
      existing.total += amount;
      existing.count += 1;
      existing.rows.push(expense);
    } else {
      totals.set(expense.ledger_type, {
        key: expense.ledger_type,
        label: ledgerTypeLabel(expense.ledger_type),
        total: amount,
        count: 1,
        rows: [expense],
      });
    }
  }

  // Stable order (matches LEDGER_TYPES) rather than sorted by total --
  // there are only ever four groups, and a fixed order is easier to
  // scan across visits than one that reshuffles as totals change.
  return LEDGER_TYPES.map((t) => totals.get(t.value)).filter(
    (g): g is GroupTotal => g !== undefined
  );
}

export default async function ExpenseJournalPage({
  searchParams,
}: JournalPageProps) {
  const params = await searchParams;
  const start = params.start || startOfYear();
  const end = params.end || todayLocal();

  const { data, error } = await supabaseServer
    .from("expenses")
    .select(
      "id, vendor, description, category, ledger_type, amount, expense_date, notes, created_by_name, status, job_costing_treatment, amortization_end_date"
    )
    .gte("expense_date", start)
    .lte("expense_date", end)
    .not("ledger_type", "is", null)
    .order("expense_date", { ascending: false });

  const expenses = (data ?? []) as ExpenseRow[];
  const groups = buildGroupTotals(expenses);
  const grandTotal = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#174734]">Journal</h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Money movements kept for tax/basis records -- owner draws,
              loan payments, transfers between your own accounts, and
              owner contributions. These don&apos;t count toward the
              P&amp;L, job costing, or the Expenses totals page.
            </p>
          </div>
          <Link
            href="/expenses"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#174734]/5"
          >
            ← Back to Expenses
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label htmlFor="start" className="text-xs font-bold text-[#9c7a20]">
                From
              </label>
              <input
                id="start"
                name="start"
                type="date"
                defaultValue={start}
                className={`${inputClasses} w-auto`}
              />
            </div>
            <div>
              <label htmlFor="end" className="text-xs font-bold text-[#9c7a20]">
                Through
              </label>
              <input
                id="end"
                name="end"
                type="date"
                defaultValue={end}
                className={`${inputClasses} w-auto`}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Apply
            </button>
          </form>
        </section>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Couldn&apos;t load journal entries: {error.message}
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {formatDate(start)} – {formatDate(end)}
            </h2>
            <div className="rounded-xl bg-[#f7f6f1] px-4 py-3">
              <p className="text-xs text-[#6b705c]">Total</p>
              <p className="text-xl font-bold text-[#174734]">
                {formatCurrency(grandTotal)}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {groups.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No journal entries in this range. Reclassify a bank-feed
                row (its Entry Type dropdown, on the Expenses page) to
                move it here.
              </p>
            ) : (
              groups.map((group) => (
                <details
                  key={group.key}
                  className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <span className="shrink-0 rounded-full bg-[#1d4ed8]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">
                        {group.label}
                      </span>
                      <span className="font-normal text-[#6b705c]">
                        ({group.count})
                      </span>
                    </p>
                    <p className="shrink-0 text-sm font-bold">
                      {formatCurrency(group.total)}
                    </p>
                  </summary>
                  <div className="mt-4 space-y-3 border-t border-[#e7e2d5] pt-4">
                    {group.rows.map((expense) => (
                      <ExpenseRowItem key={expense.id} expense={expense} />
                    ))}
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
