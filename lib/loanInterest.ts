// Records the interest part of each loan payment as its own expense row
// (category "interest", migrations 115 and 116). The payment row itself
// stays a "Paid to Loan" journal entry, so the P&L counts the interest
// once and the principal not at all. Interest rows have no bank account,
// so they never touch a bank balance.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { interestExpenseFor, isLoanAccount, parseInterest } from "@/lib/loanPayments";

const PAGE_SIZE = 1000;

type PaymentRow = {
  id: string;
  expense_date: string;
  amount: number | string;
  description: string | null;
  vendor: string | null;
  ledger_type: string | null;
  bank_account_id: string | null;
};

export type LoanInterestStatus = {
  recordedCount: number;
  recordedTotal: number;
  pendingCount: number;
  pendingTotal: number;
  // Payments with an interest figure that were filed as a normal expense,
  // so no separate interest row is added.
  filedAsExpenseCount: number;
};

export type LoanInterestResult = LoanInterestStatus & { created: number };

async function loanAccounts(onlyAccountId?: string) {
  const { data } = await supabaseServer
    .from("bank_accounts")
    .select("id, name, subtype");

  return (data ?? []).filter(
    (a) =>
      isLoanAccount({ name: a.name as string | null, subtype: a.subtype as string | null }) &&
      (!onlyAccountId || a.id === onlyAccountId)
  ) as { id: string; name: string | null; subtype: string | null }[];
}

async function loadPayments(accountIds: string[]): Promise<PaymentRow[]> {
  const rows: PaymentRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServer
      .from("expenses")
      .select("id, expense_date, amount, description, vendor, ledger_type, bank_account_id")
      .in("bank_account_id", accountIds)
      .order("expense_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Couldn't read loan payments: ${error.message}`);

    const batch = (data ?? []) as PaymentRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadExistingInterest(parentIds: string[]): Promise<Map<string, number>> {
  const existing = new Map<string, number>();

  for (let i = 0; i < parentIds.length; i += 100) {
    const { data } = await supabaseServer
      .from("expenses")
      .select("loan_interest_for_expense_id, amount")
      .in("loan_interest_for_expense_id", parentIds.slice(i, i + 100));

    for (const row of data ?? []) {
      existing.set(
        row.loan_interest_for_expense_id as string,
        Number(row.amount ?? 0)
      );
    }
  }

  return existing;
}

// apply=false only reports; apply=true also writes the missing or
// out-of-date interest rows. Safe to run repeatedly.
export async function syncLoanInterestExpenses(options?: {
  accountId?: string;
  apply?: boolean;
}): Promise<LoanInterestResult> {
  const accounts = await loanAccounts(options?.accountId);

  const empty: LoanInterestResult = {
    recordedCount: 0,
    recordedTotal: 0,
    pendingCount: 0,
    pendingTotal: 0,
    filedAsExpenseCount: 0,
    created: 0,
  };

  if (accounts.length === 0) return empty;

  const nameById = new Map(accounts.map((a) => [a.id, a.name ?? "Loan"]));
  const payments = await loadPayments(accounts.map((a) => a.id));

  const withInterest = payments
    .map((row) => ({
      row,
      interest: interestExpenseFor({
        amount: Number(row.amount),
        description: row.description,
        vendor: row.vendor,
        ledgerType: row.ledger_type,
      }),
    }))
    .filter((p): p is { row: PaymentRow; interest: number } => p.interest !== null);

  const filedAsExpenseCount = payments.filter(
    (row) =>
      Number(row.amount) < 0 &&
      !row.ledger_type &&
      parseInterest([row.description, row.vendor].filter(Boolean).join(" ")) !== null
  ).length;

  const existing = await loadExistingInterest(withInterest.map((p) => p.row.id));

  const result: LoanInterestResult = { ...empty, filedAsExpenseCount };
  const toWrite: Record<string, unknown>[] = [];

  for (const { row, interest } of withInterest) {
    const current = existing.get(row.id);

    if (current !== undefined && Math.abs(current - interest) < 0.005) {
      result.recordedCount += 1;
      result.recordedTotal += interest;
      continue;
    }

    result.pendingCount += 1;
    result.pendingTotal += interest;

    toWrite.push({
      vendor: "Loan interest",
      description: `Interest portion of loan payment (${nameById.get(row.bank_account_id ?? "") ?? "loan"})`,
      category: "interest",
      amount: interest,
      expense_date: row.expense_date,
      source: "loan_interest",
      status: "categorized",
      loan_interest_for_expense_id: row.id,
      notes: `Auto-split from the interest figure in the loan payment description. Payment row: ${row.id}.`,
    });
  }

  if (options?.apply && toWrite.length > 0) {
    for (let i = 0; i < toWrite.length; i += 200) {
      const { error } = await supabaseServer
        .from("expenses")
        .upsert(toWrite.slice(i, i + 200), {
          onConflict: "loan_interest_for_expense_id",
        });

      if (error) throw new Error(`Couldn't record loan interest: ${error.message}`);
    }

    result.created = toWrite.length;
    result.recordedCount += result.pendingCount;
    result.recordedTotal += result.pendingTotal;
    result.pendingCount = 0;
    result.pendingTotal = 0;
  }

  result.recordedTotal = Math.round(result.recordedTotal * 100) / 100;
  result.pendingTotal = Math.round(result.pendingTotal * 100) / 100;

  return result;
}
