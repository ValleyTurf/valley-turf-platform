import "server-only";

// Bank balance reconciliation (migration 103), split out of
// app/(platform)/settings/bank-feed/page.tsx into its own module --
// Ryan, 2026-11-03: "Rather than having this in the settings, should
// there be a Reconciliation report that shows the feed information and
// then I can click on the account and work to reconciliate each of
// them?" Settings > Bank Feed stays "plumbing" (connect, pick which
// accounts sync, trigger a sync); this is the actual reviewable report,
// now its own top-level page (app/(platform)/reconciliation), with a
// per-account drill-down (app/(platform)/reconciliation/[accountId])
// that lists every transaction for that account with a running balance
// -- same logic, both pages need it, so it lives here once rather than
// drifting between a list view and a detail view.
import { supabaseServer } from "@/lib/supabase-server";
import { toNumber } from "@/lib/format";
import { isLoanAccount, loanRowEffect } from "@/lib/loanPayments";

export type TrackedAccountBalance = {
  id: string;
  name: string | null;
  mask: string | null;
  institutionName: string | null;
  startingBalance: number | null;
  startingBalanceDate: string;
  liveBalance: number | null;
  liveBalanceAsOf: string | null;
  inAppBalance: number | null;
  reviewCount: number;
  difference: number | null;
  // Loan accounts move by the principal part of each payment only
  // (lib/loanPayments.ts).
  isLoan: boolean;
};

// Every tracked (include_in_expense_sync) account, with its computed
// in-app running balance and needs-review count. In-app balance =
// starting_balance minus the signed sum of every expenses row against
// that account from starting_balance_date forward -- amount's sign
// convention is positive = money out, negative = money in (migration
// 096 / commit 7e5c92e), so subtracting the signed sum both pays the
// balance down for a real expense and adds it back for a deposit.
export async function getTrackedAccountsWithBalances(): Promise<
  TrackedAccountBalance[]
> {
  const { data: connections } = await supabaseServer
    .from("bank_connections")
    .select("id, institution_name")
    .neq("status", "disconnected");

  const institutionNameByConnectionId = new Map(
    (connections ?? []).map((c) => [c.id as string, c.institution_name as string | null])
  );

  const connectionIds = Array.from(institutionNameByConnectionId.keys());

  if (connectionIds.length === 0) {
    return [];
  }

  const { data: accounts } = await supabaseServer
    .from("bank_accounts")
    .select(
      "id, bank_connection_id, name, mask, subtype, starting_balance, starting_balance_date, live_balance, live_balance_as_of"
    )
    .in("bank_connection_id", connectionIds)
    .eq("include_in_expense_sync", true)
    .order("name", { ascending: true });

  const trackedAccounts = accounts ?? [];

  const results: TrackedAccountBalance[] = [];

  for (const account of trackedAccounts) {
    const startingBalance =
      account.starting_balance !== null ? toNumber(account.starting_balance) : null;

    const [ledgerResult, reviewResult] = await Promise.all([
      startingBalance !== null
        ? supabaseServer
            .from("expenses")
            .select("amount, description, vendor")
            .eq("bank_account_id", account.id)
            .gte("expense_date", account.starting_balance_date)
        : Promise.resolve({
            data: [] as {
              amount: number | string;
              description: string | null;
              vendor: string | null;
            }[],
          }),

      supabaseServer
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", account.id)
        .eq("status", "needs_review"),
    ]);

    const isLoan = isLoanAccount({ name: account.name, subtype: account.subtype });

    // A loan moves by the principal of each payment (read from the
    // description), not the whole payment -- interest does not reduce
    // what is owed.
    const movement = (ledgerResult.data ?? []).reduce(
      (sum, row) =>
        sum +
        (isLoan
          ? loanRowEffect(toNumber(row.amount), [row.description, row.vendor]).effect
          : toNumber(row.amount)),
      0
    );

    const inAppBalance = startingBalance !== null ? startingBalance - movement : null;

    const liveBalance = account.live_balance !== null ? toNumber(account.live_balance) : null;

    const difference =
      liveBalance !== null && inAppBalance !== null
        ? Math.round((liveBalance - inAppBalance) * 100) / 100
        : null;

    results.push({
      id: account.id,
      name: account.name,
      mask: account.mask,
      institutionName: institutionNameByConnectionId.get(account.bank_connection_id) ?? null,
      startingBalance,
      startingBalanceDate: account.starting_balance_date,
      liveBalance,
      liveBalanceAsOf: account.live_balance_as_of,
      inAppBalance,
      reviewCount: (reviewResult as { count: number | null }).count ?? 0,
      difference,
      isLoan,
    });
  }

  return results;
}
