// Pure builders for the tax-time package (lib/taxPackage.ts loads the
// data, app/api/revenue/tax-package zips it). The monthly layout follows
// the Profit & Loss page exactly (revenue = invoices issued; expenses
// split cost of service / payroll / operating; fixed overhead
// prorated) so the accountant's numbers can never disagree with the
// P&L screen.

export type TaxInvoice = { issueDate: string | null; total: number };

export type TaxExpense = {
  date: string;
  amount: number;
  category: string;
};

export type CategoryGroup = "cogs" | "payroll" | "opex";

export type MonthlyPnlRow = {
  month: string; // "2026-03"
  revenue: number;
  cost_of_service: number;
  payroll: number;
  operating_expenses: number;
  fixed_overhead_estimate: number;
  net_profit: number;
};

export function monthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildMonthlyPnl(params: {
  year: number;
  invoices: TaxInvoice[];
  expenses: TaxExpense[];
  groupOf: (category: string) => CategoryGroup;
  // Prorated fixed overhead for one month ("YYYY-MM").
  overheadForMonth: (monthKey: string) => number;
}): MonthlyPnlRow[] {
  return monthKeys(params.year).map((month) => {
    const revenue = params.invoices
      .filter((invoice) => invoice.issueDate?.startsWith(month))
      .reduce((sum, invoice) => sum + invoice.total, 0);

    const groups = { cogs: 0, payroll: 0, opex: 0 };

    for (const expense of params.expenses) {
      if (expense.date.startsWith(month)) {
        groups[params.groupOf(expense.category)] += expense.amount;
      }
    }

    const overhead = params.overheadForMonth(month);

    return {
      month,
      revenue: round2(revenue),
      cost_of_service: round2(groups.cogs),
      payroll: round2(groups.payroll),
      operating_expenses: round2(groups.opex),
      fixed_overhead_estimate: round2(overhead),
      net_profit: round2(
        revenue - groups.cogs - groups.payroll - groups.opex - overhead
      ),
    };
  });
}

export type CategoryTotalRow = {
  category: string;
  group: string;
  entries: number;
  total: number;
};

export function buildCategoryTotals(params: {
  expenses: TaxExpense[];
  labelOf: (category: string) => string;
  groupLabelOf: (category: string) => string;
}): CategoryTotalRow[] {
  const totals = new Map<string, CategoryTotalRow>();

  for (const expense of params.expenses) {
    const label = params.labelOf(expense.category);
    const entry = totals.get(label) ?? {
      category: label,
      group: params.groupLabelOf(expense.category),
      entries: 0,
      total: 0,
    };

    entry.entries += 1;
    entry.total += expense.amount;
    totals.set(label, entry);
  }

  return Array.from(totals.values())
    .map((row) => ({ ...row, total: round2(row.total) }))
    .sort((a, b) => b.total - a.total);
}

export type PaymentLike = { method: string; amount: number; tip: number; fee: number };

export type PaymentMethodTotalRow = {
  paid_with: string;
  payments: number;
  collected: number;
  tips: number;
  processing_fees: number;
};

export function buildPaymentMethodTotals(payments: PaymentLike[]): PaymentMethodTotalRow[] {
  const totals = new Map<string, PaymentMethodTotalRow>();

  for (const payment of payments) {
    const key = payment.method || "Unknown";
    const entry = totals.get(key) ?? {
      paid_with: key,
      payments: 0,
      collected: 0,
      tips: 0,
      processing_fees: 0,
    };

    entry.payments += 1;
    entry.collected += payment.amount;
    entry.tips += payment.tip;
    entry.processing_fees += payment.fee;
    totals.set(key, entry);
  }

  return Array.from(totals.values())
    .map((row) => ({
      ...row,
      collected: round2(row.collected),
      tips: round2(row.tips),
      processing_fees: round2(row.processing_fees),
    }))
    .sort((a, b) => b.collected - a.collected);
}

export function readmeText(params: {
  year: number;
  generatedOn: string;
  unreviewedBankRows: number;
}): string {
  const lines = [
    `Valley Turf Revival - ${params.year} tax package`,
    `Generated ${params.generatedOn}`,
    "",
    "Files",
    "  profit-and-loss-by-month.csv   Month by month: revenue, expenses, net profit.",
    "  expenses-by-category.csv       The year's expenses totaled by category.",
    "  expenses-detail.csv            Every expense, one line each.",
    "  journal-entries.csv            Owner draws, loan payments, transfers and owner",
    "                                 contributions. NOT business expenses, so they are",
    "                                 kept out of the profit figures above.",
    "  payments-received.csv          Every customer payment (card, ACH, Zelle, check).",
    "  payments-by-method.csv         The same payments totaled by how they paid.",
    "",
    "How the numbers are worked out",
    "  Revenue is invoices issued in the month (accrual basis), not money received.",
    "  payments-received.csv shows money received if you file on a cash basis.",
    "  Fixed overhead is an internal monthly estimate of recurring costs, so it can",
    "  overlap expenses that were also logged. Use the net profit before overhead",
    "  (revenue minus the three expense columns) if you prefer.",
    "  Processing fees are shown per payment; they are also logged as expenses.",
    "  Sales tax is not tracked in this export.",
  ];

  if (params.unreviewedBankRows > 0) {
    lines.push(
      "",
      `Heads up: ${params.unreviewedBankRows} bank feed transactions from ${params.year} have not been reviewed yet, so their categories may change.`
    );
  }

  return lines.join("\n") + "\n";
}
