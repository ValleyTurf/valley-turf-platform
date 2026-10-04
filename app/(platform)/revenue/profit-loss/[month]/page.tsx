export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import {
  fetchOverheadCosts,
  calculateOverheadBreakdownForRange,
  type OverheadContribution,
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
// First cut showed every expense in one flat list -- Ryan's follow-up:
// "Can we make the different categories clickable so I can see those
// category breakdowns rather than the list of everything? Also, can we
// also have an option to see a QB like report with the line items,"
// with a screenshot of QuickBooks' own Profit and Loss report (Income /
// Cost of Goods Sold / Gross Profit / Expenses, each category collapsed
// to a total, "Total for X" subtotals). This rebuilds the page as that
// same structure: every category starts collapsed to its total, and
// expanding one reveals its line items -- for expenses, the real
// ExpenseRowItem editor (so "adjust as necessary" still works here);
// for Fixed Overhead and Revenue, a read-only list, since those aren't
// edited per-month (overhead lives on /materials, revenue corrections
// happen in Jobber/Invoices).
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
  const expenseItemsByCategory = new Map<string, ExpenseRow[]>();
  let expensesTotal = 0;

  for (const expense of expenses) {
    const amount = toNumber(expense.amount);
    expensesTotal += amount;
    expensesByCategory.set(
      expense.category,
      (expensesByCategory.get(expense.category) ?? 0) + amount
    );
    const items = expenseItemsByCategory.get(expense.category) ?? [];
    items.push(expense);
    expenseItemsByCategory.set(expense.category, items);
  }

  // Same grouping EXPENSE_CATEGORIES already carries (cost_of_service/fuel
  // = cogs, payroll = payroll, everything else = opex) -- mirrors the
  // Income / Cost of Goods Sold / Gross Profit / Expenses structure in
  // Ryan's QuickBooks screenshot instead of inventing a new one.
  const cogsCategories = EXPENSE_CATEGORIES.filter((c) => c.group === "cogs");
  const payrollCategories = EXPENSE_CATEGORIES.filter((c) => c.group === "payroll");
  const opexCategories = EXPENSE_CATEGORIES.filter((c) => c.group === "opex");

  const sumCategories = (cats: typeof EXPENSE_CATEGORIES) =>
    cats.reduce((sum, c) => sum + (expensesByCategory.get(c.value) ?? 0), 0);

  const cogsTotal = sumCategories(cogsCategories);
  const payrollTotal = sumCategories(payrollCategories);
  const opexTotal = sumCategories(opexCategories);

  const grossProfit = revenueTotal - cogsTotal;
  const operatingExpensesTotal = overheadTotal + payrollTotal + opexTotal;
  const netOperatingIncome = grossProfit - operatingExpensesTotal;

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
              className={`text-xl font-bold ${netOperatingIncome < 0 ? "text-red-700" : "text-[#174734]"}`}
            >
              {formatCurrency(netOperatingIncome)}
            </p>
          </div>
        </div>

        {/* QuickBooks-style statement -- everything collapsed to a total
            by default, click a category to expand its line items. */}
        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Profit &amp; Loss Statement</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Click any line to see what&apos;s in it. Expense categories
            open the same editor as the{" "}
            <Link href="/expenses" className="underline">
              Expenses
            </Link>{" "}
            page.
          </p>

          <div className="mt-4 divide-y divide-[#f0eee4] text-sm">
            <StatementGroupLabel label="Income" />
            <RevenueStatementRow
              total={revenueTotal}
              invoices={invoices}
              customerNameById={customerNameById}
            />
            <TotalRow label="Total for Income" amount={revenueTotal} />

            <StatementGroupLabel label="Cost of Goods Sold" />
            {cogsCategories
              .filter((c) => expensesByCategory.has(c.value))
              .map((c) => (
                <CategoryStatementRow
                  key={c.value}
                  label={c.label}
                  total={expensesByCategory.get(c.value) ?? 0}
                  items={expenseItemsByCategory.get(c.value) ?? []}
                />
              ))}
            <TotalRow label="Total for Cost of Goods Sold" amount={cogsTotal} />

            <div className="flex items-center justify-between bg-[#f7f6f1] px-3 py-2 font-bold text-[#174734]">
              <span>Gross Profit</span>
              <span>{formatCurrencyPrecise(grossProfit)}</span>
            </div>

            <StatementGroupLabel label="Expenses" />
            <OverheadStatementRow total={overheadTotal} items={overheadBreakdown} />
            {payrollCategories
              .filter((c) => expensesByCategory.has(c.value))
              .map((c) => (
                <CategoryStatementRow
                  key={c.value}
                  label={c.label}
                  total={expensesByCategory.get(c.value) ?? 0}
                  items={expenseItemsByCategory.get(c.value) ?? []}
                />
              ))}
            {opexCategories
              .filter((c) => expensesByCategory.has(c.value))
              .map((c) => (
                <CategoryStatementRow
                  key={c.value}
                  label={c.label}
                  total={expensesByCategory.get(c.value) ?? 0}
                  items={expenseItemsByCategory.get(c.value) ?? []}
                />
              ))}
            <TotalRow label="Total for Expenses" amount={operatingExpensesTotal} />

            <div
              className={`flex items-center justify-between px-3 py-3 text-base font-bold ${
                netOperatingIncome < 0 ? "bg-red-50 text-red-700" : "bg-[#174734]/10 text-[#174734]"
              }`}
            >
              <span>Net Operating Income</span>
              <span>{formatCurrencyPrecise(netOperatingIncome)}</span>
            </div>
          </div>

          {expenseError && (
            <p className="mt-4 text-sm font-bold text-red-700">
              Couldn&apos;t load expenses: {expenseError.message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function StatementGroupLabel({ label }: { label: string }) {
  return (
    <p className="pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-[#9c7a20] first:pt-0">
      {label}
    </p>
  );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 font-bold text-[#174734]">
      <span>{label}</span>
      <span>{formatCurrencyPrecise(amount)}</span>
    </div>
  );
}

// A single expandable category line -- collapsed, it's just a name and a
// total (exactly what Ryan's QuickBooks screenshot shows); expanded, it's
// the real editable rows for that category this month.
function CategoryStatementRow({
  label,
  total,
  items,
}: {
  label: string;
  total: number;
  items: ExpenseRow[];
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-[#f7f6f1]">
        <span className="flex items-center gap-2">
          <span className="text-[#9c7a20] transition group-open:rotate-90">▸</span>
          {label}
        </span>
        <span className="font-semibold">{formatCurrencyPrecise(total)}</span>
      </summary>
      <div className="space-y-2 bg-[#f7f6f1] px-3 py-3">
        {items.map((expense) => (
          <ExpenseRowItem key={expense.id} expense={expense} />
        ))}
      </div>
    </details>
  );
}

function OverheadStatementRow({
  total,
  items,
}: {
  total: number;
  items: OverheadContribution[];
}) {
  if (items.length === 0) return null;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-[#f7f6f1]">
        <span className="flex items-center gap-2">
          <span className="text-[#9c7a20] transition group-open:rotate-90">▸</span>
          Fixed Overhead
        </span>
        <span className="font-semibold">{formatCurrencyPrecise(total)}</span>
      </summary>
      <div className="space-y-2 bg-[#f7f6f1] px-3 py-3">
        <p className="text-xs text-[#6b705c]">
          Prorated by day from each recurring/amortized cost.{" "}
          <Link href="/materials" className="underline">
            Edit on Materials &amp; Costs →
          </Link>
        </p>
        {items.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#e7e2d5] bg-white px-3 py-2"
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
        ))}
      </div>
    </details>
  );
}

function RevenueStatementRow({
  total,
  invoices,
  customerNameById,
}: {
  total: number;
  invoices: InvoiceRow[];
  customerNameById: Map<string, string>;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-[#f7f6f1]">
        <span className="flex items-center gap-2">
          <span className="text-[#9c7a20] transition group-open:rotate-90">▸</span>
          Revenue
        </span>
        <span className="font-semibold">{formatCurrencyPrecise(total)}</span>
      </summary>
      <div className="bg-[#f7f6f1] px-3 py-3">
        <p className="text-xs text-[#6b705c]">
          Every invoice issued this month, native and Jobber-sourced.{" "}
          <Link href="/invoices" className="underline">
            View in Invoices →
          </Link>
        </p>

        {invoices.length === 0 ? (
          <p className="mt-2 text-sm text-[#6b705c]">No invoices issued this month.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-[#e7e2d5] text-left text-xs font-bold text-[#9c7a20]">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice, i) => (
                  <tr key={i} className="border-b border-[#f0eee4] bg-white">
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
          </div>
        )}
      </div>
    </details>
  );
}
