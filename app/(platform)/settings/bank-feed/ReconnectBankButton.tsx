"use client";

// Re-authorizes an existing bank connection (Plaid "update mode") after the
// bank revoked or expired it. Opens Plaid Link with a token tied to the
// existing connection, then marks it active again -- no new connection or
// duplicate accounts are created.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

export default function ReconnectBankButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLinkToken() {
      setIsBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
          cache: "no-store",
        });
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || data.error) {
          setError(data.error ?? "Failed to start the reconnect.");
        } else {
          setLinkToken(data.linkToken);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to start the reconnect.");
      } finally {
        if (!cancelled) setIsBusy(false);
      }
    }

    fetchLinkToken();

    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const onSuccess = useCallback(async () => {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/plaid/reconnect-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error ?? "Reconnected, but could not update the connection.");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconnected, but could not update the connection.");
    } finally {
      setIsBusy(false);
    }
  }, [connectionId, router]);

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess });

  const disabled = !ready || !linkToken || isBusy;

  return (
    <div style={{ marginBottom: "10px" }}>
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        style={{
          border: "1px solid #991b1b",
          background: disabled ? "#fef2f2" : "#991b1b",
          color: disabled ? "#991b1b" : "#ffffff",
          padding: "10px 18px",
          borderRadius: "10px",
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {isBusy ? "Working..." : "Reconnect bank"}
      </button>

      {error ? (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            fontSize: "13px",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
