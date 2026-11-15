// Database half of deposit-to-invoice matching (ROADMAP "Top 10
// (November 2026)" #5, migration 106). The suggestion logic is pure and
// lives in lib/depositMatching.ts.
//
// The problem: a customer who pays by Zelle or check shows up twice
// with nothing connecting the two -- a deposit in the bank feed waiting
// in Needs Review, and an invoice someone has to remember to mark paid.
// Matching does both ends at once: the invoice is marked paid (same
// lib/payments.ts path as the Mark Paid button -- no email, text or
// receipt goes to the customer), the deposit is filed as "Revenue
// (Already Recorded)" so it isn't counted as income a second time, and
// the pairing is kept in deposit_invoice_matches.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { recordManualInvoicePayment } from "@/lib/payments";
import type { MatchableInvoice } from "@/lib/depositMatching";

// How far back to look for deposits nobody has dealt with yet.
const LOOKBACK_DAYS = 120;

export const DEPOSIT_PAYMENT_METHODS = ["Zelle", "Check", "Cash", "Other"] as const;

export type DepositToMatch = {
  id: string;
  date: string;
  // Positive dollars.
  amount: number;
  vendor: string | null;
  description: string | null;
  accountLabel: string | null;
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number | string;
  vendor: string | null;
  description: string | null;
  bank_account_id: string | null;
};

// Money-in bank feed rows that are still waiting for someone: not
// reviewed, not already matched. Everything else about them (is it a
// customer payment, a Stripe payout, a transfer?) is exactly what the
// person looking at the list is there to decide.
export async function listDepositsToMatch(): Promise<DepositToMatch[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabaseServer
    .from("expenses")
    .select("id, expense_date, amount, vendor, description, bank_account_id")
    .eq("source", "bank_feed")
    .eq("status", "needs_review")
    .eq("staff_reviewed", false)
    .lt("amount", 0)
    .gte("expense_date", since)
    .order("expense_date", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Couldn't load deposits: ${error.message}`);
  }

  const rows = (data ?? []) as ExpenseRow[];

  if (rows.length === 0) return [];

  const [{ data: matchRows }, { data: accountRows }] = await Promise.all([
    supabaseServer
      .from("deposit_invoice_matches")
      .select("expense_id")
      .in(
        "expense_id",
        rows.map((row) => row.id)
      ),
    supabaseServer.from("bank_accounts").select("id, name, mask"),
  ]);

  const matched = new Set((matchRows ?? []).map((row) => row.expense_id as string));
  const accountLabelById = new Map(
    (accountRows ?? []).map((account) => [
      account.id as string,
      `${(account.name as string | null) ?? "Account"}${
        account.mask ? ` ···${account.mask as string}` : ""
      }`,
    ])
  );

  return rows
    .filter((row) => !matched.has(row.id))
    .map((row) => ({
      id: row.id,
      date: row.expense_date,
      amount: Math.abs(Number(row.amount)),
      vendor: row.vendor,
      description: row.description,
      accountLabel: row.bank_account_id
        ? accountLabelById.get(row.bank_account_id) ?? null
        : null,
    }));
}

// Invoices a deposit could be paying: sent and not yet paid.
export async function listInvoicesAwaitingPayment(): Promise<MatchableInvoice[]> {
  const { data, error } = await supabaseServer
    .from("invoices")
    .select("id, invoice_number, customer_name, jobber_client_id, total, issue_date")
    .in("status", ["sent", "overdue"])
    .order("issue_date", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Couldn't load unpaid invoices: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    invoiceNumber: row.invoice_number as string,
    customerName: (row.customer_name as string | null) ?? null,
    jobberClientId: (row.jobber_client_id as string | null) ?? null,
    total: Number(row.total),
    issueDate: row.issue_date as string,
  }));
}

export type MatchDepositResult =
  | { ok: true; invoiceNumbers: string[] }
  | { ok: false; error: string };

export async function matchDepositToInvoices(params: {
  expenseId: string;
  invoiceIds: string[];
  method: string;
  actor: { id: string; name: string } | null;
}): Promise<MatchDepositResult> {
  const invoiceIds = Array.from(new Set(params.invoiceIds.filter(Boolean)));

  if (invoiceIds.length === 0) {
    return { ok: false, error: "Pick at least one invoice." };
  }

  const { data: deposit, error: depositError } = await supabaseServer
    .from("expenses")
    .select("id, amount, expense_date, source, notes")
    .eq("id", params.expenseId)
    .maybeSingle();

  if (depositError || !deposit) {
    return { ok: false, error: depositError?.message ?? "Deposit not found." };
  }

  const depositCents = Math.round(Math.abs(Number(deposit.amount)) * 100);

  if (Number(deposit.amount) >= 0) {
    return { ok: false, error: "That bank transaction is money out, not a deposit." };
  }

  const [{ data: invoiceRows, error: invoicesError }, { data: existingMatches }] =
    await Promise.all([
      supabaseServer
        .from("invoices")
        .select("id, invoice_number, status, total")
        .in("id", invoiceIds),
      supabaseServer
        .from("deposit_invoice_matches")
        .select("invoice_id, amount")
        .eq("expense_id", params.expenseId),
    ]);

  if (invoicesError) {
    return { ok: false, error: invoicesError.message };
  }

  const invoices = invoiceRows ?? [];

  if (invoices.length !== invoiceIds.length) {
    return { ok: false, error: "One of those invoices no longer exists." };
  }

  for (const invoice of invoices) {
    if (invoice.status !== "sent" && invoice.status !== "overdue") {
      return {
        ok: false,
        error: `Invoice ${invoice.invoice_number as string} is ${invoice.status as string} -- only sent, unpaid invoices can be matched.`,
      };
    }
  }

  // The deposit has to cover what's being marked paid. (It may be MORE
  // than the invoices -- a tip, or a second invoice matched later --
  // but marking $400 of invoices paid off a $200 deposit is a mistake.)
  const alreadyCents = (existingMatches ?? []).reduce(
    (sum, row) => sum + Math.round(Number(row.amount) * 100),
    0
  );
  const requestedCents = invoices.reduce(
    (sum, invoice) => sum + Math.round(Number(invoice.total) * 100),
    0
  );

  if (alreadyCents + requestedCents > depositCents) {
    return {
      ok: false,
      error: `Those invoices add up to $${(requestedCents / 100).toFixed(2)}, more than is left of this $${(
        depositCents / 100
      ).toFixed(2)} deposit.`,
    };
  }

  // Noon Phoenix on the day the money landed -- the payment date that
  // shows on the invoice and in Revenue.
  const paidAt = new Date(`${deposit.expense_date as string}T12:00:00-07:00`).toISOString();
  const method = params.method.trim() || "Zelle";
  const matchedNumbers: string[] = [];

  for (const invoice of invoices) {
    const payment = await recordManualInvoicePayment({
      invoiceId: invoice.id as string,
      paidAt,
      amount: Number(invoice.total),
      method,
    });

    if (!payment.ok) {
      return {
        ok: false,
        error: `${
          matchedNumbers.length > 0
            ? `Matched ${matchedNumbers.join(", ")}, then stopped: `
            : ""
        }couldn't mark invoice ${invoice.invoice_number as string} paid -- ${payment.error}`,
      };
    }

    const { error: matchError } = await supabaseServer.from("deposit_invoice_matches").insert({
      expense_id: params.expenseId,
      invoice_id: invoice.id,
      amount: Number(invoice.total),
      created_by_user_id: params.actor?.id ?? null,
      created_by_name: params.actor?.name ?? null,
    });

    if (matchError) {
      // The invoice IS paid at this point; only the link failed. Say so
      // plainly rather than reporting a failure that would invite
      // marking it paid a second time.
      return {
        ok: false,
        error: `Invoice ${invoice.invoice_number as string} was marked paid, but linking it to the deposit failed: ${matchError.message}`,
      };
    }

    matchedNumbers.push(invoice.invoice_number as string);
  }

  // File the bank side: this money is revenue the invoices already
  // account for, a person has now looked at it, and it leaves Needs
  // Review.
  const note = `Matched to invoice${matchedNumbers.length === 1 ? "" : "s"} ${matchedNumbers.join(
    ", "
  )} (${method}).`;

  const { error: updateError } = await supabaseServer
    .from("expenses")
    .update({
      ledger_type: "revenue_deposit",
      category: "other",
      job_costing_treatment: null,
      amortization_end_date: null,
      status: "categorized",
      staff_reviewed: true,
      notes: deposit.notes ? `${deposit.notes as string} ${note}` : note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.expenseId);

  if (updateError) {
    return {
      ok: false,
      error: `Invoices ${matchedNumbers.join(", ")} were marked paid, but the deposit couldn't be filed: ${updateError.message}`,
    };
  }

  return { ok: true, invoiceNumbers: matchedNumbers };
}
