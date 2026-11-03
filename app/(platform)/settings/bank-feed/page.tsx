export const dynamic = "force-dynamic";
export const revalidate = 0;

// Settings page for the native bank feed (Plaid) -- Phase 2 of the
// QuickBooks replacement. Mirrors settings/jobber/page.tsx's shell and
// inline-style slate convention (this page is a direct sibling of it
// within Settings) rather than the newer Tailwind gold/green palette
// used on Expenses/Revenue/Materials.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import ConnectBankButton from "./ConnectBankButton";
import SyncButton from "./SyncButton";
import { updateTrackedAccounts, updateStartingBalance } from "./actions";
import { toNumber, formatCurrencyPrecise as formatCurrency } from "@/lib/format";

type BankConnection = {
  id: string;
  institution_name: string | null;
  status: string;
  cursor: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

type BankAccount = {
  id: string;
  bank_connection_id: string;
  name: string | null;
  mask: string | null;
  subtype: string | null;
  include_in_expense_sync: boolean;
  starting_balance: number | string | null;
  starting_balance_date: string;
  live_balance: number | string | null;
  live_balance_as_of: string | null;
};

type AuditLogRow = {
  id: string;
  entity_label: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
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

function statusColor(status: string) {
  switch (status) {
    case "active":
      return { background: "#dcfce7", color: "#166534" };
    case "error":
      return { background: "#fee2e2", color: "#991b1b" };
    case "disconnected":
      return { background: "#f3f4f6", color: "#4b5563" };
    default:
      return { background: "#f3f4f6", color: "#4b5563" };
  }
}

export default async function BankFeedSettingsPage() {
  const [connectionsResult, auditResult] = await Promise.all([
    supabaseServer
      .from("bank_connections")
      .select(
        "id, institution_name, status, cursor, last_synced_at, last_error, created_at"
      )
      .order("created_at", { ascending: false }),

    supabaseServer
      .from("audit_log")
      .select("id, entity_label, changes, created_at")
      .eq("entity_type", "bank_feed_sync")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const connections = (connectionsResult.data as BankConnection[] | null) ?? [];
  const activeConnections = connections.filter((c) => c.status !== "disconnected");

  const connectionIds = activeConnections.map((c) => c.id);
  const accountsResult = connectionIds.length
    ? await supabaseServer
        .from("bank_accounts")
        .select(
          "id, bank_connection_id, name, mask, subtype, include_in_expense_sync, starting_balance, starting_balance_date, live_balance, live_balance_as_of"
        )
        .in("bank_connection_id", connectionIds)
        .order("name", { ascending: true })
    : { data: [] as BankAccount[] };

  const accounts = (accountsResult.data as BankAccount[] | null) ?? [];
  const recentActivity = (auditResult.data as AuditLogRow[] | null) ?? [];

  // Bank balance reconciliation (migration 103) -- for every tracked
  // account that has a starting balance set, compute the running
  // in-app balance (starting_balance minus the signed sum of every
  // expenses row against that account from starting_balance_date
  // forward -- amount's sign convention is positive = money out,
  // negative = money in, so subtracting the signed sum both pays the
  // balance down for a real expense and adds it back for a deposit)
  // and the count of rows still needing review, so each account's card
  // can show "Bank Balance" next to "In-App Balance" the way
  // QuickBooks' own Bank Accounts panel does.
  const trackedAccounts = accounts.filter((a) => a.include_in_expense_sync);

  const balanceByAccountId = new Map<string, number>();
  const reviewCountByAccountId = new Map<string, number>();

  for (const account of trackedAccounts) {
    const [ledgerResult, reviewResult] = await Promise.all([
      account.starting_balance !== null
        ? supabaseServer
            .from("expenses")
            .select("amount")
            .eq("bank_account_id", account.id)
            .gte("expense_date", account.starting_balance_date)
        : Promise.resolve({ data: [] as { amount: number | string }[] }),

      supabaseServer
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", account.id)
        .eq("status", "needs_review"),
    ]);

    if (account.starting_balance !== null) {
      const signedSum = (ledgerResult.data ?? []).reduce(
        (sum, row) => sum + toNumber(row.amount),
        0
      );
      balanceByAccountId.set(
        account.id,
        toNumber(account.starting_balance) - signedSum
      );
    }

    reviewCountByAccountId.set(
      account.id,
      (reviewResult as { count: number | null }).count ?? 0
    );
  }

  const hasActiveConnection = activeConnections.some((c) => c.status === "active");
  const hasErrorConnection = activeConnections.some((c) => c.status === "error");

  const headerBadge = !activeConnections.length
    ? { label: "○ Not Connected", background: "#f3f4f6", color: "#4b5563" }
    : hasErrorConnection
      ? { label: "● Reconnect Needed", background: "#fee2e2", color: "#991b1b" }
      : hasActiveConnection
        ? { label: "● Bank Feed Connected", background: "#dcfce7", color: "#166534" }
        : { label: "○ Not Connected", background: "#f3f4f6", color: "#4b5563" };

  return (
    <main
      className="px-4 py-6 sm:p-8"
      style={{ minHeight: "100vh", background: "#f8fafc" }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          <div>
            <Link
              href="/settings"
              style={{
                color: "#64748b",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              ← Settings
            </Link>

            <h1 style={{ margin: "12px 0 6px", fontSize: "32px", color: "#0f172a" }}>
              Bank Feed
            </h1>

            <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
              Connect a bank account to pull in expenses automatically,
              starting 10/1/2026 forward. Everything before that date came
              from the QuickBooks import.
            </p>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              background: headerBadge.background,
              color: headerBadge.color,
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            {headerBadge.label}
          </div>
        </div>

        {activeConnections.length === 0 ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "32px",
              marginBottom: "32px",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "20px" }}>
              No bank account connected yet
            </h2>

            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
              Connecting lets expenses post automatically instead of being
              typed in by hand. Transactions only start importing from
              10/1/2026 forward.
            </p>

            <ConnectBankButton />
          </section>
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "18px",
              marginBottom: "32px",
            }}
          >
            {activeConnections.map((connection) => {
              const badge = statusColor(connection.status);
              const connectionAccounts = accounts.filter(
                (a) => a.bank_connection_id === connection.id
              );

              return (
                <div
                  key={connection.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "22px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "16px",
                    }}
                  >
                    <h3 style={{ margin: 0, color: "#0f172a", fontSize: "17px" }}>
                      {connection.institution_name ?? "Connected account"}
                    </h3>

                    <span
                      style={{
                        ...badge,
                        padding: "4px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}
                    >
                      {connection.status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "4px",
                      color: "#475569",
                      fontSize: "12px",
                      marginBottom: "6px",
                    }}
                  >
                    {connectionAccounts.map((account) => (
                      <div key={account.id}>
                        {account.name ?? "Account"}
                        {account.mask ? ` ···${account.mask}` : ""}
                        {account.subtype ? ` · ${account.subtype}` : ""}
                        {account.include_in_expense_sync ? (
                          <span
                            style={{
                              marginLeft: "6px",
                              color: "#166534",
                              fontWeight: 700,
                            }}
                          >
                            · tracked
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "4px",
                      color: "#475569",
                      fontSize: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <strong>Last synced:</strong> {formatDate(connection.last_synced_at)}
                    </div>
                  </div>

                  {connection.last_error ? (
                    <div
                      style={{
                        marginTop: "4px",
                        marginBottom: "12px",
                        padding: "12px",
                        background: "#fef2f2",
                        borderRadius: "10px",
                        color: "#991b1b",
                        fontSize: "13px",
                      }}
                    >
                      {connection.last_error}
                    </div>
                  ) : null}

                  <SyncButton disabled={connection.status !== "active"} />
                </div>
              );
            })}
          </section>
        )}

        {trackedAccounts.length > 0 ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "22px",
              marginBottom: "32px",
            }}
          >
            <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "20px" }}>
              Account Balances
            </h2>

            <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "14px" }}>
              Bank Balance is Plaid&apos;s own live figure, cached each
              time Sync Now runs. In-App Balance is this ledger&apos;s
              running total from the starting balance below -- the two
              should match; a gap usually means a transaction here is
              miscategorized, missing, or duplicated.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {trackedAccounts.map((account) => {
                const bankBalance =
                  account.live_balance !== null ? toNumber(account.live_balance) : null;
                const inAppBalance = balanceByAccountId.get(account.id) ?? null;
                const reviewCount = reviewCountByAccountId.get(account.id) ?? 0;
                const difference =
                  bankBalance !== null && inAppBalance !== null
                    ? Math.round((bankBalance - inAppBalance) * 100) / 100
                    : null;
                const isBalanced = difference !== null && Math.abs(difference) < 1;

                return (
                  <div
                    key={account.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "16px",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>
                      {account.name ?? "Account"}
                      {account.mask ? ` ···${account.mask}` : ""}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "10px",
                        marginTop: "12px",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, color: "#64748b", fontSize: "11px" }}>
                          Bank Balance
                        </p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: "17px" }}>
                          {bankBalance !== null ? formatCurrency(bankBalance) : "--"}
                        </p>
                        <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "10px" }}>
                          {bankBalance !== null
                            ? `as of ${formatDate(account.live_balance_as_of)}`
                            : "not synced yet"}
                        </p>
                      </div>

                      <div>
                        <p style={{ margin: 0, color: "#64748b", fontSize: "11px" }}>
                          In-App Balance
                        </p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: "17px" }}>
                          {inAppBalance !== null ? formatCurrency(inAppBalance) : "Not set"}
                        </p>
                        <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "10px" }}>
                          since {account.starting_balance !== null ? formatDate(account.starting_balance_date) : "--"}
                        </p>
                      </div>
                    </div>

                    {difference !== null ? (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 700,
                          background: isBalanced ? "#dcfce7" : "#fef3c7",
                          color: isBalanced ? "#166534" : "#92400e",
                        }}
                      >
                        {isBalanced
                          ? "Balanced"
                          : `Off by ${formatCurrency(Math.abs(difference))} (${difference > 0 ? "bank is higher" : "in-app is higher"})`}
                      </div>
                    ) : null}

                    {reviewCount > 0 ? (
                      <Link
                        href={`/expenses?status=needs_review&bank_account_id=${account.id}`}
                        style={{
                          display: "inline-block",
                          marginTop: "10px",
                          color: "#9c7a20",
                          fontWeight: 700,
                          fontSize: "12px",
                          textDecoration: "none",
                        }}
                      >
                        {reviewCount} to review →
                      </Link>
                    ) : null}

                    <details style={{ marginTop: "12px" }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          color: "#64748b",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {account.starting_balance !== null
                          ? "Edit starting balance"
                          : "Set starting balance"}
                      </summary>

                      <form
                        action={updateStartingBalance.bind(null, account.id)}
                        style={{
                          display: "grid",
                          gap: "8px",
                          marginTop: "10px",
                        }}
                      >
                        <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                          Balance (from your bank statement)
                          <input
                            name="starting_balance"
                            type="number"
                            step="0.01"
                            defaultValue={
                              account.starting_balance !== null
                                ? toNumber(account.starting_balance)
                                : ""
                            }
                            required
                            style={{
                              display: "block",
                              marginTop: "4px",
                              width: "100%",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              padding: "6px 8px",
                              fontSize: "13px",
                            }}
                          />
                        </label>

                        <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                          As of date
                          <input
                            name="starting_balance_date"
                            type="date"
                            defaultValue={account.starting_balance_date}
                            required
                            style={{
                              display: "block",
                              marginTop: "4px",
                              width: "100%",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              padding: "6px 8px",
                              fontSize: "13px",
                            }}
                          />
                        </label>

                        <button
                          type="submit"
                          style={{
                            marginTop: "2px",
                            border: "1px solid #0f172a",
                            background: "#0f172a",
                            color: "#ffffff",
                            padding: "6px 10px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                      </form>
                    </details>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {accounts.length > 0 ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "22px",
              marginBottom: "32px",
            }}
          >
            <h2 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "20px" }}>
              Tracked Accounts
            </h2>

            <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "14px" }}>
              Some institutions grant Plaid access to every account on
              file with no way to pick just a few -- that doesn&apos;t mean
              they all belong in the business ledger. Only accounts
              checked here feed <code>/expenses</code> on the next sync;
              everything else is ignored even though Plaid can see it.
            </p>

            <form action={updateTrackedAccounts}>
              <div style={{ display: "grid", gap: "2px" }}>
                {accounts.map((account) => (
                  <label
                    key={account.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 8px",
                      borderBottom: "1px solid #f1f5f9",
                      fontSize: "14px",
                      color: "#0f172a",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      name={`include_${account.id}`}
                      defaultChecked={account.include_in_expense_sync}
                    />
                    <span>
                      {account.name ?? "Account"}
                      {account.mask ? ` ···${account.mask}` : ""}
                      {account.subtype ? (
                        <span style={{ color: "#64748b" }}> · {account.subtype}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>

              <button
                type="submit"
                style={{
                  marginTop: "18px",
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#ffffff",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save Tracked Accounts
              </button>
            </form>
          </section>
        ) : null}

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "22px",
          }}
        >
          <h2 style={{ margin: "0 0 18px", color: "#0f172a", fontSize: "20px" }}>
            Recent Sync Activity
          </h2>

          {recentActivity.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
              No syncs run yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {recentActivity.map((entry) => {
                const changes = (entry.changes ?? {}) as {
                  rowsImported?: number;
                  _note?: string;
                  connections?: Array<{
                    institutionName: string | null;
                    depositsImported?: number;
                    skippedZeroAmount?: number;
                    skippedBeforeCutoff?: number;
                    skippedAccountNotTracked?: number;
                    balanceError?: string;
                    error?: string;
                  }>;
                };

                const connections = changes.connections ?? [];
                const totalSkippedCutoff = connections.reduce(
                  (sum, c) => sum + (c.skippedBeforeCutoff ?? 0),
                  0
                );
                const totalSkippedZeroAmount = connections.reduce(
                  (sum, c) => sum + (c.skippedZeroAmount ?? 0),
                  0
                );
                const totalSkippedNotTracked = connections.reduce(
                  (sum, c) => sum + (c.skippedAccountNotTracked ?? 0),
                  0
                );
                const totalDeposits = connections.reduce(
                  (sum, c) => sum + (c.depositsImported ?? 0),
                  0
                );
                const connectionErrors = connections.filter((c) => c.error);
                const balanceErrors = connections.filter((c) => c.balanceError);

                return (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "16px",
                      padding: "14px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {typeof changes.rowsImported === "number"
                          ? `${changes.rowsImported} expense${changes.rowsImported === 1 ? "" : "s"} imported`
                          : "Sync completed"}
                      </div>

                      <div style={{ color: "#64748b", fontSize: "13px", marginTop: "3px" }}>
                        {formatDate(entry.created_at)}
                      </div>

                      {totalDeposits > 0 ? (
                        <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                          {totalDeposits} deposit{totalDeposits === 1 ? "" : "s"} imported --
                          confirm the type on the Journal page.
                        </div>
                      ) : null}

                      {totalSkippedCutoff > 0 || totalSkippedZeroAmount > 0 || totalSkippedNotTracked > 0 ? (
                        <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                          {[
                            totalSkippedCutoff > 0
                              ? `${totalSkippedCutoff} dated before 10/1/2026`
                              : null,
                            totalSkippedZeroAmount > 0
                              ? `${totalSkippedZeroAmount} were $0 placeholders`
                              : null,
                            totalSkippedNotTracked > 0
                              ? `${totalSkippedNotTracked} from an untracked account`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {" -- skipped on purpose."}
                        </div>
                      ) : null}

                      {connectionErrors.length > 0 ? (
                        <div style={{ color: "#991b1b", fontSize: "12px", marginTop: "4px" }}>
                          {connectionErrors
                            .map((c) => `${c.institutionName ?? "Connection"}: ${c.error}`)
                            .join("; ")}
                        </div>
                      ) : null}

                      {balanceErrors.length > 0 ? (
                        <div style={{ color: "#92400e", fontSize: "12px", marginTop: "4px" }}>
                          Live balance not refreshed:{" "}
                          {balanceErrors
                            .map((c) => `${c.institutionName ?? "Connection"}: ${c.balanceError}`)
                            .join("; ")}
                        </div>
                      ) : null}

                      {changes._note ? (
                        <div style={{ color: "#991b1b", fontSize: "12px", marginTop: "4px" }}>
                          {changes._note}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
