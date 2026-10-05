export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchOverheadCosts, calculateOverheadForRange } from "@/lib/overhead";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "../../expenses/constants";
import { formatCurrency, toNumber } from "@/lib/format";

// First cut of the Profit & Loss report (Ryan, 2026-10-04 -- phase 3 of
// the native expense/P&L build). Deliberately scoped:
//
// Revenue -- same source Revenue's own dashboard trusts
// (invoice_financials.invoice_total, the view that already unifies
// native and Jobber-sourced invoices), not the separate
// monthly_financials view -- that view was never actually read by any
// app code (confirmed via a repo-wide search before building this), so
// there's no guarantee it's been kept correct the same way
// invoice_financials has.
//
// Fixed Overhead -- calculateOverheadForRange, extracted into
// lib/overhead.ts out of this exact file's Revenue dashboard rather than
// re-derived, so this page can never silently disagree with Revenue's
// own net-profit figure on the overhead piece.
//
// Logged Expenses -- the new `expenses` table (migration
// 087_add_expenses.sql), grouped by category. Still phase 1 of that
// table: manual entry only, no bank feed.
//
// Deliberately NOT included yet: per-job direct costs (materials/labor
// from Job Costing Analytics) -- that view's own direct_cost column is
// flagged unreliable by Job Costing Analytics' own code (it recomputes
// from a separate cost-breakdown fetch instead of trusting the view),
// and folding that in properly means reusing that same reliable
// calculation, not re-deriving a third version of it here. So this
// page's Net Profit will not match Job Costing Analytics' estimated
// profit -- the gap is exactly the labor/materials piece, called out
// in the page's own caveat box below rather than left for Ryan to
// notice and wonder about.
type InvoiceRow = {
  issue_date: string | null;
  invoice_total: number | string;
};

type ExpenseRow = {
  expense_date: string;
  amount: number | string;
  category: string;
};

type MonthBucket = {
  key: string; // "YYYY-MM"
  label: string;
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD", inclusive
};

// Ryan, 2026-10-05: "can we see each month for the year and then maybe
// YTD numbers on the page?" -- switched from a rolling trailing window
// to every month of the current calendar year through today, so the
// table itself becomes the year-to-date view instead of always trailing
// 6 months behind whatever "now" is.
function monthsElapsedThisYear(): number {
  return new Date().getMonth() + 1; // January = 1 ... current month inclusive
}

function buildMonthBuckets(count: number): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const isCurrentMonth = i === 0;
    const monthEndExclusive = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      1
    );
    // Current (in-progress) month only counts through today, same
    // "don't count days that haven't happened yet" reasoning
    // calculateOverheadForRange already applies to overhead.
    const end = isCurrentMonth
      ? today
      : new Date(monthEndExclusive.getTime() - 86_400_000);

    const key = `${monthStart.getFullYear()}-${String(
      monthStart.getMonth() + 1
    ).padStart(2, "0")}`;

    buckets.push({
      key,
      label: monthStart.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      start: monthStart.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
  }

  return buckets;
}

async function fetchInvoiceRevenue(
  startDate: string,
  endDate: string
): Promise<InvoiceRow[]> {
  const pageSize = 1000;
  const rows: InvoiceRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select("issue_date, invoice_total")
      .gte("issue_date", startDate)
      .lte("issue_date", endDate)
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as InvoiceRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchExpenseRows(
  startDate: string,
  endDate: string
): Promise<ExpenseRow[]> {
  const { data, error } = await supabaseServer
    .from("expenses")
    .select("expense_date, amount, category")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (error) throw error;

  return (data ?? []) as ExpenseRow[];
}

// Typed as plain string -> group rather than ExpenseCategory -> group so
// .get() can take expense_date rows straight from Supabase (typed as a
// bare string, since Postgres doesn't enforce the same literal union
// the app's CHECK constraint does) without a cast at every call site.
const CATEGORY_GROUP = new Map<string, "cogs" | "payroll" | "opex">(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.group])
);

export default async function ProfitAndLossPage() {
  const currentYear = new Date().getFullYear();
  const months = buildMonthBuckets(monthsElapsedThisYear());
  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].end;

  const [overheadCosts, invoiceRows, expenseRows] = await Promise.all([
    fetchOverheadCosts(),
    fetchInvoiceRevenue(rangeStart, rangeEnd),
    fetchExpenseRows(rangeStart, rangeEnd),
  ]);

  const monthRows = months.map((month) => {
    const revenue = invoiceRows
      .filter(
        (row) =>
          row.issue_date &&
          row.issue_date >= month.start &&
          row.issue_date <= month.end
      )
      .reduce((sum, row) => sum + toNumber(row.invoice_total), 0);

    const overhead = calculateOverheadForRange(
      overheadCosts,
      month.start,
      month.end
    );

    const monthExpenses = expenseRows.filter(
      (row) => row.expense_date >= month.start && row.expense_date <= month.end
    );

    const expensesByGroup = { cogs: 0, payroll: 0, opex: 0 };
    for (const row of monthExpenses) {
      const group = CATEGORY_GROUP.get(row.category) ?? "opex";
      expensesByGroup[group] += toNumber(row.amount);
    }

    const totalLoggedExpenses =
      expensesByGroup.cogs + expensesByGroup.payroll + expensesByGroup.opex;

    const netProfit = revenue - overhead - totalLoggedExpenses;

    return {
      ...month,
      revenue,
      overhead,
      expensesByGroup,
      totalLoggedExpenses,
      netProfit,
    };
  });

  const yearToDate = monthRows.reduce(
    (totals, row) => ({
      revenue: totals.revenue + row.revenue,
      overhead: totals.overhead + row.overhead,
      totalLoggedExpenses: totals.totalLoggedExpenses + row.totalLoggedExpenses,
      netProfit: totals.netProfit + row.netProfit,
    }),
    { revenue: 0, overhead: 0, totalLoggedExpenses: 0, netProfit: 0 }
  );

  const currentMonthExpenses = expenseRows.filter(
    (row) =>
      row.expense_date >= months[months.length - 1].start &&
      row.expense_date <= months[months.length - 1].end
  );

  const currentMonthByCategory = new Map<string, number>();
  for (const row of currentMonthExpenses) {
    currentMonthByCategory.set(
      row.category,
      (currentMonthByCategory.get(row.category) ?? 0) + toNumber(row.amount)
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#174734]">
              Profit &amp; Loss
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              First cut of a native P&amp;L -- revenue minus fixed overhead
              minus logged expenses, by month. See the note below for what
              this does and doesn&apos;t include yet.
            </p>
          </div>

          <Link
            href="/expenses"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Log an Expense
          </Link>
        </header>

        <section className="mt-6 rounded-2xl border border-[#d4af37]/40 bg-white p-5 shadow">
          <p className="text-sm text-[#6b705c]">
            <span className="font-bold text-[#9c7a20]">What&apos;s in this number:</span>{" "}
            revenue (every invoice issued, native and Jobber-sourced),
            minus fixed/recurring overhead (Materials &amp; Costs &rarr;
            Overhead Costs), minus everything logged on the{" "}
            <Link href="/expenses" className="underline">
              Expenses
            </Link>{" "}
            page.
            <br />
            <span className="font-bold text-[#9c7a20]">
              What&apos;s not in it yet:
            </span>{" "}
            per-job materials and labor cost (that lives in Job Costing
            Analytics and isn&apos;t wired in here yet), and there&apos;s no
            bank feed -- every expense here was typed in by hand. Net Profit
            below will run higher than Job Costing Analytics&apos; own
            profit figure for that reason, not because the numbers disagree.
          </p>
        </section>

        <section className="mt-6 overflow-x-auto rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">{currentYear} Month by Month</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Click a month for the full breakdown -- every invoice, every
            overhead line item, and every logged expense that rolled up
            into its numbers.
          </p>

          <table className="mt-4 w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#e7e2d5] text-left text-xs font-bold text-[#9c7a20]">
                <th className="py-2 pr-4">Month</th>
                <th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 pr-4 text-right">Fixed Overhead</th>
                <th className="py-2 pr-4 text-right">Logged Expenses</th>
                <th className="py-2 pr-4 text-right">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((row) => (
                <tr key={row.key} className="border-b border-[#f0eee4]">
                  <td className="py-2 pr-4 font-semibold">
                    <Link
                      href={`/revenue/profit-loss/${row.key}`}
                      className="text-[#174734] underline decoration-[#d4af37] decoration-2 underline-offset-2 hover:text-[#226246]"
                    >
                      {row.label}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCurrency(row.revenue)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[#6b705c]">
                    {formatCurrency(row.overhead)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[#6b705c]">
                    {formatCurrency(row.totalLoggedExpenses)}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right font-bold ${
                      row.netProfit < 0 ? "text-red-700" : "text-[#174734]"
                    }`}
                  >
                    {formatCurrency(row.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#174734]/20 bg-[#f7f6f1] text-sm font-bold">
                <td className="py-3 pr-4 text-[#174734]">
                  {currentYear} Year to Date
                </td>
                <td className="py-3 pr-4 text-right text-[#174734]">
                  {formatCurrency(yearToDate.revenue)}
                </td>
                <td className="py-3 pr-4 text-right text-[#6b705c]">
                  {formatCurrency(yearToDate.overhead)}
                </td>
                <td className="py-3 pr-4 text-right text-[#6b705c]">
                  {formatCurrency(yearToDate.totalLoggedExpenses)}
                </td>
                <td
                  className={`py-3 pr-4 text-right ${
                    yearToDate.netProfit < 0 ? "text-red-700" : "text-[#174734]"
                  }`}
                >
                  {formatCurrency(yearToDate.netProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">
            {months[months.length - 1].label} Expenses by Category
          </h2>

          {currentMonthByCategory.size === 0 ? (
            <p className="mt-4 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
              Nothing logged for this month yet.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              {Array.from(currentMonthByCategory.entries()).map(
                ([category, amount]) => (
                  <div
                    key={category}
                    className="rounded-xl bg-[#f7f6f1] px-4 py-3"
                  >
                    <p className="text-xs text-[#6b705c]">
                      {expenseCategoryLabel(category)}
                    </p>
                    <p className="text-sm font-bold">
                      {formatCurrency(amount)}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
