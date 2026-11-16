// Tax-time package: one ZIP of CSVs for the accountant (ROADMAP Top 10,
// second list, #8). Logic is in lib/taxPackageLogic.ts; this file reads
// the same sources the Profit & Loss and Transactions pages read.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchOverheadCosts, calculateOverheadForRange } from "@/lib/overhead";
import { getTransactions } from "@/lib/transactions";
import { rowsToCsv } from "@/lib/csv";
import { buildZip, type ZipEntry } from "@/lib/zip";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  ledgerTypeLabel,
} from "@/app/(platform)/expenses/constants";
import {
  buildCategoryTotals,
  buildMonthlyPnl,
  buildPaymentMethodTotals,
  readmeText,
  type CategoryGroup,
} from "@/lib/taxPackageLogic";

const PAGE_SIZE = 1000;

const GROUP_BY_CATEGORY = new Map<string, CategoryGroup>(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.group])
);

const GROUP_LABEL: Record<CategoryGroup, string> = {
  cogs: "Cost of service",
  payroll: "Payroll",
  opex: "Operating expense",
};

function groupOf(category: string): CategoryGroup {
  return GROUP_BY_CATEGORY.get(category) ?? "opex";
}

type ExpenseDetail = {
  id: string;
  expense_date: string;
  vendor: string | null;
  description: string | null;
  category: string;
  ledger_type: string | null;
  amount: number | string;
  status: string | null;
  source: string | null;
  notes: string | null;
};

async function readPages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Couldn't read ${label}: ${error.message}`);

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

export type TaxPackageSummary = {
  year: number;
  revenue: number;
  expenses: number;
  netBeforeOverhead: number;
  paymentsCollected: number;
  paymentCount: number;
  unreviewedBankRows: number;
};

type LoadedYear = {
  invoices: { issueDate: string | null; total: number }[];
  expenses: ExpenseDetail[];
  journal: ExpenseDetail[];
  unreviewedBankRows: number;
};

async function loadYear(year: number): Promise<LoadedYear> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const [invoiceRows, expenseRows, unreviewed] = await Promise.all([
    readPages<{ issue_date: string | null; invoice_total: number | string | null }>(
      "invoices",
      (from, to) =>
        supabaseServer
          .from("invoice_financials")
          .select("issue_date, invoice_total")
          .gte("issue_date", start)
          .lte("issue_date", end)
          .not("jobber_client_id", "is", null)
          .order("issue_date", { ascending: true })
          .range(from, to)
    ),

    readPages<ExpenseDetail>("expenses", (from, to) =>
      supabaseServer
        .from("expenses")
        .select(
          "id, expense_date, vendor, description, category, ledger_type, amount, status, source, notes"
        )
        .gte("expense_date", start)
        .lte("expense_date", end)
        .order("expense_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),

    supabaseServer
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("source", "bank_feed")
      .eq("status", "needs_review")
      .eq("staff_reviewed", false)
      .gte("expense_date", start)
      .lte("expense_date", end),
  ]);

  return {
    invoices: invoiceRows.map((row) => ({
      issueDate: row.issue_date,
      total: Number(row.invoice_total ?? 0),
    })),
    expenses: expenseRows.filter((row) => !row.ledger_type),
    journal: expenseRows.filter((row) => row.ledger_type),
    unreviewedBankRows: unreviewed.count ?? 0,
  };
}

function toTaxExpenses(rows: ExpenseDetail[]) {
  return rows.map((row) => ({
    date: row.expense_date,
    amount: Number(row.amount ?? 0),
    category: row.category,
  }));
}

export async function loadTaxPackageSummary(year: number): Promise<TaxPackageSummary> {
  const [loaded, transactions] = await Promise.all([
    loadYear(year),
    getTransactions({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }),
  ]);

  const revenue = loaded.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const expenses = toTaxExpenses(loaded.expenses).reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  return {
    year,
    revenue,
    expenses,
    netBeforeOverhead: revenue - expenses,
    paymentsCollected: transactions.rows.reduce((sum, row) => sum + row.amount, 0),
    paymentCount: transactions.rows.length,
    unreviewedBankRows: loaded.unreviewedBankRows,
  };
}

export async function buildTaxPackageZip(year: number): Promise<Buffer> {
  const [loaded, overheadCosts, transactions] = await Promise.all([
    loadYear(year),
    fetchOverheadCosts(),
    getTransactions({
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      sortField: "date",
      sortDir: "asc",
    }),
  ]);

  const taxExpenses = toTaxExpenses(loaded.expenses);

  const monthly = buildMonthlyPnl({
    year,
    invoices: loaded.invoices,
    expenses: taxExpenses,
    groupOf,
    overheadForMonth: (monthKey) => {
      const [y, m] = monthKey.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return calculateOverheadForRange(
        overheadCosts,
        `${monthKey}-01`,
        `${monthKey}-${String(last).padStart(2, "0")}`
      );
    },
  });

  const categoryTotals = buildCategoryTotals({
    expenses: taxExpenses,
    labelOf: expenseCategoryLabel,
    groupLabelOf: (category) => GROUP_LABEL[groupOf(category)],
  });

  const payments = transactions.rows;
  const methodTotals = buildPaymentMethodTotals(
    payments.map((row) => ({
      method: row.method,
      amount: row.amount,
      tip: row.tip,
      fee: row.fee,
    }))
  );

  const detailRows = (rows: ExpenseDetail[], journal: boolean) =>
    rows.map((row) => ({
      date: row.expense_date,
      vendor: row.vendor ?? "",
      description: row.description ?? "",
      [journal ? "entry_type" : "category"]: journal
        ? ledgerTypeLabel(row.ledger_type ?? "")
        : expenseCategoryLabel(row.category),
      amount: Number(row.amount ?? 0).toFixed(2),
      source: row.source ?? "",
      reviewed: row.status === "needs_review" ? "needs review" : "categorized",
      notes: row.notes ?? "",
    }));

  const csvOrHeader = (rows: Record<string, unknown>[], header: string) =>
    rows.length > 0 ? rowsToCsv(rows) : `${header}\n`;

  const entries: ZipEntry[] = [
    {
      name: "profit-and-loss-by-month.csv",
      data: Buffer.from(rowsToCsv(monthly)),
    },
    {
      name: "expenses-by-category.csv",
      data: Buffer.from(csvOrHeader(categoryTotals, "category,group,entries,total")),
    },
    {
      name: "expenses-detail.csv",
      data: Buffer.from(
        csvOrHeader(
          detailRows(loaded.expenses, false),
          "date,vendor,description,category,amount,source,reviewed,notes"
        )
      ),
    },
    {
      name: "journal-entries.csv",
      data: Buffer.from(
        csvOrHeader(
          detailRows(loaded.journal, true),
          "date,vendor,description,entry_type,amount,source,reviewed,notes"
        )
      ),
    },
    {
      name: "payments-received.csv",
      data: Buffer.from(
        csvOrHeader(
          payments.map((row) => ({
            date: row.date ?? "",
            client: row.clientName,
            invoice_number: row.invoiceNumber ?? "",
            type: row.type,
            paid_with: row.method,
            amount: row.amount.toFixed(2),
            tip: row.tip.toFixed(2),
            processing_fee: row.fee.toFixed(2),
          })),
          "date,client,invoice_number,type,paid_with,amount,tip,processing_fee"
        )
      ),
    },
    {
      name: "payments-by-method.csv",
      data: Buffer.from(
        csvOrHeader(methodTotals, "paid_with,payments,collected,tips,processing_fees")
      ),
    },
    {
      name: "README.txt",
      data: Buffer.from(
        readmeText({
          year,
          generatedOn: new Date().toISOString().slice(0, 10),
          unreviewedBankRows: loaded.unreviewedBankRows,
        })
      ),
    },
  ];


  return buildZip(entries);
}
