export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-account drill-down for the Reconciliation report (Ryan,
// 2026-11-03: "...I can click on the account and work to reconciliate
// each of them"). The full transaction list for one account, oldest to
// newest, each with the running balance right after it (same
// convention as a bank statement/check register), newest shown first
// to match every other list in this app. Reuses ExpenseRowItem as-is
// (same full edit capability -- category, ledger_type, amount, date,
// notes -- as /expenses and /expenses/journal already give, just
// scoped to one account) rather than building a second editor.
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getTrackedAccountsWithBalances } from "@/lib/bankReconciliation";
import { toNumber, formatCurrencyPrecise as formatCurrency } from "@/lib/format";
import ExpenseRowItem, { type ExpenseRow } from "../../expenses/ExpenseRowItem";
import StartingBalanceForm from "../StartingBalanceForm";

type PageProps = {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ status?: string }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ReconciliationAccountPage({
  params,
  searchParams,
}: PageProps) {
  const { accountId } = await params;
  const { status } = await searchParams;
  const showingNeedsReview = status === "needs_review";

  const accounts = await getTrackedAccountsWithBalances();
  const account = accounts.find((a) => a.id === accountId);

  if (!account) {
    notFound();
  }

  let query = supabaseServer
    .from("expenses")
    .select(
      "id, vendor, description, category, ledger_type, amount, expense_date, notes, created_by_name, status, job_costing_treatment, amortization_end_date"
    )
    .eq("bank_account_id", accountId);

  if (account.startingBalance !== null) {
    query = query.gte("expense_date", account.startingBalanceDate);
  }

  if (showingNeedsReview) {
    query = query.eq("status", "needs_review");
  }

  const { data, error } = await query
    .order("expense_date", { ascending: true })
    .order("created_at", { ascending: true });

  const rowsAscending = (data ?? []) as ExpenseRow[];

  // Running balance only means anything once there's a starting point
  // to run forward from -- without one, this is just a plain (if
  // account-scoped) list, same as /expenses with no running total.
  // Built with reduce (not a mutated loop variable) -- this runs inside
  // a Server Component's render, which the lint rule above treats the
  // same as a mutable closure in a hook.
  const rowsWithBalance = rowsAscending.reduce<
    { row: ExpenseRow; balance: number }[]
  >((acc, row) => {
    const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : account.startingBalance ?? 0;
    acc.push({ row, balance: previousBalance - toNumber(row.amount) });
    return acc;
  }, []);

  const rowsNewestFirst = [...rowsWithBalance].reverse();

  const isBalanced =
    account.difference !== null && Math.abs(account.difference) < 1;

  return (
    <main
      className="px-4 py-6 sm:p-8"
      style={{ minHeight: "100vh", background: "#f8fafc" }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <Link
          href="/reconciliation"
          style={{
            color: "#64748b",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          ← Reconciliation
        </Link>

        <h1 style={{ margin: "12px 0 6px", fontSize: "28px", color: "#0f172a" }}>
          {account.name ?? "Account"}
          {account.mask ? ` ···${account.mask}` : ""}
        </h1>

        {account.institutionName ? (
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
            {account.institutionName}
          </p>
        ) : null}

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <div>
              <p style={{ margin: 0, color: "#64748b", fontSize: "11px" }}>
                Bank Balance
              </p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: "20px" }}>
                {account.liveBalance !== null ? formatCurrency(account.liveBalance) : "--"}
              </p>
              <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "10px" }}>
                {account.liveBalance !== null
                  ? `as of ${formatDate(account.liveBalanceAsOf)}`
                  : "not synced yet"}
              </p>
            </div>

            <div>
              <p style={{ margin: 0, color: "#64748b", fontSize: "11px" }}>
                In-App Balance
              </p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: "20px" }}>
                {account.inAppBalance !== null ? formatCurrency(account.inAppBalance) : "Not set"}
              </p>
              <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "10px" }}>
                {account.startingBalance !== null
                  ? `since ${formatDate(account.startingBalanceDate)}`
                  : "--"}
              </p>
            </div>

            {account.difference !== null ? (
              <div>
                <p style={{ margin: 0, color: "#64748b", fontSize: "11px" }}>
                  Difference
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontWeight: 700,
                    fontSize: "16px",
                    color: isBalanced ? "#166534" : "#92400e",
                  }}
                >
                  {isBalanced
                    ? "Balanced"
                    : formatCurrency(Math.abs(account.difference))}
                </p>
                {!isBalanced ? (
                  <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "10px" }}>
                    {account.difference > 0 ? "bank is higher" : "in-app is higher"}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: "16px" }}>
            <StartingBalanceForm
              accountId={account.id}
              startingBalance={account.startingBalance}
              startingBalanceDate={account.startingBalanceDate}
            />
          </div>
        </section>

        {account.startingBalance === null ? (
          <section
            style={{
              background: "#fef3c7",
              border: "1px solid #fde68a",
              borderRadius: "12px",
              padding: "14px 16px",
              marginBottom: "20px",
              color: "#92400e",
              fontSize: "13px",
            }}
          >
            Set a starting balance above to see a running balance next to
            each transaction below.
          </section>
        ) : null}

        <section className="rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              Transactions{" "}
              <span className="font-normal text-[#6b705c]">
                ({rowsNewestFirst.length})
              </span>
            </h2>

            {showingNeedsReview ? (
              <Link
                href={`/reconciliation/${accountId}`}
                className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm font-semibold text-[#174734] hover:bg-[#f7f6f1]"
              >
                Show all
              </Link>
            ) : (
              <Link
                href={`/reconciliation/${accountId}?status=needs_review`}
                className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm font-semibold text-[#174734] hover:bg-[#f7f6f1]"
              >
                Needs review only{account.reviewCount > 0 ? ` (${account.reviewCount})` : ""}
              </Link>
            )}
          </div>

          {error && (
            <p className="mt-4 font-bold text-red-700">
              Couldn&apos;t load transactions: {error.message}
            </p>
          )}

          <div className="mt-6 space-y-3">
            {rowsNewestFirst.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                {showingNeedsReview
                  ? "Nothing left to review for this account."
                  : "No transactions for this account yet."}
              </p>
            ) : (
              rowsNewestFirst.map(({ row, balance }) => (
                <ExpenseRowItem
                  key={row.id}
                  expense={row}
                  runningBalance={account.startingBalance !== null ? balance : undefined}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
