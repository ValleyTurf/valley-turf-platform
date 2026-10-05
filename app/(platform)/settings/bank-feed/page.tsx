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
        .select("id, bank_connection_id, name, mask, subtype")
        .in("bank_connection_id", connectionIds)
    : { data: [] as BankAccount[] };

  const accounts = (accountsResult.data as BankAccount[] | null) ?? [];
  const recentActivity = (auditResult.data as AuditLogRow[] | null) ?? [];

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
                };

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
