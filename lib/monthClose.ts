// Month-end close (ROADMAP third top-10 list #5): reads what is still
// open for a month, the month's numbers, and whether the month has been
// closed. Pure rules are in lib/monthCloseLogic.ts. The numbers use the
// same sources and the same builder as the Profit & Loss page and the
// tax package, so a closed month can never disagree with them.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getTrackedAccountsWithBalances } from "@/lib/bankReconciliation";
import { fetchOverheadCosts, calculateOverheadForRange } from "@/lib/overhead";
import {
  EXPENSE_CATEGORIES,
} from "@/app/(platform)/expenses/constants";
import {
  buildMonthlyPnl,
  type CategoryGroup,
} from "@/lib/taxPackageLogic";
import {
  buildChecklist,
  monthRange,
  type ChecklistItem,
  type CloseSnapshot,
} from "@/lib/monthCloseLogic";

const PAGE_SIZE = 1000;

const GROUP_BY_CATEGORY = new Map<string, CategoryGroup>(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.group])
);

function groupOf(category: string): CategoryGroup {
  return GROUP_BY_CATEGORY.get(category) ?? "opex";
}

export type MonthCloseRecord = {
  month: string;
  closedAt: string;
  closedByName: string | null;
  notes: string | null;
  snapshot: Partial<CloseSnapshot>;
  openItemsAtClose: number;
};

export async function loadCloseRecords(): Promise<Map<string, MonthCloseRecord>> {
  const { data } = await supabaseServer
    .from("month_closes")
    .select("month, closed_at, closed_by_name, notes, snapshot, open_items_at_close");

  const map = new Map<string, MonthCloseRecord>();

  for (const row of data ?? []) {
    map.set(row.month as string, {
      month: row.month as string,
      closedAt: row.closed_at as string,
      closedByName: (row.closed_by_name as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      snapshot: (row.snapshot ?? {}) as Partial<CloseSnapshot>,
      openItemsAtClose: Number(row.open_items_at_close ?? 0),
    });
  }

  return map;
}

type PagedResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

async function readPages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PagedResult<T>
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

function isUnpaidStatus(status: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return !upper.includes("PAID") && !upper.includes("VOID") && upper !== "DRAFT";
}

// The month's numbers: same definitions as the Profit & Loss page.
export async function loadMonthSnapshot(month: string): Promise<CloseSnapshot> {
  const { start, end } = monthRange(month);
  const year = Number(month.slice(0, 4));

  const [invoiceRows, expenseRows, overheadCosts] = await Promise.all([
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
    readPages<{
      expense_date: string;
      category: string;
      amount: number | string;
      ledger_type: string | null;
    }>("expenses", (from, to) =>
      supabaseServer
        .from("expenses")
        .select("expense_date, category, amount, ledger_type")
        .gte("expense_date", start)
        .lte("expense_date", end)
        .order("expense_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchOverheadCosts(),
  ]);

  const expenses = expenseRows.filter((row) => !row.ledger_type);

  const rows = buildMonthlyPnl({
    year,
    invoices: invoiceRows.map((row) => ({
      issueDate: row.issue_date,
      total: Number(row.invoice_total ?? 0),
    })),
    expenses: expenses.map((row) => ({
      date: row.expense_date,
      amount: Number(row.amount ?? 0),
      category: row.category,
    })),
    groupOf,
    overheadForMonth: (monthKey) => {
      const range = monthRange(monthKey);
      return calculateOverheadForRange(overheadCosts, range.start, range.end);
    },
  });

  const row = rows.find((r) => r.month === month);

  return {
    revenue: row?.revenue ?? 0,
    costOfService: row?.cost_of_service ?? 0,
    payroll: row?.payroll ?? 0,
    operatingExpenses: row?.operating_expenses ?? 0,
    overhead: row?.fixed_overhead_estimate ?? 0,
    netProfit: row?.net_profit ?? 0,
    invoiceCount: invoiceRows.length,
    expenseCount: expenses.length,
  };
}

export async function loadChecklist(month: string): Promise<ChecklistItem[]> {
  const { start, end } = monthRange(month);

  const bankRows = () =>
    supabaseServer
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("source", "bank_feed")
      .eq("status", "needs_review")
      .eq("staff_reviewed", false)
      .gte("expense_date", start)
      .lte("expense_date", end);

  const [chargesToReview, deposits, accounts, invoices] = await Promise.all([
    bankRows().gte("amount", 0),
    bankRows().lt("amount", 0),
    getTrackedAccountsWithBalances(),
    readPages<{
      jobber_invoice_id: string;
      status: string | null;
      total: number | string | null;
    }>("invoices", (from, to) =>
      supabaseServer
        .from("jobber_invoices")
        .select("jobber_invoice_id, status, total")
        .gte("issue_date", start)
        .lte("issue_date", end)
        .not("jobber_client_id", "is", null)
        .order("jobber_invoice_id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const unpaid = invoices.filter((invoice) => isUnpaidStatus(invoice.status));

  // Native invoices from this month that are unpaid and had a card
  // charge fail.
  let failedCardCharges = 0;

  const { data: nativeUnpaid } = await supabaseServer
    .from("invoices")
    .select("id, status")
    .gte("issue_date", start)
    .lte("issue_date", end);

  const unpaidIds = (nativeUnpaid ?? [])
    .filter((row) => isUnpaidStatus(row.status as string | null))
    .map((row) => row.id as string);

  if (unpaidIds.length > 0) {
    const { data: attempts } = await supabaseServer
      .from("autopay_charge_attempts")
      .select("invoice_id")
      .eq("succeeded", false)
      .in("invoice_id", unpaidIds);

    failedCardCharges = new Set((attempts ?? []).map((a) => a.invoice_id as string)).size;
  }

  return buildChecklist({
    month,
    bankRowsToReview: chargesToReview.count ?? 0,
    depositsToMatch: deposits.count ?? 0,
    accounts: accounts.map((a) => ({
      name: a.name ?? "Account",
      difference: a.difference,
    })),
    unpaidInvoices: {
      count: unpaid.length,
      total: unpaid.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
    },
    failedCardCharges,
  });
}
