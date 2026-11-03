export const dynamic = "force-dynamic";
export const revalidate = 0;

// New top-level report (Ryan, 2026-11-03): "Rather than having this in
// the settings, should there be a Reconciliation report that shows the
// feed information and then I can click on the account and work to
// reconciliate each of them?" Settings > Bank Feed stays "plumbing"
// (connect, pick which accounts sync, trigger a sync); this is the
// actual reviewable report -- Bank Balance vs. In-App Balance per
// tracked account, a starting-balance anchor editor, and a link into
// that account's full transaction register
// (app/(platform)/reconciliation/[accountId]) to work through it.
import Link from "next/link";
import { getTrackedAccountsWithBalances } from "@/lib/bankReconciliation";
import { formatCurrencyPrecise as formatCurrency } from "@/lib/format";
import StartingBalanceForm from "./StartingBalanceForm";

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

export default async function ReconciliationPage() {
  const accounts = await getTrackedAccountsWithBalances();

  return (
    <main
      className="px-4 py-6 sm:p-8"
      style={{ minHeight: "100vh", background: "#f8fafc" }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "32px", color: "#0f172a" }}>
            Reconciliation
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
            Bank Balance is Plaid&apos;s own figure, cached each time a
            sync runs from{" "}
            <Link href="/settings/bank-feed" style={{ color: "#174734", fontWeight: 600 }}>
              Settings &gt; Bank Feed
            </Link>
            . In-App Balance is this ledger&apos;s running total from the
            starting balance below -- the two should match; a gap
            usually means a transaction is miscategorized, missing, or
            duplicated. Click an account to work through its
            transactions.
          </p>
        </div>

        {accounts.length === 0 ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "20px" }}>
              No tracked accounts yet
            </h2>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
              Connect a bank account and mark which of its accounts
              should feed the ledger first.
            </p>
            <Link
              href="/settings/bank-feed"
              style={{
                display: "inline-block",
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#ffffff",
                padding: "10px 18px",
                borderRadius: "10px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Go to Settings &gt; Bank Feed
            </Link>
          </section>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "18px",
            }}
          >
            {accounts.map((account) => {
              const isBalanced =
                account.difference !== null && Math.abs(account.difference) < 1;

              return (
                <div
                  key={account.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>
                      {account.name ?? "Account"}
                      {account.mask ? ` ···${account.mask}` : ""}
                    </div>
                  </div>
                  {account.institutionName ? (
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "12px" }}>
                      {account.institutionName}
                    </p>
                  ) : null}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                      marginTop: "14px",
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, color: "#64748b", fontSize: "11px" }}>
                        Bank Balance
                      </p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: "19px" }}>
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
                      <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: "19px" }}>
                        {account.inAppBalance !== null ? formatCurrency(account.inAppBalance) : "Not set"}
                      </p>
                      <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "10px" }}>
                        {account.startingBalance !== null
                          ? `since ${formatDate(account.startingBalanceDate)}`
                          : "--"}
                      </p>
                    </div>
                  </div>

                  {account.difference !== null ? (
                    <div
                      style={{
                        marginTop: "14px",
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
                        : `Off by ${formatCurrency(Math.abs(account.difference))} (${account.difference > 0 ? "bank is higher" : "in-app is higher"})`}
                    </div>
                  ) : null}

                  <div style={{ marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <Link
                      href={`/reconciliation/${account.id}`}
                      style={{
                        color: "#174734",
                        fontWeight: 700,
                        fontSize: "13px",
                        textDecoration: "none",
                      }}
                    >
                      Work this account →
                    </Link>

                    {account.reviewCount > 0 ? (
                      <span
                        style={{
                          color: "#9c7a20",
                          fontWeight: 700,
                          fontSize: "12px",
                        }}
                      >
                        {account.reviewCount} to review
                      </span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <StartingBalanceForm
                      accountId={account.id}
                      startingBalance={account.startingBalance}
                      startingBalanceDate={account.startingBalanceDate}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
