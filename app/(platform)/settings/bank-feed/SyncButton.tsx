"use client";

// Bespoke rather than reusing settings/jobber/SyncButton.tsx -- that one
// drives a GET endpoint; the Plaid sync route is a POST that takes
// ?apply=true to write (dry-run otherwise), matching
// app/api/expenses/import-quickbooks/route.ts's shape, so this button
// needs its own POST + apply flow instead.
import { useState } from "react";
import { useRouter } from "next/navigation";

type ConnectionSummary = {
  institutionName: string | null;
  added: number;
  depositsImported: number;
  skippedZeroAmount: number;
  skippedBeforeCutoff: number;
  skippedAccountNotTracked: number;
  needsReviewCount: number;
  balanceError?: string;
  error?: string;
};

export default function SyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSync() {
    setIsSyncing(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch("/api/plaid/sync?apply=true", {
        method: "POST",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setIsError(true);
        setMessage(data.error ?? "Sync failed.");
      } else {
        const connections: ConnectionSummary[] = data.summary?.connections ?? [];
        const totalInserted: number = data.summary?.totalInserted ?? 0;
        const totalNeedsReview = connections.reduce(
          (sum, c) => sum + (c.needsReviewCount ?? 0),
          0
        );
        const failed = connections.filter((c) => c.error);

        if (failed.length > 0) {
          setIsError(true);
          setMessage(
            `Synced ${totalInserted} transaction${totalInserted === 1 ? "" : "s"}, but ${failed.length} connection${
              failed.length === 1 ? "" : "s"
            } failed: ${failed.map((c) => c.error).join("; ")}`
          );
        } else {
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
          const balanceErrors = connections.filter((c) => c.balanceError);

          const skippedReasons = [
            totalSkippedCutoff > 0 ? `${totalSkippedCutoff} were dated before 10/1/2026` : null,
            totalSkippedZeroAmount > 0 ? `${totalSkippedZeroAmount} were $0 placeholders` : null,
            totalSkippedNotTracked > 0 ? `${totalSkippedNotTracked} were from an untracked account` : null,
          ].filter((reason): reason is string => reason !== null);

          const skippedNote =
            totalInserted === 0 && skippedReasons.length > 0
              ? ` (Plaid returned transactions, but ${skippedReasons.join(
                  "; "
                )} -- all skipped on purpose.)`
              : "";

          const depositsNote =
            totalDeposits > 0
              ? ` ${totalDeposits} ${totalDeposits === 1 ? "was a deposit" : "were deposits"} -- confirm on the Journal page.`
              : "";

          const balanceNote =
            balanceErrors.length > 0
              ? ` Live balance couldn't be refreshed: ${balanceErrors.map((c) => c.balanceError).join("; ")}`
              : "";

          setMessage(
            `Synced ${totalInserted} new expense${totalInserted === 1 ? "" : "s"}` +
              (totalNeedsReview > 0
                ? ` -- ${totalNeedsReview} need${totalNeedsReview === 1 ? "s" : ""} review on the Expenses page.`
                : ".") +
              depositsNote +
              skippedNote +
              balanceNote
          );
        }
      }
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setIsSyncing(false);
      router.refresh();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSync}
        disabled={disabled || isSyncing}
        style={{
          width: "100%",
          marginTop: "20px",
          border: "1px solid #0f172a",
          background: disabled || isSyncing ? "#f8fafc" : "#0f172a",
          color: disabled || isSyncing ? "#64748b" : "#ffffff",
          padding: "10px 14px",
          borderRadius: "10px",
          fontWeight: 700,
          cursor: disabled || isSyncing ? "not-allowed" : "pointer",
        }}
      >
        {isSyncing ? "Syncing..." : "Sync Now"}
      </button>

      {message ? (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            fontSize: "13px",
            background: isError ? "#fef2f2" : "#f0fdf4",
            color: isError ? "#991b1b" : "#166534",
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
