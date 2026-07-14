"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncButtonProps = {
  syncType: string;
  endpoint: string;
};

export default function SyncButton({
  syncType,
  endpoint,
}: SyncButtonProps) {
  const router = useRouter();

  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function runSync() {
    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.alreadyRunning) {
          setMessage(
            `${syncType} sync is already running.`
          );

          return;
        }

        throw new Error(
          result.error ||
            result.message ||
            `${syncType} sync failed.`
        );
      }

      setMessage(
        result.message ||
          `${syncType} sync completed successfully.`
      );

      router.refresh();
    } catch (error) {
      console.error(
        `${syncType} sync failed:`,
        error
      );

      setIsError(true);

      setMessage(
        error instanceof Error
          ? error.message
          : `${syncType} sync failed.`
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div
      style={{
        marginTop: "20px",
      }}
    >
      <button
        type="button"
        onClick={runSync}
        disabled={isSyncing}
        style={{
          width: "100%",
          border: "none",
          background: isSyncing
            ? "#94a3b8"
            : "#0f172a",
          color: "#ffffff",
          padding: "11px 14px",
          borderRadius: "10px",
          fontWeight: 700,
          cursor: isSyncing
            ? "wait"
            : "pointer",
        }}
      >
        {isSyncing
          ? "Syncing..."
          : "Sync Now"}
      </button>

      {message ? (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: isError
              ? "#fef2f2"
              : "#f0fdf4",
            color: isError
              ? "#991b1b"
              : "#166534",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}