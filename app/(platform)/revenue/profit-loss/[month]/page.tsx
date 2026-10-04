export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import {
  fetchOverheadCosts,
  calculateOverheadBreakdownForRange,
} from "@/lib/overhead";
import { EXPENSE_CATEGORIES } from "../../../expenses/constants";
import ExpenseRowItem, { type ExpenseRow } from "../../../expenses/ExpenseRowItem";
import {
  toNumber,
  formatCurrency,
  formatCurrencyPrecise,
  formatDateOnly as formatDate,
} from "@/lib/format";

// The P&L month drill-down (Ryan, 2026-10-04): "I want to see a full P&L
// by clicking on the month, so I can see the breakdown of everything
// that falls into those categories so I can adjust as necessary."
//
// Same three sources as the parent /revenue/profit-loss page's monthly
// row for this exact month -- invoice_financials for revenue,
// lib/overhead.ts for fixed overhead, the expenses table for logged
// expenses -- just itemized instead of summed. The Expenses section
// reuses ExpenseRowItem (the same editable row the Expenses page uses)
// so "adjust as necessary" actually works here, not just "look here."
// Revenue and Overhead are read-only -- a wrong invoice total is a
// Jobber/Invoices fix, and overhead line items are managed on
// /materials, not per-month.
type InvoiceRow = {
  jobber_client_id: string | null;
  issue_date: string | null;
  invoice_total: number | string;
};

type PageProps = {
  params: Promise<{ month: string }>;
};

function monthBounds(month: string): { start: string; end: string; isCurrentMonth: boolean } {
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const monthStartDate = new Date(year, m - 1, 1);
  const monthEndExclusive = new Date(year, m, 1);
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === monthStartDate.getFullYear() &&
    today.getMonth() === monthStartDate.getMonth();

  const end = isCurrentMonth
    ? today.toISOString().slice(0, 10)
    : new Date(monthEndExclusive.getTime() - 86_400_000).toISOString().slice(0, 10);

  return { start, end, isCurrentMonth };
}

async function fetchInvoicesForRange(
  startDate: string,
  endDate: string
): Promise<InvoiceRow[]> {
  const pageSize = 1000;
  const rows: InvoiceRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select("jobber_client_id, issue_date, invoice_total")
      .gte("issue_date", startDate)
      .lte("issue_date", endDate)
      .not("jobber_client_id", "is", null)
      .order("issue_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as InvoiceRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

export default async function ProfitAndLossMonthPage({ params }: PageProps) {
  const { month } = await params;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    notFound();
  }

  const { start, end, isCurrentMonth } = monthBounds(month);

  const [overheadCosts, invoices, expensesResult] = await Promise.all([
    fetchOverheadCosts(),
    fetchInvoicesForRange(start, end),
    supabaseServer
      .from("expenses")
      .select(
        "id, vendor, description, category, amount, expense_date, notes, created_by_name, status"
      )
      .gte("expense_date", start)
      .lte("expense_date", end)
      .order("expense_date", { ascending: false }),
  ]);

  const { data: expenseData, error: expenseError } = expensesResult;
  const expenses = (expenseData ?? []) as ExpenseRow[];

  const overheadBreakdown = calculateOverheadBreakdownForRange(
    overheadCosts,
    start,
    end
  ).sort((a, b) => b.amountForRange - a.amountForRange);

  const clientIds = Array.from(
    new Set(invoices.map((i) => i.jobber_client_id).filter((id): id is string => !!id))
  );

  const customerNameById = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: customers } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", clientIds);

    for (const c of customers ?? []) {
      if (c.jobber_client_id) {
        customerNameById.set(c.jobber_client_id, c.full_name ?? "Customer");
      }
    }
  }

  const revenueTotal = invoices.reduce((sum, i) => sum + toNumber(i.invoice_total), 0);
  const overheadTotal = overheadBreakdown.reduce((sum, c) => sum + c.amountForRange, 0);

  const expensesByCategory = new Map<string, number>();
  let expensesTotal = 0;
  for (const expense of expenses) {
    const amount = toNumber(expense.amount);
    expensesTotal += amount;
    expensesByCategory.set(
      expense.category,
      (expensesByCategory.get(expense.category) ?? 0) + amount
    );
  }

  const netProfit = revenueTotal - overheadTotal - expensesTotal;

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/revenue/profit-loss"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Back to Profit &amp; Loss
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-[#174734]">
          {monthLabel}
          {isCurrentMonth && (
            <span className="ml-2 text-base font-normal text-[#6b705c]">
              (through today)
            </span>
          )}
        </h1>

        <div className="mt-4 flex flex-wrap gap-3">
          <div className="rounded-xl bg-white px-4 py-3 shadow">
            <p className="text-xs text-[#6b705c]">Revenue</p>
            <p className="text-xl font-bold text-[#174734]">{formatCurrency(revenueTotal)}</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 shadow">
            <p className="text-xs text-[#6b705c]">Fixed Overhead</p>
            <p className="text-xl font-bold text-[#174734]">{formatCurrency(overheadTotal)}</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 shadow">
            <p className="text-xs text-[#6b705c]">Logged Expenses</p>
            <p className="text-xl font-bold text-[#174734]">{formatCurrency(expensesTotal)}</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 shadow">
            <p className="text-xs text-[#6b705c]">Net Profit</p>
            <p
              className={`text-xl font-bold ${netProfit < 0 ? "text-red-700" : "text-[#174734]"}`}
            >
              {formatCurrency(netProfit)}
            </p>
          </div>
        </div>

        {/* Expenses -- the only one of the three that's actually editable here */}
        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Logged Expenses</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Open a row to fix its category, amount, or anything else --
            same editor as the{" "}
            <Link href="/expenses" className="underline">
              Expenses
            </Link>{" "}
            page.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {EXPENSE_CATEGORIES.filter((c) => expensesByCategory.has(c.value)).map(
              (c) => (
                <div key={c.value} className="rounded-xl bg-[#f7f6f1] px-4 py-3">
                  <p className="text-xs text-[#6b705c]">{c.label}</p>
                  <p className="text-sm font-bold">
                    {formatCurrencyPrecise(expensesByCategory.get(c.value) ?? 0)}
                  </p>
                </div>
              )
            )}
          </div>

          {expenseError && (
            <p className="mt-4 text-sm font-bold text-red-700">
              Couldn&apos;t load expenses: {expenseError.message}
            </p>
          )}

          <div className="mt-6 space-y-3">
            {expenses.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No expenses logged this month.
              </p>
            ) : (
              expenses.map((expense) => (
                <ExpenseRowItem key={expense.id} expense={expense} />
              ))
            )}
          </div>
        </section>

        {/* Overhead -- read-only; managed on /materials, not per-month */}
        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Fixed Overhead</h2>
            <Link
              href="/materials"
              className="text-sm font-semibold text-[#9c7a20] hover:underline"
            >
              Edit on Materials &amp; Costs →
            </Link>
          </div>
          <p className="mt-1 text-sm text-[#6b705c]">
            Each recurring or amortized cost&apos;s share of this month,
            prorated by day.
          </p>

          <div className="mt-4 space-y-2">
            {overheadBreakdown.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No overhead costs applied to this month.
              </p>
            ) : (
              overheadBreakdown.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e7e2d5] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p className="text-xs text-[#6b705c]">
                      {c.category ?? "Overhead"} ·{" "}
                      {c.costType === "recurring" ? "Recurring" : "Amortized"}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold">
                    {formatCurrencyPrecise(c.amountForRange)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Revenue -- read-only; corrections happen in Jobber/Invoices */}
        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Revenue</h2>
            <Link
              href="/invoices"
              className="text-sm font-semibold text-[#9c7a20] hover:underline"
            >
              View in Invoices →
            </Link>
          </div>
          <p className="mt-1 text-sm text-[#6b705c]">
            Every invoice issued this month, native and Jobber-sourced.
          </p>

          <div className="mt-4 overflow-x-auto">
            {invoices.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No invoices issued this month.
              </p>
            ) : (
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[#e7e2d5] text-left text-xs font-bold text-[#9c7a20]">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, i) => (
                    <tr key={i} className="border-b border-[#f0eee4]">
                      <td className="py-2 pr-4">
                        {invoice.jobber_client_id
                          ? customerNameById.get(invoice.jobber_client_id) ?? "Customer"
                          : "Customer"}
                      </td>
                      <td className="py-2 pr-4 text-[#6b705c]">
                        {invoice.issue_date ? formatDate(invoice.issue_date) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {formatCurrencyPrecise(invoice.invoice_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
